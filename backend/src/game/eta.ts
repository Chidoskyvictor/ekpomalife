import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import { applyCash } from './game-state.js'
import {
  NPCS,
  cryptoPost,
  giveawayPost,
  landPost,
  lifestylePost,
  motivationPost,
  npcById,
  rollPrize,
  type Npc,
} from './eta-npcs.js'
import { BUSINESSES, LAND_AREAS } from './invest.js'

/** ẹta — Ekpoma's own feed. Posts are "gists" (280 characters). */

export const POST_MAX = 280
export const POSTS_PER_MIN = 10
const PAGE = 30
/** Giveaway length in real minutes, and the most NPCs may give away per real day. */
const GIVEAWAY_MINUTES = 90
const GIVEAWAY_DAILY_BUDGET = 20_000_000
/** NPC scheduler runs at most this often (real ms). */
const NPC_TICK_MS = 4 * 60_000

type Fail = { ok: false; status: number; code: string; error: string }
const fail = (status: number, code: string, error: string): Fail => ({ ok: false, status, code, error })

export type EtaAuthor = {
  kind: 'user' | 'npc'
  id: string
  name: string
  handle: string
  avatar: { color: string; emoji: string | null }
  /** Gold badge + "NPC" label */
  npc: boolean
}

export type EtaPost = {
  id: string
  author: EtaAuthor
  body: string
  tags: string[]
  likes: number
  liked: boolean
  replies: number
  replyTo: string | null
  createdAt: string
  mine: boolean
  giveaway: { prize: number; endsAt: string; settled: boolean; winnerPostId: string | null } | null
}

// —— Tags: $TICKER → coin:ticker, place names → area:id / biz:id ——

const PLACE_TAGS = [
  ...LAND_AREAS.map((area) => ({ tag: `area:${area.id}`, words: [area.name.toLowerCase()] })),
  ...BUSINESSES.filter((b) => b.type === 'stake').map((b) => ({
    tag: `biz:${b.id}`,
    words: [b.name.split(' ·')[0]!.toLowerCase()],
  })),
]

export function extractTags(body: string) {
  const tags = new Set<string>()
  for (const match of body.matchAll(/\$([A-Za-z][A-Za-z0-9]{1,9})\b/g)) tags.add(`coin:${match[1]!.toLowerCase()}`)
  const lower = body.toLowerCase()
  for (const place of PLACE_TAGS) if (place.words.some((word) => lower.includes(word))) tags.add(place.tag)
  return [...tags].slice(0, 8)
}

// —— Reading ——

type PostRow = {
  id: string
  author_user_id: string | null
  author_npc_id: string | null
  body: string
  tags: string[]
  reply_to: string | null
  like_count: number
  reply_count: number
  giveaway_prize: string | null
  giveaway_ends_at: Date | null
  giveaway_settled: boolean
  giveaway_winner_post: string | null
  created_at: Date
  username: string | null
  display_name: string | null
  avatar_color: string | null
  avatar_emoji: string | null
  liked: boolean
}

const POST_SELECT = (viewer: string) => `
  SELECT p.id::text, p.author_user_id, p.author_npc_id, p.body, p.tags, p.reply_to::text, p.like_count, p.reply_count,
         p.giveaway_prize::text, p.giveaway_ends_at, p.giveaway_settled, p.giveaway_winner_post::text, p.created_at,
         u.username, u.username AS display_name, pp.avatar_color, pp.avatar_emoji,
         EXISTS (SELECT 1 FROM eta_likes l WHERE l.post_id = p.id AND l.user_id = ${viewer}) AS liked
  FROM eta_posts p
  LEFT JOIN users u ON u.id = p.author_user_id
  LEFT JOIN player_profiles pp ON pp.user_id = p.author_user_id`

const NOT_REPORTED = (viewer: string) =>
  `NOT EXISTS (SELECT 1 FROM eta_reports r WHERE r.post_id = p.id AND r.reporter_id = ${viewer})`

function npcAuthor(npc: Npc): EtaAuthor {
  return { kind: 'npc', id: npc.id, name: npc.name, handle: npc.handle, avatar: { color: npc.color, emoji: npc.emoji }, npc: true }
}

