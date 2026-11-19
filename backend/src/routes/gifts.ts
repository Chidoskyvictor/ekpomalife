import type { FastifyInstance } from 'fastify'
import { getSessionUser } from '../auth/current-user.js'
import { pool } from '../db.js'

/**
 * Gifts paid to players by Ekpoma Life (e.g. the downtime apology in sql/087). The money is
 * already in their bank; these routes only drive the one-time popup that tells them.
 */
export async function giftsRoutes(app: FastifyInstance) {
  const limit = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }

  // The oldest gift this player hasn't seen the popup for yet (or null)
  app.get('/gifts/unseen', limit, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const { rows } = await pool.query<{ gift_id: string; amount: string; title: string; message: string; signed: string | null }>(
      `SELECT g.gift_id, g.amount, g.title, g.message, g.signed
         FROM player_gifts g
         JOIN characters c ON c.id = g.character_id
        WHERE c.user_id = $1 AND g.seen_at IS NULL
        ORDER BY g.paid_at
        LIMIT 1`,
      [user.id],
    )
    const g = rows[0]
    return reply.send({
      ok: true,
      gift: g ? { id: g.gift_id, amount: Number(g.amount), title: g.title, message: g.message, signed: g.signed } : null,
    })
  })

  // The player saw it: don't show it again
  app.post<{ Params: { id: string } }>('/gifts/:id/seen', limit, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    await pool.query(
      `UPDATE player_gifts g SET seen_at = NOW()
         FROM characters c
        WHERE c.id = g.character_id AND c.user_id = $1 AND g.gift_id = $2 AND g.seen_at IS NULL`,
      [user.id, String(request.params.id).slice(0, 80)],
    )
    return reply.send({ ok: true })
  })
}
