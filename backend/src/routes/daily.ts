import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { checkIn, chooseStory, getStreak, nextStory } from '../game/daily-hooks.js'

const choose = z.object({ seq: z.number().int().min(1).max(10), choice: z.number().int().min(0).max(1) })

/** Login streak (GET /streak, POST /streak/checkin) and story moments (GET /stories/next, POST /stories/choose). */
export async function dailyRoutes(app: FastifyInstance) {
  app.get('/streak', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const r = await getStreak(user.id)
    if (!r.ok) return reply.code(r.code).send({ ok: false, error: r.error })
    return { ok: true, streak: r.streak }
  })

  app.post('/streak/checkin', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    try {
      const r = await checkIn(user.id)
      if (!r.ok) return reply.code(r.code).send({ ok: false, error: r.error })
      return { ok: true, checkin: r.checkin }
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not check you in. Try again.' })
    }
  })

  app.get('/stories/next', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    try {
      const r = await nextStory(user.id)
      if (!r.ok) return reply.code(r.code).send({ ok: false, error: r.error })
      return { ok: true, story: r.story }
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not load stories.' })
    }
  })

  app.post('/stories/choose', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const parsed = choose.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Pick one of the two choices.' })
    try {
      const r = await chooseStory(user.id, parsed.data.seq, parsed.data.choice)
      if (!r.ok) return reply.code(r.code).send({ ok: false, error: r.error })
      return { ok: true, result: r.result }
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not save your choice. Try again.' })
    }
  })
}
