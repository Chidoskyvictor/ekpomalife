import { pool } from '../db.js'
import { createId } from '../ids.js'
import {
  CATEGORIES,
  COLORS,
  COMMENTS_PER_HOUR,
  COMMENT_MAX,
  POSTS_PER_HOUR,
  POST_MAX,
  REPORTS_TO_HIDE,
  WALLS_PER_DAY,
  cleanText,
  looksLikeContactInfo,
  makeInviteCode,
  toPublicComment,
  toPublicPost,
  type CommentRow,
  type PostRow,
  type ReportReason,
  type WallKind,
} from './anonymous-rules.js'

/*
 * Anonymous data layer. user_id is read here only to (a) tell an author their own items,
 * (b) apply blocks / rate limits / bans, (c) show admins who wrote a reported item.
 * Everything students get goes through toPublicPost / toPublicComment, which drop it.
 */

export type AnonFail = { ok: false; status: number; code: string; error: string }
const fail = (status: number, code: string, error: string): AnonFail => ({ ok: false, status, code, error })

export const FEED_PAGE = 20

const SCORE_SQL = `(p.like_count + 2 * p.comment_count + 1) / POWER(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600 + 2, 1.5)`
const POST_COLS = `p.id, p.user_id, p.community_id, c.name AS community_name, p.body, p.color, p.category,
  p.like_count, p.comment_count, p.status, p.created_at,
  EXISTS (SELECT 1 FROM anon_likes l WHERE l.post_id = p.id AND l.user_id = $1) AS liked`

async function standing(userId: string) {
  const found = await pool.query<{ warnings: number; banned: boolean }>(
    `SELECT warnings, banned FROM anon_user_flags WHERE user_id = $1`,
    [userId],
  )
  return found.rows[0] ?? { warnings: 0, banned: false }
}

/* ---------------- feed ---------------- */

export async function listFeed(
  userId: string,
  opts: { sort: 'new' | 'trending'; category?: string; communityId?: string | null; before?: string },
) {
  const params: unknown[] = [userId]
  const where = [
    `p.status = 'ok'`,
    `NOT EXISTS (SELECT 1 FROM anon_hidden h WHERE h.post_id = p.id AND h.user_id = $1)`,
    `NOT EXISTS (SELECT 1 FROM anon_blocks b WHERE b.blocker_id = $1 AND b.blocked_id = p.user_id)`,
  ]
  if (opts.communityId) {
    params.push(opts.communityId)
    where.push(`p.community_id = $${params.length}`)
  } else {
    where.push(`p.community_id IS NULL`) // wall posts never reach the general feed
  }
  if (opts.category && (CATEGORIES as readonly string[]).includes(opts.category)) {
    params.push(opts.category)
    where.push(`p.category = $${params.length}`)
  }
  let order = `p.created_at DESC`
  if (opts.sort === 'trending') {
    where.push(`p.created_at > NOW() - INTERVAL '7 days'`)
    order = `${SCORE_SQL} DESC, p.created_at DESC`
  } else if (opts.before) {
    params.push(opts.before)
    where.push(`p.created_at < $${params.length}::timestamptz`)
  }
  const found = await pool.query<PostRow>(
    `SELECT ${POST_COLS} FROM anon_posts p LEFT JOIN anon_communities c ON c.id = p.community_id
     WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${opts.sort === 'trending' ? 40 : FEED_PAGE}`,
    params,
  )
  const you = await standing(userId)
  return { ok: true as const, posts: found.rows.map((r) => toPublicPost(r, userId)), you }
}

export async function getPost(userId: string, postId: string) {
  const found = await pool.query<PostRow>(
    `SELECT ${POST_COLS} FROM anon_posts p LEFT JOIN anon_communities c ON c.id = p.community_id
     WHERE p.id = $2 AND (p.status = 'ok' OR p.user_id = $1)`,
    [userId, postId],
  )
  const row = found.rows[0]
  if (!row) return fail(404, 'NOT_FOUND', 'That post is gone.')
  return { ok: true as const, post: toPublicPost(row, userId) }
}

/** Public share card. Text and counts only, whoever asks. */
export async function getShare(postId: string) {
  const found = await pool.query<PostRow>(
    `SELECT p.id, p.user_id, p.community_id, NULL AS community_name, p.body, p.color, p.category,
            p.like_count, p.comment_count, p.status, p.created_at
     FROM anon_posts p WHERE p.id = $1 AND p.status = 'ok'`,
    [postId],
  )
  const row = found.rows[0]
  if (!row) return fail(404, 'NOT_FOUND', 'That post is gone.')
  const { body, color, category, likes, comments } = toPublicPost(row, '')
  return { ok: true as const, post: { id: row.id, body, color, category, likes, comments } }
}

