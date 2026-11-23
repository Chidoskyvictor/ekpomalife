import { pool } from '../db.js'
import { createId } from '../ids.js'
import { carById } from './cars-rules.js'
import { requireEconomySetup } from './economy.js'
import { COURSES, checkTrial } from './race-trials-rules.js'

/* Time trials on the named routes: the server opens the run, checks the finish (race-trials-rules.ts) and keeps the top-10 board. */

export type BoardRow = { rank: number; handle: string; car: string; ms: number; you: boolean }

const fail = (error: string, code = 400, reason?: string) => ({ ok: false as const, error, code, reason })

/** Open a trial when you set off. An older one of yours still running is dropped. */
export async function startTrial(userId: string, courseId: string) {
  if (!COURSES[courseId]) return fail('That route does not exist.', 404, 'NO_COURSE')
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate
  const me = gate.character.id
  const car = await pool.query<{ model: string }>(`SELECT model FROM car_holdings WHERE character_id = $1 AND active LIMIT 1`, [me])
  const model = car.rows[0]?.model
  if (!model) return fail('You need a car to time trial.', 400, 'NO_CAR')
  await pool.query(`DELETE FROM race_trials WHERE character_id = $1 AND status = 'running'`, [me])
  const id = createId()
  await pool.query(`INSERT INTO race_trials (id, character_id, course_id, car_model) VALUES ($1, $2, $3, $4)`, [id, me, courseId, model])
  return { ok: true as const, trialId: id, car: model }
}

async function bestOf(characterId: string, courseId: string) {
  const { rows } = await pool.query<{ ms: number | null }>(`SELECT MIN(ms) AS ms FROM race_trials WHERE character_id = $1 AND course_id = $2 AND status = 'done'`, [characterId, courseId])
  return rows[0]?.ms ?? null
}

/** The top 10 fastest on a route (one row per player: their best), and where you stand. */
export async function leaderboard(userId: string, courseId: string) {
  if (!COURSES[courseId]) return fail('That route does not exist.', 404, 'NO_COURSE')
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate
  const me = gate.character.id
  const { rows } = await pool.query<{ character_id: string; username: string; car_model: string; ms: number }>(
    `SELECT b.character_id, u.username, b.car_model, b.ms FROM (
       SELECT DISTINCT ON (character_id) character_id, car_model, ms
       FROM race_trials WHERE course_id = $1 AND status = 'done'
       ORDER BY character_id, ms ASC
     ) b JOIN characters c ON c.id = b.character_id JOIN users u ON u.id = c.user_id
     ORDER BY b.ms ASC, b.character_id LIMIT 10`,
    [courseId],
  )
  const board: BoardRow[] = rows.map((r, i) => ({ rank: i + 1, handle: r.username, car: carById(r.car_model)?.name ?? r.car_model, ms: r.ms, you: r.character_id === me }))
  const best = await bestOf(me, courseId)
  let rank: number | null = null
  if (best !== null) {
    const ahead = await pool.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM (SELECT character_id, MIN(ms) AS ms FROM race_trials WHERE course_id = $1 AND status = 'done' GROUP BY character_id) t WHERE t.ms < $2`,
      [courseId, best],
    )
    rank = Number(ahead.rows[0]!.n) + 1
  }
  return { ok: true as const, courseId, board, mine: best === null ? null : { ms: best, rank } }
}

/** Close a trial with a time. Counts only if it passes the checks; a rejected run is kept (with why) but never shows. */
export async function finishTrial(userId: string, trialId: string, ms: number, splits: number[]) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate
  const me = gate.character.id
  const row = (
    await pool.query<{ course_id: string; car_model: string; status: string; elapsed: number }>(
      `SELECT course_id, car_model, status, (EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000)::int AS elapsed
       FROM race_trials WHERE id = $1 AND character_id = $2`,
      [trialId, me],
    )
  ).rows[0]
  if (!row) return fail('That run is gone. Start again.', 404, 'GONE')
  if (row.status !== 'running') return fail('That run was already handed in.', 400, 'DONE')
  const verdict = checkTrial({ courseId: row.course_id, model: row.car_model, ms, splits, elapsedMs: row.elapsed })
  if (!verdict.ok) {
    await pool.query(`UPDATE race_trials SET status = 'rejected', finished_at = NOW(), reject_reason = $2 WHERE id = $1`, [trialId, verdict.reason])
    return fail(verdict.error, 400, verdict.reason)
  }
  const before = await bestOf(me, row.course_id)
  await pool.query(`UPDATE race_trials SET status = 'done', finished_at = NOW(), ms = $2, splits = $3 WHERE id = $1`, [trialId, ms, splits])
  const board = await leaderboard(userId, row.course_id)
  if (!board.ok) return board
  return { ok: true as const, ms, personalBest: before === null || ms < before, previousBest: before, board: board.board, mine: board.mine }
}
