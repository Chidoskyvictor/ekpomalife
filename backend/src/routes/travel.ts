import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { getTravelOptions, trek } from '../game/travel.js'

type Fail = { error: string; code: number | string; status?: number }

function fail(reply: { code: (status: number) => { send: (body: unknown) => unknown } }, result: Fail) {
  // Setup gates use a numeric HTTP code; travel errors carry a string code + status
  const status = typeof result.code === 'number' ? result.code : (result.status ?? 400)
  const body: Record<string, unknown> = { ok: false, error: result.error }
  if (typeof result.code === 'string') body.code = result.code
  return reply.code(status).send(body)
}

export async function travelRoutes(app: FastifyInstance) {
  app.get('/travel/options', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    try {
      const result = await getTravelOptions(user.id)
      if (!result.ok) return fail(reply, result)
      return reply.send(result)
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not load places.' })
    }
  })

  app.post('/travel/trek', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const parsed = z.object({ to: z.string().min(1).max(80) }).safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'Pick where you are going.', code: 'BAD_PLACE' })
    }
    try {
      const result = await trek(user.id, parsed.data.to)
      if (!result.ok) return fail(reply, result)
      return reply.send(result)
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not start the trek.' })
    }
  })
}