export async function listMine(userId: string, tab: 'posts' | 'comments' | 'likes') {
  if (tab === 'comments') {
    const found = await pool.query<CommentRow & { post_body: string }>(
      `SELECT cm.id, cm.post_id, cm.user_id, cm.body, cm.status, cm.created_at, LEFT(p.body, 80) AS post_body
       FROM anon_comments cm JOIN anon_posts p ON p.id = cm.post_id
       WHERE cm.user_id = $1 ORDER BY cm.created_at DESC LIMIT 50`,
      [userId],
    )
    return {
      ok: true as const,
      comments: found.rows.map((r) => ({ ...toPublicComment(r, userId), postPreview: r.post_body })),
    }
  }
  const join =
    tab === 'likes'
      ? `JOIN anon_likes ml ON ml.post_id = p.id AND ml.user_id = $1`
      : ``
  const own = tab === 'likes' ? `p.status = 'ok'` : `p.user_id = $1`
  const found = await pool.query<PostRow>(
    `SELECT ${POST_COLS} FROM anon_posts p LEFT JOIN anon_communities c ON c.id = p.community_id ${join}
     WHERE ${own} ORDER BY p.created_at DESC LIMIT 50`,
    [userId],
  )
  return { ok: true as const, posts: found.rows.map((r) => toPublicPost(r, userId)) }
}

/* ---------------- writing ---------------- */

async function memberOf(userId: string, communityId: string) {
  const found = await pool.query(`SELECT 1 FROM anon_members WHERE community_id = $1 AND user_id = $2`, [communityId, userId])
  return (found.rowCount ?? 0) > 0
}

export async function createPost(
  userId: string,
  input: { body: string; color: string; category: string; communityId?: string | null },
) {
  const body = cleanText(input.body)
  if (!body) return fail(400, 'EMPTY', 'Write something first.')
  if (body.length > POST_MAX) return fail(400, 'TOO_LONG', `Keep it under ${POST_MAX} characters.`)
  if (!(COLORS as readonly string[]).includes(input.color)) return fail(400, 'BAD_COLOR', 'Pick a card colour.')
  if (!(CATEGORIES as readonly string[]).includes(input.category)) return fail(400, 'BAD_CATEGORY', 'Pick a category.')
  if (looksLikeContactInfo(body)) {
    return fail(400, 'CONTACT_INFO', "Don't put phone numbers, emails or @usernames in a post.")
  }
  if ((await standing(userId)).banned) return fail(403, 'BANNED', 'You can no longer post in Anonymous.')
  if (input.communityId) {
    if (!(await memberOf(userId, input.communityId))) return fail(403, 'NOT_MEMBER', 'Join this wall to post on it.')
  }
  const recent = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM anon_posts WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
    [userId],
  )
  if ((recent.rows[0]?.n ?? 0) >= POSTS_PER_HOUR) {
    return fail(429, 'SLOW_DOWN', `You can post ${POSTS_PER_HOUR} times an hour. Try again later.`)
  }
  const id = createId()
  await pool.query(
    `INSERT INTO anon_posts (id, user_id, community_id, body, color, category) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, userId, input.communityId ?? null, body, input.color, input.category],
  )
  return getPost(userId, id)
}

export async function toggleLike(userId: string, postId: string) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const post = await client.query(`SELECT 1 FROM anon_posts WHERE id = $1 AND status = 'ok'`, [postId])
    if (!post.rowCount) {
      await client.query('ROLLBACK')
      return fail(404, 'NOT_FOUND', 'That post is gone.')
    }
    const removed = await client.query(`DELETE FROM anon_likes WHERE post_id = $1 AND user_id = $2`, [postId, userId])
    let liked = false
    let delta = 0
    if (removed.rowCount) delta = -1
    else {
      // Primary key (post_id, user_id): a double tap can only ever add one row
      const added = await client.query(
        `INSERT INTO anon_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [postId, userId],
      )
      if (added.rowCount) {
        delta = 1
        liked = true
      } else liked = true
    }
    const updated = await client.query<{ like_count: number }>(
      `UPDATE anon_posts SET like_count = GREATEST(like_count + $2, 0) WHERE id = $1 RETURNING like_count`,
      [postId, delta],
    )
    await client.query('COMMIT')
    return { ok: true as const, liked, likes: updated.rows[0]?.like_count ?? 0 }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function listComments(userId: string, postId: string) {
  const post = await getPost(userId, postId)
  if (!post.ok) return post
  const found = await pool.query<CommentRow>(
    `SELECT cm.id, cm.post_id, cm.user_id, cm.body, cm.status, cm.created_at FROM anon_comments cm
     WHERE cm.post_id = $2 AND (cm.status = 'ok' OR cm.user_id = $1)
       AND NOT EXISTS (SELECT 1 FROM anon_blocks b WHERE b.blocker_id = $1 AND b.blocked_id = cm.user_id)
     ORDER BY cm.created_at ASC LIMIT 200`,
    [userId, postId],
  )
  return { ok: true as const, comments: found.rows.map((r) => toPublicComment(r, userId)) }
}

