import { pool } from '../db.js'
import { createId } from '../ids.js'
import { sendMail } from '../mail/send.js'
import { applyCash } from './game-state.js'

/*
 * Innovation Hub: feedback to Francis, public suggestions with votes at JOD's desk, and the
 * Developers' Corner feed at Chidosky's. Every submission is saved first, then emailed to support.
 * Admins (ADMIN_USERNAMES) review them on /admin and may reward the player an amount they choose.
 */

export const SUPPORT_EMAIL = 'support@ekpomalife.app'
/** Submissions (feedback + suggestions) a player may send per day. */
export const DAILY_LIMIT = 5
export const MAX_REWARD = 200_000
export const FEEDBACK_KINDS = ['review', 'complaint', 'bug', 'experience'] as const
export const SUBMISSION_KINDS = [...FEEDBACK_KINDS, 'suggestion'] as const
export type SubmissionKind = (typeof SUBMISSION_KINDS)[number]
export const REACTIONS = ['👍', '🔥', '😂', '❤️'] as const

const LABEL: Record<SubmissionKind, string> = {
  review: 'Review',
  complaint: 'Complaint',
  bug: 'Bug report',
  experience: 'Player experience',
  suggestion: 'Suggestion',
}

type Fail = { ok: false; error: string; code: number }
const fail = (error: string, code = 400): Fail => ({ ok: false, error, code })

/** Midnight today in Ekpoma (Africa/Lagos), as SQL. */
const LAGOS_TODAY = `(date_trunc('day', NOW() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos')`

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export async function submit(
  user: { id: string; username: string },
  input: { kind: SubmissionKind; body: string; stars?: number | null },
) {
  const body = input.body.trim()
  if (body.length < 3) return fail('Write a little more first.')
  if (body.length > 2000) return fail('Keep it under 2,000 characters.')
  const stars = input.kind === 'review' && input.stars ? Math.max(1, Math.min(5, Math.round(input.stars))) : null

  const today = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM hub_submissions WHERE user_id = $1 AND created_at >= ${LAGOS_TODAY}`,
    [user.id],
  )
  if ((today.rows[0]?.n ?? 0) >= DAILY_LIMIT) {
    return fail(`You've sent ${DAILY_LIMIT} today. Come back tomorrow.`, 429)
  }

  const id = createId()
  await pool.query(`INSERT INTO hub_submissions (id, user_id, kind, body, stars) VALUES ($1, $2, $3, $4, $5)`, [
    id,
    user.id,
    input.kind,
    body,
    stars,
  ])

  // Saved first; the email is best-effort (a failure never loses the submission)
  const subject = `[Innovation Hub] ${LABEL[input.kind]} from @${user.username}`
  const text = `${LABEL[input.kind]}${stars ? ` (${'★'.repeat(stars)})` : ''} from @${user.username}\n\n${body}\n\nReview it on ekpomalife.app/admin (id ${id}).`
  void sendMail({ to: SUPPORT_EMAIL, subject, text, html: `<pre style="font:14px/1.5 sans-serif;white-space:pre-wrap">${escapeHtml(text)}</pre>` }).catch(
    (error) => console.error('[hub] support mail failed', error),
  )

  return { ok: true as const, id, message: input.kind === 'suggestion' ? 'Suggestion posted 💡' : 'Thanks! The team will read it.' }
}

export async function listSuggestions(userId: string, sort: 'top' | 'new') {
  const rows = await pool.query<{
    id: string
    body: string
    created_at: Date
    username: string
    votes: number
    mine: boolean
    voted: boolean
    status: string
  }>(
    `SELECT s.id, s.body, s.created_at, u.username, s.status,
            (SELECT COUNT(*)::int FROM hub_votes v WHERE v.submission_id = s.id) AS votes,
            s.user_id = $1 AS mine,
            EXISTS (SELECT 1 FROM hub_votes v WHERE v.submission_id = s.id AND v.user_id = $1) AS voted
     FROM hub_submissions s JOIN users u ON u.id = s.user_id
     WHERE s.kind = 'suggestion' AND s.hidden = FALSE
     ORDER BY ${sort === 'top' ? 'votes DESC, s.created_at DESC' : 's.created_at DESC'}
     LIMIT 60`,
    [userId],
  )
  return {
    ok: true as const,
    suggestions: rows.rows.map((r) => ({
      id: r.id,
      body: r.body,
      username: r.username,
      votes: r.votes,
      mine: r.mine,
      voted: r.voted,
      rewarded: r.status === 'rewarded',
      createdAt: new Date(r.created_at).toISOString(),
    })),
  }
}

