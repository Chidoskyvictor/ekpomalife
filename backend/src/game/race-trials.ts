import { pool } from '../db.js'
import { createId } from '../ids.js'
import { carById } from './cars-rules.js'
import { requireEconomySetup } from './economy.js'
import { COURSES, checkTrial } from './race-trials-rules.js'
import { activeCarUpgrades, awardRun, xpOfMany, type Reward, type RunMeta } from './racer.js'
import { rankFor, upgradeCode, upgradeNote, parseUpgradeCode } from './race-rewards-rules.js'

/* Time trials on the named routes: the server opens the run, checks the finish (race-trials-rules.ts) and keeps the top-10 board. */

export type BoardRow = { rank: number; handle: string; car: string; /** "E2 T1 B0", or null for a stock car. */ upgrades: string | null; racerRank: { name: string; emoji: string }; ms: number; you: boolean }

const fail = (error: string, code = 400, reason?: string) => ({ ok: false as const, error, code, reason })

/** Open a trial when you set off. An older one of yours still running is dropped. */
export async function startTrial(userId: string, courseId: string) {
  if (!COURSES[courseId]) return fail('That route does not exist.', 404, 'NO_COURSE')
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate
  const me = gate.character.id
  const { model, up } = await activeCarUpgrades(pool, me)
  if (!model) return fail('You need a car to time trial.', 400, 'NO_CAR')
  await pool.query(`DELETE FROM race_trials WHERE character_id = $1 AND status = 'running'`, [me])
  const id = createId()
  // The car's upgrades are fixed at the start line: they set the speed limit its time is checked against
  await pool.query(`INSERT INTO race_trials (id, character_id, course_id, car_model, upgrades, engine_level) VALUES ($1, $2, $3, $4, $5, $6)`, [id, me, courseId, model, upgradeCode(up), up.engine])
  return { ok: true as const, trialId: id, car: model, upgrades: up }
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
  const { rows } = await pool.query<{ character_id: string; username: string; car_model: string; upgrades: string; ms: number }>(
    `SELECT b.character_id, u.username, b.car_model, b.upgrades, b.ms FROM (
       SELECT DISTINCT ON (character_id) character_id, car_model, upgrades, ms
       FROM race_trials WHERE course_id = $1 AND status = 'done'
       ORDER BY character_id, ms ASC
     ) b JOIN characters c ON c.id = b.character_id JOIN users u ON u.id = c.user_id
     ORDER BY b.ms ASC, b.character_id LIMIT 10`,
    [courseId],
  )
  const xps = await xpOfMany(pool, rows.map((r) => r.character_id))
  const board: BoardRow[] = rows.map((r, i) => {
    const rk = rankFor(xps.get(r.character_id) ?? 0)
    return { rank: i + 1, handle: r.username, car: carById(r.car_model)?.name ?? r.car_model, upgrades: upgradeNote(parseUpgradeCode(r.upgrades)), racerRank: { name: rk.name, emoji: rk.emoji }, ms: r.ms, you: r.character_id === me }
  })
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
export async function finishTrial(userId: string, trialId: string, ms: number, splits: number[], meta?: RunMeta & { mode: 'trial' | 'ai' }) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate
  const me = gate.character.id
  const row = (
    await pool.query<{ course_id: string; car_model: string; engine_level: number; status: string; elapsed: number }>(
      `SELECT course_id, car_model, engine_level, status, (EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000)::int AS elapsed
       FROM race_trials WHERE id = $1 AND character_id = $2`,
      [trialId, me],
    )
  ).rows[0]
  if (!row) return fail('That run is gone. Start again.', 404, 'GONE')
  if (row.status !== 'running') return fail('That run was already handed in.', 400, 'DONE')
  const verdict = checkTrial({ courseId: row.course_id, model: row.car_model, engine: row.engine_level, ms, splits, elapsedMs: row.elapsed })
  if (!verdict.ok) {
    await pool.query(`UPDATE race_trials SET status = 'rejected', finished_at = NOW(), reject_reason = $2 WHERE id = $1`, [trialId, verdict.reason])
    return fail(verdict.error, 400, verdict.reason)
  }
  const before = await bestOf(me, row.course_id)
  await pool.query(`UPDATE race_trials SET status = 'done', finished_at = NOW(), ms = $2, splits = $3 WHERE id = $1`, [trialId, ms, splits])
  const board = await leaderboard(userId, row.course_id)
  if (!board.ok) return board
  const personalBest = before === null || ms < before
  // Rank and badges for an accepted run. A solo trial counts as 1 of 1; an AI race brings its place and field.
  const sane = meta ? { ...meta, of: Math.min(4, Math.max(1, meta.of)), place: Math.min(Math.max(1, meta.place), Math.min(4, Math.max(1, meta.of))) } : null
  const reward: Reward = await awardRun(pool, me, {
    mode: sane?.mode ?? 'trial',
    meta: sane ?? { place: 1, of: 1, beatFaster: 0, beatAiSkill: null, crashed: true, night: false, comeback: false },
    personalBest,
    routeRank: board.mine?.rank ?? null,
    repeat: true,
  })
  return { ok: true as const, ms, personalBest, previousBest: before, board: board.board, mine: board.mine, reward }
}