export async function addComment(userId: string, postId: string, text: string) {
  const body = cleanText(text)
  if (!body) return fail(400, 'EMPTY', 'Write something first.')
  if (body.length > COMMENT_MAX) return fail(400, 'TOO_LONG', `Keep it under ${COMMENT_MAX} characters.`)
  if (looksLikeContactInfo(body)) {
    return fail(400, 'CONTACT_INFO', "Don't put phone numbers, emails or @usernames in a comment.")
  }
  if ((await standing(userId)).banned) return fail(403, 'BANNED', 'You can no longer post in Anonymous.')
  const post = await pool.query<{ community_id: string | null }>(
    `SELECT community_id FROM anon_posts WHERE id = $1 AND status = 'ok'`,
    [postId],
  )
  if (!post.rows[0]) return fail(404, 'NOT_FOUND', 'That post is gone.')
  const wall = post.rows[0].community_id
  if (wall && !(await memberOf(userId, wall))) return fail(403, 'NOT_MEMBER', 'Join this wall to comment.')
  const recent = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM anon_comments WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
    [userId],
  )
  if ((recent.rows[0]?.n ?? 0) >= COMMENTS_PER_HOUR) {
    return fail(429, 'SLOW_DOWN', 'Easy there. Try commenting again in a while.')
  }
  const id = createId()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`INSERT INTO anon_comments (id, post_id, user_id, body) VALUES ($1, $2, $3, $4)`, [id, postId, userId, body])
    await client.query(`UPDATE anon_posts SET comment_count = comment_count + 1 WHERE id = $1`, [postId])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
  const row = await pool.query<CommentRow>(
    `SELECT id, post_id, user_id, body, status, created_at FROM anon_comments WHERE id = $1`,
    [id],
  )
  return { ok: true as const, comment: toPublicComment(row.rows[0], userId) }
}

/* ---------------- safety ---------------- */

export async function report(userId: string, type: 'post' | 'comment', targetId: string, reason: ReportReason) {
  const table = type === 'post' ? 'anon_posts' : 'anon_comments'
  const target = await pool.query<{ user_id: string; status: string }>(
    `SELECT user_id, status FROM ${table} WHERE id = $1`,
    [targetId],
  )
  const row = target.rows[0]
  if (!row || row.status === 'removed') return fail(404, 'NOT_FOUND', 'That is already gone.')
  if (row.user_id === userId) return fail(400, 'OWN_ITEM', "You can't report your own post.")
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // UNIQUE (target_type, target_id, user_id): one report per person per item
    const added = await client.query(
      `INSERT INTO anon_reports (id, target_type, target_id, user_id, reason) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (target_type, target_id, user_id) DO NOTHING`,
      [createId(), type, targetId, userId, reason],
    )
    if (!added.rowCount) {
      await client.query('ROLLBACK')
      return { ok: true as const, already: true }
    }
    await client.query(
      `UPDATE ${table} SET report_count = report_count + 1,
         status = CASE WHEN status = 'ok' AND NOT cleared AND report_count + 1 >= $2 THEN 'hidden' ELSE status END
       WHERE id = $1`,
      [targetId, REPORTS_TO_HIDE],
    )
    await client.query('COMMIT')
    return { ok: true as const, already: false }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function hidePost(userId: string, postId: string) {
  const found = await pool.query(`SELECT 1 FROM anon_posts WHERE id = $1`, [postId])
  if (!found.rowCount) return fail(404, 'NOT_FOUND', 'That post is gone.')
  await pool.query(`INSERT INTO anon_hidden (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, postId])
  return { ok: true as const }
}

/** Block whoever wrote this post or comment. The caller never learns who. */
export async function blockAuthor(userId: string, type: 'post' | 'comment', targetId: string) {
  const table = type === 'post' ? 'anon_posts' : 'anon_comments'
  const found = await pool.query<{ user_id: string }>(`SELECT user_id FROM ${table} WHERE id = $1`, [targetId])
  const author = found.rows[0]?.user_id
  if (!author) return fail(404, 'NOT_FOUND', 'That is already gone.')
  if (author === userId) return fail(400, 'OWN_ITEM', "That's you.")
  await pool.query(`INSERT INTO anon_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, author])
  return { ok: true as const }
}

