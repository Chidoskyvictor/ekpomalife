import { pool } from '../db.js'
import { env } from '../env.js'
import { adminSet, buildBoard, detailLine, type Board, type WorthRow } from './forbes-rules.js'
import { departmentForCourse } from './aau-courses.js'
import { shownDepartment } from './profile-constants.js'

/*
 * Net worth = live cash (game_state.cash) + furniture paid for + rides + land + businesses.
 * Computed here, cached for a minute. Bank/crypto wallets are not counted.
 */

const CACHE_MS = 60_000
let cache: { rows: WorthRow[]; at: number } | null = null

type Row = {
  user_id: string
  username: string
  display_name: string | null
  avatar_color: string | null
  appearance: unknown
  job_title: string | null
  department: string | null
  character_type: string | null
  course_id: string | null
  lodging_id: string | null
  net_worth: string
}

async function loadRows(): Promise<WorthRow[]> {
  const { rows } = await pool.query<Row>(
    `SELECT u.id AS user_id, u.username, pp.display_name, pp.avatar_color, pp.department,
            c.appearance, c.character_type, c.course_id, rt.lodging_id,
            (COALESCE(gs.cash, 0)
             + COALESCE((SELECT SUM(paid) FROM home_placements h WHERE h.character_id = c.id), 0)
             + COALESCE((SELECT SUM(bought_price) FROM ride_holdings r WHERE r.character_id = c.id), 0)
             + COALESCE((SELECT SUM(value) FROM land_holdings l WHERE l.character_id = c.id), 0)
             + COALESCE((SELECT SUM(bought_price) FROM business_holdings b WHERE b.character_id = c.id), 0)
            )::text AS net_worth
     FROM characters c
     JOIN users u ON u.id = c.user_id
     JOIN game_state gs ON gs.character_id = c.id
     LEFT JOIN player_profiles pp ON pp.user_id = u.id
     LEFT JOIN rent rt ON rt.character_id = c.id`,
  )
  return rows.map((r) => ({
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name ?? r.username,
    netWorth: Number(r.net_worth),
    detail: detailLine(shownDepartment(r.department ?? departmentForCourse(r.course_id), r.character_type), r.lodging_id),
    appearance: r.appearance ?? null,
    avatarColor: r.avatar_color ?? '#3d9ad6',
  }))
}

export async function getForbesBoard(viewerId: string | null, offset = 0): Promise<Board & { updatedAt: string }> {
  const now = Date.now()
  if (!cache || now - cache.at >= CACHE_MS) cache = { rows: await loadRows(), at: now }
  return { ...buildBoard(cache.rows, adminSet(env.ADMIN_USERNAMES), viewerId, offset), updatedAt: new Date(cache.at).toISOString() }
}
