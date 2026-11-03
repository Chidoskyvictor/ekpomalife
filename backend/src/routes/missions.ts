import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { getMissions, missionAction } from '../game/missions.js'

const body = z.object({ action: z.enum(['start', 'finish', 'swap']), missionId: z.string().min(1).max(40) })

/** Daily missions: GET /missions (today's 3), POST /missions/action (start, finish, swap). */
export async function missionRoutes(app: FastifyInstance) {
  app.get('/missions', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const result = await getMissions(user.id)
    if (!result.ok) return reply.code(result.code).send({ ok: false, error: result.error })
    return { ok: true, missions: result.missions }
  })

  app.post('/missions/action', { config: { rateLimit: { max: 40, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const parsed = body.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Unknown mission action.' })
    try {
      const result = await missionAction(user.id, parsed.data.action, parsed.data.missionId)
      if (!result.ok) return reply.code(result.code).send({ ok: false, error: result.error })
      return { ok: true, missions: result.missions, message: result.message }
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not update your missions. Try again.' })
    }
  })
}