/* ---------------- walls ---------------- */

type WallRow = {
  id: string
  name: string
  description: string
  kind: WallKind
  invite_code: string
  members: number
  joined: boolean
  owner: boolean
  posts: number
}

function toWall(r: WallRow) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    kind: r.kind,
    members: r.members,
    posts: r.posts,
    joined: r.joined,
    owner: r.owner,
    // Only members get the code, so a wall can be shared on purpose
    inviteCode: r.joined ? r.invite_code : null,
  }
}

const WALL_COLS = `c.id, c.name, c.description, c.kind, c.invite_code,
  (SELECT COUNT(*)::int FROM anon_members m WHERE m.community_id = c.id) AS members,
  (SELECT COUNT(*)::int FROM anon_posts p WHERE p.community_id = c.id AND p.status = 'ok') AS posts,
  EXISTS (SELECT 1 FROM anon_members m WHERE m.community_id = c.id AND m.user_id = $1) AS joined,
  (c.created_by = $1) AS owner`

export async function listWalls(userId: string) {
  const found = await pool.query<WallRow>(
    `SELECT ${WALL_COLS} FROM anon_communities c ORDER BY members DESC, c.created_at DESC LIMIT 100`,
    [userId],
  )
  return { ok: true as const, walls: found.rows.map(toWall) }
}

async function getWall(userId: string, id: string) {
  const found = await pool.query<WallRow>(`SELECT ${WALL_COLS} FROM anon_communities c WHERE c.id = $2`, [userId, id])
  return found.rows[0] ? toWall(found.rows[0]) : null
}

export async function createWall(userId: string, input: { name: string; description: string; kind: WallKind }) {
  const name = input.name.replace(/\s+/g, ' ').trim()
  const description = input.description.trim()
  if (name.length < 3 || name.length > 40) return fail(400, 'BAD_NAME', 'Give the wall a name of 3 to 40 characters.')
  if (description.length > 140) return fail(400, 'BAD_DESC', 'Keep the description under 140 characters.')
  if (looksLikeContactInfo(name) || looksLikeContactInfo(description)) {
    return fail(400, 'CONTACT_INFO', "Don't put phone numbers, emails or @usernames here.")
  }
  if ((await standing(userId)).banned) return fail(403, 'BANNED', 'You can no longer post in Anonymous.')
  const recent = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM anon_communities WHERE created_by = $1 AND created_at > NOW() - INTERVAL '1 day'`,
    [userId],
  )
  if ((recent.rows[0]?.n ?? 0) >= WALLS_PER_DAY) return fail(429, 'SLOW_DOWN', 'You can start 3 walls a day.')
  const id = createId()
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await pool.query(
        `INSERT INTO anon_communities (id, name, description, kind, invite_code, created_by) VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, name, description, input.kind, makeInviteCode(), userId],
      )
      await pool.query(`INSERT INTO anon_members (community_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, userId])
      return { ok: true as const, wall: await getWall(userId, id) }
    } catch (error) {
      const e = error as { code?: string; constraint?: string }
      if (e.code === '23505' && e.constraint === 'anon_communities_name_idx') {
        return fail(409, 'NAME_TAKEN', 'A wall with that name already exists. Find it in the list.')
      }
      if (e.code !== '23505') throw error // invite code clash: try another
    }
  }
  return fail(500, 'RETRY', 'Could not make the wall. Try again.')
}

export async function joinWall(userId: string, id: string) {
  const wall = await getWall(userId, id)
  if (!wall) return fail(404, 'NOT_FOUND', 'That wall is gone.')
  await pool.query(`INSERT INTO anon_members (community_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, userId])
  return { ok: true as const, wall: await getWall(userId, id) }
}

export async function joinWallByCode(userId: string, code: string) {
  const found = await pool.query<{ id: string }>(`SELECT id FROM anon_communities WHERE invite_code = $1`, [code])
  if (!found.rows[0]) return fail(404, 'NOT_FOUND', 'No wall has that code.')
  return joinWall(userId, found.rows[0].id)
}

