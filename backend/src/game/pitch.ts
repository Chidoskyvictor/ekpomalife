import { createId } from '../ids.js'
import { pool } from '../db.js'
import { applyCash } from './game-state.js'
import { awardSkill } from './skills.js'
import { lagosDayStart } from './spaces-rules.js'

/*
 * Innovation Hub Pitch Room. You pitch, the investor reviews your deck for 20 seconds, then says
 * yes (₦1M–₦5M) or no. Five pitches a day. Each pitch is a coin toss, but anyone still without a
 * yes on their 5th pitch of the day gets one, so a full day of trying always pays. The server
 * decides the outcome when you start and only reveals (and pays) once the review time is up.
 */

export const PITCHES_PER_DAY = 5
const ACCEPT_CHANCE = 0.3
const MIN_REWARD = 1_000_000
const MAX_REWARD = 5_000_000
const REVIEW_MIN_S = 20
const REVIEW_MAX_S = 20

type Fail = { ok: false; error: string; code: number }
const fail = (code: number, error: string): Fail => ({ ok: false, error, code })

async function characterOf(userId: string) {
  const r = await pool.query<{ id: string; character_type: string | null }>(`SELECT id, character_type FROM characters WHERE user_id = $1`, [userId])
  return r.rows[0] ?? null
}

type Row = { id: string; idea: string; accepted: boolean; amount: string | number; ready_at: Date; status: string; created_at: Date }

const view = (r: Row, now = new Date()) => ({
  id: r.id,
  idea: r.idea,
  readyAt: r.ready_at.toISOString(),
  startedAt: r.created_at.toISOString(),
  ready: now >= r.ready_at,
  // The verdict stays hidden until the review is over
  result: r.status === 'done' ? { accepted: r.accepted, amount: Number(r.amount) } : null,
})

/** Today's pitches and the one under review, if any. */
export async function pitchStatus(userId: string) {
  const ch = await characterOf(userId)
  if (!ch) return fail(409, 'Create your character first.')
  const today = await pool.query<Row>(
    `SELECT * FROM hub_pitches WHERE character_id = $1 AND created_at >= $2 ORDER BY created_at DESC`,
    [ch.id, lagosDayStart(new Date())],
  )
  // A deck still under review counts even if it was handed in before midnight
  const pending = (await pool.query<Row>(`SELECT * FROM hub_pitches WHERE character_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1`, [ch.id])).rows[0] ?? null
  return {
    ok: true as const,
    left: Math.max(0, PITCHES_PER_DAY - today.rowCount!),
    pending: pending ? view(pending) : null,
    last: today.rows.find((r) => r.status === 'done') ? view(today.rows.find((r) => r.status === 'done')!) : null,
  }
}

/** Has this player ever pitched (any pitch, won or not, even one still under review)? Drives the launch invite. */
export async function launchStatus(userId: string) {
  const r = await pool.query(
    `SELECT 1 FROM hub_pitches p JOIN characters c ON c.id = p.character_id WHERE c.user_id = $1 LIMIT 1`,
    [userId],
  )
  return { ok: true as const, hasPitched: (r.rowCount ?? 0) > 0 }
}

export async function startPitch(userId: string, idea: string) {
  const ch = await characterOf(userId)
  if (!ch) return fail(409, 'Create your character first.')
  const clean = idea.trim().replace(/\s+/g, ' ').slice(0, 120)
  if (clean.length < 3) return fail(400, 'Tell the investor what you are building (3 letters or more).')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // One pitch at a time per player (lock the character row so double taps can't start two)
    await client.query(`SELECT id FROM characters WHERE id = $1 FOR UPDATE`, [ch.id])
    const today = await client.query<Row>(
      `SELECT * FROM hub_pitches WHERE character_id = $1 AND created_at >= $2`,
      [ch.id, lagosDayStart(new Date())],
    )
    const pendingAny = await client.query<Row>(`SELECT * FROM hub_pitches WHERE character_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1`, [ch.id])
    const pending = pendingAny.rows[0]
    if (pending) {
      await client.query('COMMIT')
      return { ok: true as const, pitch: view(pending), left: Math.max(0, PITCHES_PER_DAY - today.rows.length) }
    }
    if (today.rows.length >= PITCHES_PER_DAY) {
      await client.query('ROLLBACK')
      return fail(429, `You've pitched ${PITCHES_PER_DAY} times today. The investors are back tomorrow.`)
    }
    const attempt = today.rows.length + 1
    const wonToday = today.rows.some((r) => r.accepted)
    // A coin toss each time, but a day of five pitches never ends empty-handed
    const accepted = (attempt === PITCHES_PER_DAY && !wonToday) || Math.random() < ACCEPT_CHANCE
    const amount = accepted ? Math.round((MIN_REWARD + Math.random() * (MAX_REWARD - MIN_REWARD)) / 50_000) * 50_000 : 0
    const seconds = REVIEW_MIN_S + Math.floor(Math.random() * (REVIEW_MAX_S - REVIEW_MIN_S + 1))
    const row = await client.query<Row>(
      `INSERT INTO hub_pitches (id, character_id, idea, accepted, amount, ready_at, status)
       VALUES ($1, $2, $3, $4, $5, NOW() + ($6::int * INTERVAL '1 second'), 'pending') RETURNING *`,
      [createId(), ch.id, clean, accepted, amount, seconds],
    )
    await client.query('COMMIT')
    return { ok: true as const, pitch: view(row.rows[0]!), left: PITCHES_PER_DAY - attempt }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/** After the review time: reveal the verdict and pay a yes. Safe to call twice (pays once). */
export async function finishPitch(userId: string, pitchId: string) {
  const ch = await characterOf(userId)
  if (!ch) return fail(409, 'Create your character first.')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const found = await client.query<Row>(`SELECT * FROM hub_pitches WHERE id = $1 AND character_id = $2 FOR UPDATE`, [pitchId, ch.id])
    const row = found.rows[0]
    if (!row) {
      await client.query('ROLLBACK')
      return fail(404, 'That pitch is gone.')
    }
    if (row.status === 'done') {
      await client.query('COMMIT')
      return { ok: true as const, pitch: view(row), message: null }
    }
    if (new Date() < row.ready_at) {
      await client.query('ROLLBACK')
      return fail(409, 'The investor is still reading your deck.')
    }
    let message = 'The investor passed on this one. Polish the deck and try again.'
    if (row.accepted) {
      const paid = await applyCash(client, ch.id, Number(row.amount), `Investor backed "${row.idea}"`, 'pitch')
      if (!paid.ok) {
        await client.query('ROLLBACK')
        return fail(400, paid.error)
      }
      message = `🎉 The investor loved it! +₦${Number(row.amount).toLocaleString()}`
    }
    // Pitching trains Charisma and Tech, win or lose
    const up1 = await awardSkill(client, ch.id, 'charisma', 8, ch.character_type)
    const up2 = await awardSkill(client, ch.id, 'tech', 6, ch.character_type)
    const done = await client.query<Row>(`UPDATE hub_pitches SET status = 'done' WHERE id = $1 RETURNING *`, [row.id])
    await client.query('COMMIT')
    return { ok: true as const, pitch: view(done.rows[0]!), message: [message, up1, up2].filter(Boolean).join(' ') }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