function toPost(row: PostRow, viewerId: string): EtaPost {
  const npc = row.author_npc_id ? npcById(row.author_npc_id) : null
  const author: EtaAuthor = npc
    ? npcAuthor(npc)
    : {
        kind: 'user',
        id: row.author_user_id ?? '',
        name: row.display_name ?? 'Player',
        handle: row.username ?? 'player',
        avatar: { color: row.avatar_color ?? '#3d9ad6', emoji: row.avatar_emoji },
        npc: false,
      }
  return {
    id: row.id,
    author,
    body: row.body,
    tags: row.tags ?? [],
    likes: row.like_count,
    liked: row.liked,
    replies: row.reply_count,
    replyTo: row.reply_to,
    createdAt: row.created_at.toISOString(),
    mine: Boolean(row.author_user_id && row.author_user_id === viewerId),
    giveaway: row.giveaway_prize
      ? {
          prize: Number(row.giveaway_prize),
          endsAt: row.giveaway_ends_at!.toISOString(),
          settled: row.giveaway_settled,
          winnerPostId: row.giveaway_winner_post,
        }
      : null,
  }
}

export type FeedTab = 'foryou' | 'money' | 'following'

export async function getFeed(viewerId: string, tab: FeedTab, before?: number) {
  void runNpcs() // keep NPCs posting and giveaways paid; never blocks the feed
  const params: unknown[] = [viewerId, PAGE]
  const where = ['p.reply_to IS NULL', NOT_REPORTED('$1')]
  if (before) {
    params.push(before)
    where.push(`p.id < $${params.length}`)
  }
  if (tab === 'money') where.push(`(cardinality(p.tags) > 0 OR p.giveaway_prize IS NOT NULL)`)
  if (tab === 'following') {
    where.push(`EXISTS (SELECT 1 FROM eta_follows f WHERE f.follower_id = $1 AND (
      (f.target_kind = 'user' AND f.target_id = p.author_user_id) OR (f.target_kind = 'npc' AND f.target_id = p.author_npc_id)))`)
  }
  const rows = await pool.query<PostRow>(
    `${POST_SELECT('$1')} WHERE ${where.join(' AND ')} ORDER BY p.id DESC LIMIT $2`,
    params,
  )
  const posts = rows.rows.map((row) => toPost(row, viewerId))
  // An open giveaway sits on top of For you
  if (tab === 'foryou' && !before) {
    const live = await pool.query<PostRow>(
      `${POST_SELECT('$1')} WHERE p.giveaway_prize IS NOT NULL AND p.giveaway_settled = FALSE AND p.giveaway_ends_at > NOW()
       ORDER BY p.id DESC LIMIT 1`,
      [viewerId],
    )
    const pinned = live.rows[0] ? toPost(live.rows[0], viewerId) : null
    if (pinned) return { posts: [pinned, ...posts.filter((p) => p.id !== pinned.id)], hasMore: posts.length === PAGE }
  }
  return { posts, hasMore: posts.length === PAGE }
}

export async function getThread(viewerId: string, postId: number) {
  const post = await pool.query<PostRow>(`${POST_SELECT('$1')} WHERE p.id = $2`, [viewerId, postId])
  if (!post.rows[0]) return fail(404, 'NOT_FOUND', 'That gist is gone.')
  const replies = await pool.query<PostRow>(
    `${POST_SELECT('$1')} WHERE p.reply_to = $2 AND ${NOT_REPORTED('$1')} ORDER BY p.like_count DESC, p.id ASC LIMIT 100`,
    [viewerId, postId],
  )
  return { ok: true as const, post: toPost(post.rows[0], viewerId), replies: replies.rows.map((r) => toPost(r, viewerId)) }
}

/** Gists with a tag, e.g. "coin:jollof" for a coin's community. */
export async function getTagged(viewerId: string, tag: string) {
  const rows = await pool.query<PostRow>(
    `${POST_SELECT('$1')} WHERE $2 = ANY(p.tags) AND ${NOT_REPORTED('$1')} ORDER BY p.id DESC LIMIT 30`,
    [viewerId, tag.toLowerCase()],
  )
  return rows.rows.map((row) => toPost(row, viewerId))
}

// —— Writing ——

