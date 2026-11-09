import type { FastifyInstance } from 'fastify'
import { getSessionUser } from '../auth/current-user.js'
import { pool } from '../db.js'
import { createHomeTicket } from '../game/club-live.js'
import { ensurePlot, listHouses } from '../game/houses.js'

/** Houses on the map: everyone's plot (GET /houses) and yours, given on first ask (POST /houses/me). */
export async function houseRoutes(app: FastifyInstance) {
  app.get('/houses', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    return { ok: true, houses: await listHouses() }
  })

  // Live room inside a home (owner + visitors see each other); the socket is /ws/club
  app.post('/homes/:username/live-ticket', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const { username } = request.params as { username: string }
    if (!/^[A-Za-z0-9_]{1,40}$/.test(username)) return reply.code(400).send({ ok: false, error: 'Bad username.' })
    const ticket = await createHomeTicket(user.id, username)
    if (!ticket) return reply.code(404).send({ ok: false, error: 'No such home.' })
    // Visiting someone's home builds closeness (once an hour per pair)
    void pool
      .query<{ id: string }>('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username])
      .then(async (owner) => {
        const id = owner.rows[0]?.id
        if (id && id !== user.id) await (await import('../game/bae.js')).addCloseness(user.id, id, 2, 'visit', 3600)
      })
      .catch(() => {})
    return { ok: true, ...ticket }
  })

  app.post('/houses/me', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    return { ok: true, plot: await ensurePlot(user.id) }
  })
}
