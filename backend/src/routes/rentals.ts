import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { listRentals, moveToRental } from '../game/rentals.js'

const body = z.object({ lodgingId: z.string().min(1).max(40) })

/** The phone's Houses app: see the places for rent (GET /rentals), move to one (POST /rentals/move). */
export async function rentalsRoutes(app: FastifyInstance) {
  app.get('/rentals', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in first.' })
    const res = await listRentals(user.id)
    if (!res.ok) return reply.code(res.code).send({ ok: false, error: res.error })
    return res
  })

  app.post('/rentals/move', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in first.' })
    const parsed = body.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Pick a place.' })
    const res = await moveToRental(user.id, parsed.data.lodgingId)
    if (!res.ok) return reply.code(res.code).send({ ok: false, error: res.error })
    return res
  })
}