export async function createPost(userId: string, rawBody: string, replyTo?: number) {
  const body = rawBody.replace(/\r\n/g, '\n').trim()
  if (!body) return fail(400, 'EMPTY', 'Write something first.')
  if (body.length > POST_MAX) return fail(400, 'TOO_LONG', `Keep it under ${POST_MAX} characters.`)
  const recent = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM eta_posts WHERE author_user_id = $1 AND created_at > NOW() - INTERVAL '1 minute'`,
    [userId],
  )
  if ((recent.rows[0]?.n ?? 0) >= POSTS_PER_MIN) return fail(429, 'SLOW_DOWN', 'Easy — wait a moment before posting again.')
  if (replyTo) {
    const parent = await pool.query<{ giveaway_ends_at: Date | null; giveaway_settled: boolean }>(
      `SELECT giveaway_ends_at, giveaway_settled FROM eta_posts WHERE id = $1`,
      [replyTo],
    )
    if (!parent.rows[0]) return fail(404, 'NOT_FOUND', 'That gist is gone.')
  }
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO eta_posts (author_user_id, body, tags, reply_to) VALUES ($1, $2, $3, $4) RETURNING id::text`,
    [userId, body, extractTags(body), replyTo ?? null],
  )
  if (replyTo) await pool.query(`UPDATE eta_posts SET reply_count = reply_count + 1 WHERE id = $1`, [replyTo])
  const row = await pool.query<PostRow>(`${POST_SELECT('$1')} WHERE p.id = $2`, [userId, inserted.rows[0]!.id])
  return { ok: true as const, post: toPost(row.rows[0]!, userId) }
}

