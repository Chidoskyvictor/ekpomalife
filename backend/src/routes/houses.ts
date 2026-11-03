import type { FastifyInstance } from 'fastify'
import { getSessionUser } from '../auth/current-user.js'
import { ensurePlot, listHouses } from '../game/houses.js'

/** Houses on the map: everyone's plot (GET /houses) and yours, given on first ask (POST /houses/me). */
export async function houseRoutes(app: FastifyInstance) {
  app.get('/houses', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    return { ok: true, houses: await listHouses() }
  })

  app.post('/houses/me', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    return { ok: true, plot: await ensurePlot(user.id) }
  })
}
