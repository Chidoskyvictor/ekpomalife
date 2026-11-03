import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { SCHOOL_ACTIONS, getSchool, schoolAction, type SchoolAction } from '../game/school.js'

const body = z.object({ action: z.enum(SCHOOL_ACTIONS as [SchoolAction, ...SchoolAction[]]) })

/** AAU school: GET /school (your record), POST /school/action (pay fees, lecture, tutorial, exam). */
export async function schoolRoutes(app: FastifyInstance) {
  app.get('/school', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const result = await getSchool(user.id)
    if (!result.ok) return reply.code(result.code).send({ ok: false, error: result.error })
    return { ok: true, school: result.school }
  })

  app.post(
    '/school/action',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const user = await getSessionUser(request)
      if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
      const parsed = body.safeParse(request.body)
      if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Unknown school action.' })
      try {
        const result = await schoolAction(user.id, parsed.data.action)
        if (!result.ok) return reply.code(result.code).send({ ok: false, error: result.error })
        return { ok: true, school: result.school, message: result.message, result: result.result ?? null }
      } catch (error) {
        request.log.error(error)
        return reply.code(500).send({ ok: false, error: 'Could not reach the school office. Try again.' })
      }
    },
  )
}
