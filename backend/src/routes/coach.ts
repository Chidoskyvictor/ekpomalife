import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { getCoach, seeTip, tourAction } from '../game/coach.js'
import { TOUR_STEPS } from '../game/coach-rules.js'

const tourBody = z.discriminatedUnion('op', [
  z.object({ op: z.literal('done'), step: z.number().int().min(0).max(TOUR_STEPS - 1) }),
  z.object({ op: z.literal('skip') }),
  z.object({ op: z.literal('replay') }),
])
const tipBody = z.object({ tip: z.string().min(1).max(30) })
const rate = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }

/** First-time tour (GET /coach, POST /coach/tour) and one-time tips (POST /coach/tip). */
export async function coachRoutes(app: FastifyInstance) {
  app.get('/coach', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const r = await getCoach(user.id)
    if (!r.ok) return reply.code(r.code).send({ ok: false, error: r.error })
    return { ok: true, coach: r.coach }
  })

  app.post('/coach/tour', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const parsed = tourBody.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Bad tour step.' })
    try {
      const r = await tourAction(user.id, parsed.data)
      if (!r.ok) return reply.code(r.code).send({ ok: false, error: r.error })
      return { ok: true, coach: r.coach }
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not save. Try again.' })
    }
  })

  app.post('/coach/tip', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const parsed = tipBody.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Bad tip.' })
    try {
      const r = await seeTip(user.id, parsed.data.tip)
      if (!r.ok) return reply.code(r.code).send({ ok: false, error: r.error })
      return { ok: true, coach: r.coach }
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not save. Try again.' })
    }
  })
}