export async function leaveWall(userId: string, id: string) {
  await pool.query(`DELETE FROM anon_members WHERE community_id = $1 AND user_id = $2`, [id, userId])
  return { ok: true as const }
}

/* ---------------- admin ---------------- */

export type AdminAnonRow = {
  type: 'post' | 'comment'
  id: string
  body: string
  status: string
  reportCount: number
  reasons: string[]
  /** Admins can see who wrote it; students never can */
  author: { id: string; username: string; warnings: number; banned: boolean }
  wall: string | null
  lastReportAt: string
}

export async function listAnonReports() {
  const found = await pool.query<{
    type: 'post' | 'comment'
    id: string
    body: string
    status: string
    report_count: number
    reasons: string[]
    user_id: string
    username: string
    warnings: number | null
    banned: boolean | null
    wall: string | null
    last_report_at: Date
  }>(
    `SELECT r.target_type AS type, r.target_id AS id,
            COALESCE(p.body, cm.body) AS body, COALESCE(p.status, cm.status) AS status,
            COALESCE(p.report_count, cm.report_count) AS report_count,
            ARRAY_AGG(r.reason ORDER BY r.created_at) AS reasons,
            u.id AS user_id, u.username, f.warnings, f.banned, wc.name AS wall,
            MAX(r.created_at) AS last_report_at
     FROM anon_reports r
     LEFT JOIN anon_posts p ON r.target_type = 'post' AND p.id = r.target_id
     LEFT JOIN anon_comments cm ON r.target_type = 'comment' AND cm.id = r.target_id
     LEFT JOIN anon_communities wc ON wc.id = p.community_id
     JOIN users u ON u.id = COALESCE(p.user_id, cm.user_id)
     LEFT JOIN anon_user_flags f ON f.user_id = u.id
     WHERE NOT r.resolved AND COALESCE(p.id, cm.id) IS NOT NULL
     GROUP BY r.target_type, r.target_id, p.body, cm.body, p.status, cm.status, p.report_count, cm.report_count,
              u.id, u.username, f.warnings, f.banned, wc.name
     ORDER BY (COALESCE(p.status, cm.status) = 'hidden') DESC, MAX(r.created_at) DESC
     LIMIT 100`,
  )
  const reports: AdminAnonRow[] = found.rows.map((r) => ({
    type: r.type,
    id: r.id,
    body: r.body,
    status: r.status,
    reportCount: r.report_count,
    reasons: r.reasons,
    author: { id: r.user_id, username: r.username, warnings: r.warnings ?? 0, banned: Boolean(r.banned) },
    wall: r.wall,
    lastReportAt: r.last_report_at.toISOString(),
  }))
  return { ok: true as const, reports }
}

export type AdminAnonAction = 'dismiss' | 'remove' | 'warn' | 'ban'

/** dismiss: reports were wrong, show it again. remove: take it down. warn / ban: take it down and act on the author. */
export async function adminAnonAction(type: 'post' | 'comment', id: string, action: AdminAnonAction) {
  const table = type === 'post' ? 'anon_posts' : 'anon_comments'
  const found = await pool.query<{ user_id: string }>(`SELECT user_id FROM ${table} WHERE id = $1`, [id])
  const author = found.rows[0]?.user_id
  if (!author) return fail(404, 'NOT_FOUND', 'That item is gone.')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (action === 'dismiss') {
      await client.query(`UPDATE ${table} SET status = 'ok', cleared = TRUE, report_count = 0 WHERE id = $1 AND status <> 'removed'`, [id])
    } else {
      await client.query(`UPDATE ${table} SET status = 'removed' WHERE id = $1`, [id])
      if (action === 'warn') {
        await client.query(
          `INSERT INTO anon_user_flags (user_id, warnings, warned_at) VALUES ($1, 1, NOW())
           ON CONFLICT (user_id) DO UPDATE SET warnings = anon_user_flags.warnings + 1, warned_at = NOW()`,
          [author],
        )
      }
      if (action === 'ban') {
        await client.query(
          `INSERT INTO anon_user_flags (user_id, banned, banned_at) VALUES ($1, TRUE, NOW())
           ON CONFLICT (user_id) DO UPDATE SET banned = TRUE, banned_at = NOW()`,
          [author],
        )
      }
    }
    await client.query(`UPDATE anon_reports SET resolved = TRUE WHERE target_type = $1 AND target_id = $2`, [type, id])
    await client.query('COMMIT')
    return { ok: true as const }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
