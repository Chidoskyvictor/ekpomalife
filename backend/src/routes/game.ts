import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { ACTION_IDS } from '../game/actions.js'
import { getPublicState, performGameAction } from '../game/game-state.js'
import { PLACE_IDS } from '../game/places.js'

const actionBody = z.object({
  actionId: z.enum(ACTION_IDS as [string, ...string[]]),
  targetPlaceId: z.string().optional().nullable(),
  version: z.number().int().positive(),
})

export async function gameRoutes(app: FastifyInstance) {
  app.get('/game/state', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })

    try {
      const result = await getPublicState(user.id)
      if (!result.ok) return reply.code(result.code).send({ ok: false, error: result.error })
      return reply.send({ ok: true, ...result.state, placeIds: PLACE_IDS })
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not load game state.' })
    }
  })

  app.post(
    '/game/action',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const user = await getSessionUser(request)
      if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })

      const parsed = actionBody.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          error: parsed.error.issues[0]?.message ?? 'Invalid action.',
        })
      }

      try {
        const result = await performGameAction(user.id, parsed.data)
        if (!result.ok) {
          return reply
            .code(result.code)
            .send({ ok: false, error: result.error, conflict: result.conflict ?? false })
        }
        return reply.send({ ok: true, message: result.message, ...result.state })
      } catch (error) {
        request.log.error(error)
        return reply.code(500).send({ ok: false, error: 'Could not perform action.' })
      }
    },
  )
}
