import type { FastifyInstance } from 'fastify'
import { getSessionUser } from '../auth/current-user.js'
import { getForbesBoard } from '../game/forbes.js'

/** GET /forbes?offset=: a page (100) of players by net worth, the caller's own rank, and how many are ranked. Admins are never listed. */
export async function forbesRoutes(app: FastifyInstance) {
  app.get('/forbes', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to see the list.' })
    try {
      const raw = Number((request.query as { offset?: string }).offset)
      const offset = Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 0), 1_000_000) : 0
      const board = await getForbesBoard(user.id, offset)
      return { ok: true, ...board }
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not load the list. Try again.' })
    }
  })
}
