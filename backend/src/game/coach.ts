import { pool } from '../db.js'
import { TOUR_STEPS, isTipId, nextTourStep, type CoachView } from './coach-rules.js'

type Fail = { ok: false; code: number; error: string }
type Row = { tour_step: number; tour_done: boolean; tips_seen: string[] }

const viewOf = (row: Row | undefined): CoachView =>
  // No row = a brand-new character: tour not started yet
  row ? { tour: !row.tour_done, step: row.tour_step, tipsSeen: row.tips_seen } : { tour: true, step: 0, tipsSeen: [] }

async function characterId(userId: string): Promise<string | null> {
  const r = await pool.query<{ id: string }>(`SELECT id FROM characters WHERE user_id = $1`, [userId])
  return r.rows[0]?.id ?? null
}

const ensure = (id: string) => pool.query(`INSERT INTO coach_progress (character_id) VALUES ($1) ON CONFLICT DO NOTHING`, [id])

const select = async (id: string) =>
  (await pool.query<Row>(`SELECT tour_step, tour_done, tips_seen FROM coach_progress WHERE character_id = $1`, [id])).rows[0]

export async function getCoach(userId: string): Promise<{ ok: true; coach: CoachView } | Fail> {
  const id = await characterId(userId)
  if (!id) return { ok: false, code: 404, error: 'Create your character first.' }
  return { ok: true, coach: viewOf(await select(id)) }
}

export type TourAction = { op: 'done'; step: number } | { op: 'skip' } | { op: 'replay' }

/** Finish a tour step, skip the whole tour (counts as done), or start it again from Settings. */
export async function tourAction(userId: string, action: TourAction): Promise<{ ok: true; coach: CoachView } | Fail> {
  const id = await characterId(userId)
  if (!id) return { ok: false, code: 404, error: 'Create your character first.' }
  await ensure(id)
  const cur = (await select(id))!
  if (action.op === 'skip') {
    await pool.query(`UPDATE coach_progress SET tour_done = TRUE, updated_at = NOW() WHERE character_id = $1`, [id])
  } else if (action.op === 'replay') {
    await pool.query(`UPDATE coach_progress SET tour_done = FALSE, tour_step = 0, updated_at = NOW() WHERE character_id = $1`, [id])
  } else {
    const next = nextTourStep(cur.tour_step, Math.min(action.step, TOUR_STEPS - 1))
    await pool.query(`UPDATE coach_progress SET tour_step = $2, tour_done = $3, updated_at = NOW() WHERE character_id = $1`, [
      id,
      next ?? TOUR_STEPS,
      next === null,
    ])
  }
  return { ok: true, coach: viewOf(await select(id)) }
}

/** Mark a one-time tip as shown (idempotent). */
export async function seeTip(userId: string, tip: string): Promise<{ ok: true; coach: CoachView } | Fail> {
  if (!isTipId(tip)) return { ok: false, code: 400, error: 'Unknown tip.' }
  const id = await characterId(userId)
  if (!id) return { ok: false, code: 404, error: 'Create your character first.' }
  await ensure(id)
  await pool.query(
    `UPDATE coach_progress SET tips_seen = array_append(tips_seen, $2), updated_at = NOW()
     WHERE character_id = $1 AND NOT ($2 = ANY(tips_seen))`,
    [id, tip],
  )
  return { ok: true, coach: viewOf(await select(id)) }
}