/** Upvote, or take your vote back. You can't vote for your own. */
export async function toggleVote(userId: string, submissionId: string) {
  const s = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM hub_submissions WHERE id = $1 AND kind = 'suggestion' AND hidden = FALSE`,
    [submissionId],
  )
  const row = s.rows[0]
  if (!row) return fail('That suggestion is gone.', 404)
  if (row.user_id === userId) return fail("You can't vote for your own idea.", 409)
  const removed = await pool.query(`DELETE FROM hub_votes WHERE submission_id = $1 AND user_id = $2`, [submissionId, userId])
  if (!removed.rowCount) {
    await pool.query(`INSERT INTO hub_votes (submission_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [submissionId, userId])
  }
  const count = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM hub_votes WHERE submission_id = $1`, [submissionId])
  return { ok: true as const, voted: !removed.rowCount, votes: count.rows[0]?.n ?? 0 }
}

/** What you've sent, newest first, with how the team answered. */
export async function mySubmissions(userId: string) {
  const rows = await pool.query<{ id: string; kind: SubmissionKind; body: string; status: string; reward: string; created_at: Date }>(
    `SELECT id, kind, body, status, reward, created_at FROM hub_submissions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [userId],
  )
  const today = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM hub_submissions WHERE user_id = $1 AND created_at >= ${LAGOS_TODAY}`,
    [userId],
  )
  return {
    ok: true as const,
    left: Math.max(0, DAILY_LIMIT - (today.rows[0]?.n ?? 0)),
    items: rows.rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      body: r.body,
      status: r.status as 'new' | 'rewarded' | 'rejected',
      reward: Number(r.reward),
      createdAt: new Date(r.created_at).toISOString(),
    })),
  }
}

export async function listPosts(userId: string) {
  const posts = await pool.query<{ id: string; author: string; body: string; created_at: Date }>(
    `SELECT id, author, body, created_at FROM hub_posts ORDER BY created_at DESC LIMIT 30`,
  )
  const ids = posts.rows.map((p) => p.id)
  const counts = ids.length
    ? await pool.query<{ post_id: string; emoji: string; n: number; mine: boolean }>(
        `SELECT post_id, emoji, COUNT(*)::int AS n, BOOL_OR(user_id = $2) AS mine
         FROM hub_post_reactions WHERE post_id = ANY($1) GROUP BY post_id, emoji`,
        [ids, userId],
      )
    : { rows: [] }
  return {
    ok: true as const,
    posts: posts.rows.map((p) => ({
      id: p.id,
      author: p.author,
      body: p.body,
      createdAt: new Date(p.created_at).toISOString(),
      reactions: Object.fromEntries(REACTIONS.map((e) => [e, 0])) as Record<string, number>,
      mine: null as string | null,
    })).map((p) => {
      for (const c of counts.rows.filter((c) => c.post_id === p.id)) {
        p.reactions[c.emoji] = c.n
        if (c.mine) p.mine = c.emoji
      }
      return p
    }),
  }
}

/** One reaction per post: tap the same emoji again to take it back. */
export async function react(userId: string, postId: string, emoji: string) {
  if (!(REACTIONS as readonly string[]).includes(emoji)) return fail('Unknown reaction.')
  const exists = await pool.query(`SELECT 1 FROM hub_posts WHERE id = $1`, [postId])
  if (!exists.rowCount) return fail('That update is gone.', 404)
  const current = await pool.query<{ emoji: string }>(`SELECT emoji FROM hub_post_reactions WHERE post_id = $1 AND user_id = $2`, [postId, userId])
  if (current.rows[0]?.emoji === emoji) {
    await pool.query(`DELETE FROM hub_post_reactions WHERE post_id = $1 AND user_id = $2`, [postId, userId])
  } else {
    await pool.query(
      `INSERT INTO hub_post_reactions (post_id, user_id, emoji) VALUES ($1, $2, $3)
       ON CONFLICT (post_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji`,
      [postId, userId, emoji],
    )
  }
  return { ok: true as const }
}

// —— Admin ——

export async function adminStats() {
  const one = async <T>(sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0] as T
  const [visits, players, revenue, feedback, days] = await Promise.all([
    one<{ total: string; today: string }>(
      `SELECT (SELECT value FROM site_counters WHERE id = 'visits') AS total,
              COALESCE((SELECT count FROM site_visits_daily WHERE day = (NOW() AT TIME ZONE 'Africa/Lagos')::date), 0) AS today`,
    ),
    one<{ total: number; new_today: number; online: number; played_today: number }>(
      `SELECT (SELECT COUNT(*)::int FROM users) AS total,
              (SELECT COUNT(*)::int FROM users WHERE created_at >= ${LAGOS_TODAY}) AS new_today,
              (SELECT COUNT(DISTINCT user_id)::int FROM sessions WHERE last_seen_at > NOW() - INTERVAL '5 minutes' AND expires_at > NOW()) AS online,
              (SELECT COUNT(DISTINCT user_id)::int FROM sessions WHERE last_seen_at >= ${LAGOS_TODAY}) AS played_today`,
    ),
    one<{ today: string; week: string; month: string; total: string; count: number; pending: number; failed: number }>(
      `SELECT COALESCE(SUM(amount_kobo) FILTER (WHERE status = 'success' AND COALESCE(paid_at, created_at) >= ${LAGOS_TODAY}), 0) AS today,
              COALESCE(SUM(amount_kobo) FILTER (WHERE status = 'success' AND COALESCE(paid_at, created_at) >= NOW() - INTERVAL '7 days'), 0) AS week,
              COALESCE(SUM(amount_kobo) FILTER (WHERE status = 'success' AND COALESCE(paid_at, created_at) >= NOW() - INTERVAL '30 days'), 0) AS month,
              COALESCE(SUM(amount_kobo) FILTER (WHERE status = 'success'), 0) AS total,
              (COUNT(*) FILTER (WHERE status = 'success'))::int AS count,
              (COUNT(*) FILTER (WHERE status = 'pending'))::int AS pending,
              (COUNT(*) FILTER (WHERE status = 'failed'))::int AS failed
       FROM wallet_topups`,
    ),
    one<{ waiting: number; rewarded: string }>(
      `SELECT (COUNT(*) FILTER (WHERE status = 'new'))::int AS waiting,
              COALESCE(SUM(reward) FILTER (WHERE status = 'rewarded'), 0) AS rewarded
       FROM hub_submissions`,
    ),
    pool.query<{ day: string; count: string }>(`SELECT day::text, count FROM site_visits_daily ORDER BY day DESC LIMIT 14`),
  ])
  const naira = (kobo: string | number) => Math.round(Number(kobo) / 100)
  return {
    ok: true as const,
    visits: { total: Number(visits.total ?? 0), today: Number(visits.today ?? 0), days: days.rows.map((d) => ({ day: d.day, count: Number(d.count) })) },
    players: { total: players.total, newToday: players.new_today, online: players.online, playedToday: players.played_today },
    revenue: {
      today: naira(revenue.today),
      week: naira(revenue.week),
      month: naira(revenue.month),
      total: naira(revenue.total),
      count: revenue.count,
      pending: revenue.pending,
      failed: revenue.failed,
    },
    feedback: { waiting: feedback.waiting, rewarded: Number(feedback.rewarded) },
  }
}

export async function adminTopups(status: 'success' | 'pending' | 'failed') {
  const rows = await pool.query<{ id: string; username: string; pack_id: string; amount_kobo: string; status: string; reference: string; created_at: Date; paid_at: Date | null }>(
    `SELECT t.id, u.username, t.pack_id, t.amount_kobo, t.status, t.reference, t.created_at, t.paid_at
     FROM wallet_topups t JOIN users u ON u.id = t.user_id
     WHERE t.status = $1 ORDER BY t.created_at DESC LIMIT 100`,
    [status],
  )
  return {
    ok: true as const,
    topups: rows.rows.map((r) => ({
      id: r.id,
      username: r.username,
      pack: r.pack_id,
      amount: Math.round(Number(r.amount_kobo) / 100),
      status: r.status,
      reference: r.reference,
      createdAt: new Date(r.created_at).toISOString(),
      paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : null,
    })),
  }
}

export async function adminSubmissions(status: 'new' | 'rewarded' | 'rejected' | 'all') {
  const rows = await pool.query<{
    id: string
    username: string
    kind: SubmissionKind
    body: string
    stars: number | null
    status: string
    hidden: boolean
    reward: string
    reviewed_by: string | null
    created_at: Date
    votes: number
  }>(
    `SELECT s.id, u.username, s.kind, s.body, s.stars, s.status, s.hidden, s.reward, s.reviewed_by, s.created_at,
            (SELECT COUNT(*)::int FROM hub_votes v WHERE v.submission_id = s.id) AS votes
     FROM hub_submissions s JOIN users u ON u.id = s.user_id
     ${status === 'all' ? '' : 'WHERE s.status = $1'}
     ORDER BY s.created_at DESC LIMIT 200`,
    status === 'all' ? [] : [status],
  )
  return {
    ok: true as const,
    submissions: rows.rows.map((r) => ({
      id: r.id,
      username: r.username,
      kind: r.kind,
      label: LABEL[r.kind],
      body: r.body,
      stars: r.stars,
      status: r.status,
      hidden: r.hidden,
      reward: Number(r.reward),
      reviewedBy: r.reviewed_by,
      votes: r.votes,
      createdAt: new Date(r.created_at).toISOString(),
    })),
  }
}

/** Pay the player (once per submission). The ledger line shows on their phone as "Money in". */
export async function adminReward(admin: string, submissionId: string, amount: number) {
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_REWARD) return fail(`Choose an amount from ₦1 to ₦${MAX_REWARD.toLocaleString()}.`)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const s = await client.query<{ user_id: string; status: string; kind: SubmissionKind }>(
      `SELECT user_id, status, kind FROM hub_submissions WHERE id = $1 FOR UPDATE`,
      [submissionId],
    )
    const row = s.rows[0]
    if (!row) {
      await client.query('ROLLBACK')
      return fail('No such submission.', 404)
    }
    if (row.status !== 'new') {
      await client.query('ROLLBACK')
      return fail(`Already ${row.status}.`, 409)
    }
    const ch = await client.query<{ id: string }>(`SELECT id FROM characters WHERE user_id = $1`, [row.user_id])
    const characterId = ch.rows[0]?.id
    if (!characterId) {
      await client.query('ROLLBACK')
      return fail("That player hasn't made a character.", 409)
    }
    const paid = await applyCash(client, characterId, amount, `Ekpoma Life team reward for your ${LABEL[row.kind].toLowerCase()}`, 'hub_reward')
    if (!paid.ok) {
      await client.query('ROLLBACK')
      return fail('Could not pay the player.', 409)
    }
    await client.query(
      `UPDATE hub_submissions SET status = 'rewarded', reward = $2, reviewed_by = $3, reviewed_at = NOW() WHERE id = $1`,
      [submissionId, amount, admin],
    )
    await client.query('COMMIT')
    return { ok: true as const }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function adminReject(admin: string, submissionId: string) {
  const res = await pool.query(
    `UPDATE hub_submissions SET status = 'rejected', reviewed_by = $2, reviewed_at = NOW() WHERE id = $1 AND status = 'new'`,
    [submissionId, admin],
  )
  return res.rowCount ? { ok: true as const } : fail('Not found, or already reviewed.', 409)
}

export async function adminHide(submissionId: string, hidden: boolean) {
  const res = await pool.query(`UPDATE hub_submissions SET hidden = $2 WHERE id = $1`, [submissionId, hidden])
  return res.rowCount ? { ok: true as const } : fail('No such submission.', 404)
}

export async function adminPost(author: string, body: string) {
  const text = body.trim()
  if (!text) return fail('Write the update first.')
  if (text.length > 4000) return fail('Keep it under 4,000 characters.')
  const id = createId()
  await pool.query(`INSERT INTO hub_posts (id, author, body) VALUES ($1, $2, $3)`, [id, author, text])
  return { ok: true as const, id }
}

export async function adminDeletePost(id: string) {
  const res = await pool.query(`DELETE FROM hub_posts WHERE id = $1`, [id])
  return res.rowCount ? { ok: true as const } : fail('No such update.', 404)
}

/** Count today's visit (alongside the all-time counter). */
export async function countDailyVisit() {
  await pool.query(
    `INSERT INTO site_visits_daily (day, count) VALUES ((NOW() AT TIME ZONE 'Africa/Lagos')::date, 1)
     ON CONFLICT (day) DO UPDATE SET count = site_visits_daily.count + 1`,
  )
}
