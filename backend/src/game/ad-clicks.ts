import { pool } from '../db.js'

/* Billboard ad tracking (sql/069). Players log opens and button taps; admins read the totals. */

export const AD_ACTIONS = ['open', 'whatsapp', 'call', 'group', 'share'] as const
export type AdAction = (typeof AD_ACTIONS)[number]

export async function logAdClick(board: number, adId: string, action: AdAction, userId: string | null) {
  await pool.query(`INSERT INTO ad_clicks (board, ad_id, action, user_id) VALUES ($1, $2, $3, $4)`, [
    board,
    adId,
    action,
    userId,
  ])
}

export type AdTotals = {
  adId: string
  board: number
  action: AdAction
  total: number
  players: number
  guests: number
}

export type AdClickRow = {
  adId: string
  board: number
  action: AdAction
  username: string | null
  at: string
}

/** Totals per ad, board and action, plus the latest 200 taps with who made them. */
export async function adClickReport(): Promise<{ totals: AdTotals[]; recent: AdClickRow[] }> {
  const totals = await pool.query<{ ad_id: string; board: number; action: AdAction; total: string; players: string; guests: string }>(
    `SELECT ad_id, board, action, COUNT(*) AS total,
            COUNT(DISTINCT user_id) AS players,
            COUNT(*) FILTER (WHERE user_id IS NULL) AS guests
       FROM ad_clicks
      GROUP BY ad_id, board, action
      ORDER BY ad_id, board, action`,
  )
  const recent = await pool.query<{ ad_id: string; board: number; action: AdAction; username: string | null; created_at: Date }>(
    `SELECT c.ad_id, c.board, c.action, u.username, c.created_at
       FROM ad_clicks c LEFT JOIN users u ON u.id = c.user_id
      ORDER BY c.created_at DESC
      LIMIT 200`,
  )
  return {
    totals: totals.rows.map((r) => ({
      adId: r.ad_id,
      board: r.board,
      action: r.action,
      total: Number(r.total),
      players: Number(r.players),
      guests: Number(r.guests),
    })),
    recent: recent.rows.map((r) => ({
      adId: r.ad_id,
      board: r.board,
      action: r.action,
      username: r.username,
      at: r.created_at.toISOString(),
    })),
  }
}