export async function toggleLike(userId: string, postId: number) {
  const post = await pool.query<{ author_user_id: string | null }>(`SELECT author_user_id FROM eta_posts WHERE id = $1`, [postId])
  if (!post.rows[0]) return fail(404, 'NOT_FOUND', 'That gist is gone.')
  if (post.rows[0].author_user_id === userId) return fail(400, 'OWN_POST', 'You can’t fire your own gist.')
  const removed = await pool.query(`DELETE FROM eta_likes WHERE post_id = $1 AND user_id = $2`, [postId, userId])
  let liked = false
  if (!removed.rowCount) {
    await pool.query(`INSERT INTO eta_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [postId, userId])
    liked = true
  }
  const count = await pool.query<{ like_count: number }>(
    `UPDATE eta_posts SET like_count = (SELECT COUNT(*) FROM eta_likes WHERE post_id = $1) WHERE id = $1 RETURNING like_count`,
    [postId],
  )
  return { ok: true as const, liked, likes: count.rows[0]?.like_count ?? 0 }
}

export async function toggleFollow(userId: string, kind: 'user' | 'npc', targetId: string) {
  if (kind === 'npc' && !npcById(targetId)) return fail(404, 'NOT_FOUND', 'No such account.')
  if (kind === 'user') {
    if (targetId === userId) return fail(400, 'SELF', 'You can’t follow yourself.')
    const exists = await pool.query(`SELECT 1 FROM users WHERE id = $1`, [targetId])
    if (!exists.rowCount) return fail(404, 'NOT_FOUND', 'No such account.')
  }
  const removed = await pool.query(
    `DELETE FROM eta_follows WHERE follower_id = $1 AND target_kind = $2 AND target_id = $3`,
    [userId, kind, targetId],
  )
  if (removed.rowCount) return { ok: true as const, following: false }
  await pool.query(`INSERT INTO eta_follows (follower_id, target_kind, target_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [
    userId,
    kind,
    targetId,
  ])
  return { ok: true as const, following: true }
}

export async function reportPost(userId: string, postId: number) {
  await pool.query(`INSERT INTO eta_reports (post_id, reporter_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [postId, userId])
  return { ok: true as const }
}

// —— Profiles and Top voices ——

export async function getProfile(viewerId: string, kind: 'user' | 'npc', idOrHandle: string) {
  if (kind === 'npc') {
    const npc = npcById(idOrHandle) ?? NPCS.find((n) => n.handle === idOrHandle)
    if (!npc) return fail(404, 'NOT_FOUND', 'No such account.')
    const [posts, following] = await Promise.all([
      pool.query<PostRow>(`${POST_SELECT('$1')} WHERE p.author_npc_id = $2 AND p.reply_to IS NULL ORDER BY p.id DESC LIMIT 30`, [viewerId, npc.id]),
      pool.query(`SELECT 1 FROM eta_follows WHERE follower_id = $1 AND target_kind = 'npc' AND target_id = $2`, [viewerId, npc.id]),
    ])
    return {
      ok: true as const,
      profile: { author: npcAuthor(npc), bio: npc.bio, followers: null, following: null, isFollowing: Boolean(following.rowCount) },
      posts: posts.rows.map((r) => toPost(r, viewerId)),
    }
  }
  const user = await pool.query<{ id: string; username: string; display_name: string; avatar_color: string | null; avatar_emoji: string | null; bio: string | null }>(
    `SELECT u.id, u.username, u.username AS display_name, pp.avatar_color, pp.avatar_emoji, pp.bio
     FROM users u LEFT JOIN player_profiles pp ON pp.user_id = u.id
     WHERE u.id = $1 OR LOWER(u.username) = LOWER($1) LIMIT 1`,
    [idOrHandle],
  )
  const u = user.rows[0]
  if (!u) return fail(404, 'NOT_FOUND', 'No such account.')
  const [posts, counts, following] = await Promise.all([
    pool.query<PostRow>(`${POST_SELECT('$1')} WHERE p.author_user_id = $2 AND p.reply_to IS NULL ORDER BY p.id DESC LIMIT 30`, [viewerId, u.id]),
    pool.query<{ followers: number; following: number }>(
      `SELECT (SELECT COUNT(*)::int FROM eta_follows WHERE target_kind = 'user' AND target_id = $1) AS followers,
              (SELECT COUNT(*)::int FROM eta_follows WHERE follower_id = $1) AS following`,
      [u.id],
    ),
    pool.query(`SELECT 1 FROM eta_follows WHERE follower_id = $1 AND target_kind = 'user' AND target_id = $2`, [viewerId, u.id]),
  ])
  return {
    ok: true as const,
    profile: {
      author: {
        kind: 'user' as const,
        id: u.id,
        name: u.display_name,
        handle: u.username,
        avatar: { color: u.avatar_color ?? '#3d9ad6', emoji: u.avatar_emoji },
        npc: false,
      },
      bio: u.bio ?? '',
      followers: counts.rows[0]?.followers ?? 0,
      following: counts.rows[0]?.following ?? 0,
      isFollowing: Boolean(following.rowCount),
      isMe: u.id === viewerId,
    },
    posts: posts.rows.map((r) => toPost(r, viewerId)),
  }
}

/** Real players only: followers plus fire received this week. */
export async function topVoices() {
  const rows = await pool.query<{ id: string; username: string; display_name: string; avatar_color: string | null; avatar_emoji: string | null; followers: number; fire: number }>(
    `SELECT * FROM (
       SELECT u.id, u.username, u.username AS display_name, pp.avatar_color, pp.avatar_emoji,
              (SELECT COUNT(*)::int FROM eta_follows f WHERE f.target_kind = 'user' AND f.target_id = u.id) AS followers,
              COALESCE((SELECT SUM(p.like_count)::int FROM eta_posts p WHERE p.author_user_id = u.id AND p.created_at > NOW() - INTERVAL '7 days'), 0) AS fire
       FROM users u LEFT JOIN player_profiles pp ON pp.user_id = u.id
       WHERE EXISTS (SELECT 1 FROM eta_posts p WHERE p.author_user_id = u.id)
     ) ranked
     ORDER BY followers * 3 + fire DESC LIMIT 20`,
  )
  return rows.rows.map((r) => ({
    author: { kind: 'user' as const, id: r.id, name: r.display_name, handle: r.username, avatar: { color: r.avatar_color ?? '#3d9ad6', emoji: r.avatar_emoji }, npc: false },
    followers: r.followers,
    fire: r.fire,
  }))
}

// —— NPC scheduler + giveaways ——

let lastNpcRun = 0

/** Hottest coin for the crypto caller (coins arrive with the Crypto tab; null until then). */
async function hotCoin(db: PoolClient | typeof pool): Promise<{ ticker: string; name: string } | null> {
  try {
    const rows = await db.query<{ ticker: string; name: string }>(
      `SELECT ticker, name FROM coins ORDER BY hype DESC, created_at DESC LIMIT 5`,
    )
    if (!rows.rows.length) return null
    return rows.rows[Math.floor(Math.random() * rows.rows.length)]!
  } catch {
    return null
  }
}

const formatPrize = (n: number) => (n >= 1_000_000 ? `₦${n / 1_000_000}m` : `₦${Math.round(n / 1000)}k`)

export async function runNpcs(force = false) {
  const now = Date.now()
  if (!force && now - lastNpcRun < NPC_TICK_MS) return
  lastNpcRun = now
  const client = await pool.connect()
  try {
    // One server at a time
    const lock = await client.query<{ ok: boolean }>(`SELECT pg_try_advisory_lock(hashtext('eta-npcs')) AS ok`)
    if (!lock.rows[0]?.ok) return
    try {
      await settleGiveaways(client)
      const last = await client.query<{ author_npc_id: string; at: Date }>(
        `SELECT author_npc_id, MAX(created_at) AS at FROM eta_posts WHERE author_npc_id IS NOT NULL AND reply_to IS NULL GROUP BY author_npc_id`,
      )
      const lastAt = new Map(last.rows.map((r) => [r.author_npc_id, r.at.getTime()]))
      for (const npc of NPCS) {
        const at = lastAt.get(npc.id) ?? 0
        if (now - at < npc.every * 60_000) continue
        await postAsNpc(client, npc)
      }
    } finally {
      await client.query(`SELECT pg_advisory_unlock(hashtext('eta-npcs'))`)
    }
  } catch (error) {
    console.error('ẹta NPCs failed', error)
  } finally {
    client.release()
  }
}

async function postAsNpc(client: PoolClient, npc: Npc) {
  const area = LAND_AREAS[Math.floor(Math.random() * LAND_AREAS.length)]!.name
  if (npc.kind === 'giveaway') {
    const open = await client.query(`SELECT 1 FROM eta_posts WHERE giveaway_prize IS NOT NULL AND giveaway_settled = FALSE LIMIT 1`)
    if (open.rowCount) return
    const spent = await client.query<{ total: string | null }>(
      `SELECT SUM(giveaway_prize)::text AS total FROM eta_posts WHERE giveaway_prize IS NOT NULL AND created_at > NOW() - INTERVAL '1 day'`,
    )
    const left = GIVEAWAY_DAILY_BUDGET - Number(spent.rows[0]?.total ?? 0)
    let prize = rollPrize()
    while (prize > left && prize > 100_000) prize = prize >= 1_000_000 ? prize / 2 : 100_000
    if (prize > left) return
    await client.query(
      `INSERT INTO eta_posts (author_npc_id, body, tags, giveaway_prize, giveaway_ends_at)
       VALUES ($1, $2, '{}', $3, NOW() + make_interval(mins => $4))`,
      [npc.id, giveawayPost(formatPrize(prize), GIVEAWAY_MINUTES), prize, GIVEAWAY_MINUTES],
    )
    return
  }
  const body =
    npc.kind === 'crypto'
      ? cryptoPost(await hotCoin(client), area)
      : npc.kind === 'land'
        ? landPost(area)
        : npc.kind === 'lifestyle'
          ? lifestylePost()
          : motivationPost()
  await client.query(`INSERT INTO eta_posts (author_npc_id, body, tags) VALUES ($1, $2, $3)`, [npc.id, body, extractTags(body)])
}

/** Ended giveaways: the most-fired reply from a real player wins, paid straight to their wallet. */
async function settleGiveaways(client: PoolClient) {
  const due = await client.query<{ id: string; author_npc_id: string; giveaway_prize: string }>(
    `SELECT id::text, author_npc_id, giveaway_prize::text FROM eta_posts
     WHERE giveaway_prize IS NOT NULL AND giveaway_settled = FALSE AND giveaway_ends_at <= NOW() LIMIT 5`,
  )
  for (const giveaway of due.rows) {
    await client.query('BEGIN')
    try {
      const locked = await client.query(`SELECT 1 FROM eta_posts WHERE id = $1 AND giveaway_settled = FALSE FOR UPDATE`, [giveaway.id])
      if (!locked.rowCount) {
        await client.query('ROLLBACK')
        continue
      }
      const winner = await client.query<{ id: string; author_user_id: string; username: string; character_id: string | null }>(
        `SELECT p.id::text, p.author_user_id, u.username,
                (SELECT c.id FROM characters c JOIN game_state g ON g.character_id = c.id WHERE c.user_id = p.author_user_id LIMIT 1) AS character_id
         FROM eta_posts p JOIN users u ON u.id = p.author_user_id
         WHERE p.reply_to = $1 AND p.author_user_id IS NOT NULL
         ORDER BY p.like_count DESC, p.id ASC LIMIT 1`,
        [giveaway.id],
      )
      const prize = Number(giveaway.giveaway_prize)
      const w = winner.rows[0]
      let note = 'No entries this time 😢 Next giveaway soon.'
      if (w?.character_id) {
        await applyCash(client, w.character_id, prize, `ẹta giveaway from @${npcById(giveaway.author_npc_id)?.handle ?? 'npc'}`, 'eta_giveaway')
        note = `🎉 @${w.username} wins ${formatPrize(prize)}! Sent straight to your wallet. Congrats!`
      }
      await client.query(`UPDATE eta_posts SET giveaway_settled = TRUE, giveaway_winner_post = $2 WHERE id = $1`, [
        giveaway.id,
        w?.character_id ? w.id : null,
      ])
      await client.query(`INSERT INTO eta_posts (author_npc_id, body, reply_to) VALUES ($1, $2, $3)`, [giveaway.author_npc_id, note, giveaway.id])
      await client.query(`UPDATE eta_posts SET reply_count = reply_count + 1 WHERE id = $1`, [giveaway.id])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  }
}
