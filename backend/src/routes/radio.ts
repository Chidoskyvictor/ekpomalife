import type { FastifyInstance } from 'fastify'
import { env } from '../env.js'
import { getStations } from '../game/radio.js'

/** Station list for the in-game radio. The provider key never leaves the server. */
export async function radioRoutes(app: FastifyInstance) {
  app.get('/radio/stations', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    try {
      const res = await getStations(env.NAIJA_RADIO_API_KEY)
      if (!res.ok) return reply.code(res.code).send({ ok: false, error: res.error })
      reply.header('Cache-Control', 'public, max-age=300')
      return reply.send(res)
    } catch (error) {
      request.log.error(error)
      return reply.code(502).send({ ok: false, error: 'Radio stations are unavailable right now.' })
    }
  })
}
