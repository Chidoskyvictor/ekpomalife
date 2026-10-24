import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { STUDY_LEVELS } from '../game/profile-constants.js'
import { getPlayerProfile, patchPlayerProfile, resolveProfileUserId } from '../game/player-profile.js'

const patchBodySchema = z.object({
  displayName: z.string().min(1).max(40).optional(),
  avatarColor: z.string().max(32).optional(),
  avatarEmoji: z.union([z.string().max(8), z.null()]).optional(),
  department: z.string().min(1).max(64).optional(),
  studyLevel: z.enum(STUDY_LEVELS).optional(),
  bio: z.string().max(200).optional(),
})

function firstZodError(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? 'Check the form and try again.'
}

export async function playersRoutes(app: FastifyInstance) {
  app.get('/players/me/profile', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Not logged in.' })

    const profile = await getPlayerProfile(user.id, user.id)
    if (!profile) return reply.code(404).send({ ok: false, error: 'Profile not found.' })
    return reply.send({ ok: true, profile })
  })

  app.patch('/players/me/profile', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Not logged in.' })

    const parsed = patchBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: firstZodError(parsed.error) })
    }

    const result = await patchPlayerProfile(user.id, parsed.data)
    if (!result.ok) {
      return reply.code(result.status).send({ ok: false, error: result.error })
    }
    return reply.send({ ok: true, profile: result.profile })
  })

  app.get('/players/:id/profile', async (request, reply) => {
    const params = request.params as { id: string }
    const viewer = await getSessionUser(request)
    const targetId = await resolveProfileUserId(params.id)
    if (!targetId) return reply.code(404).send({ ok: false, error: 'Player not found.' })

    const profile = await getPlayerProfile(targetId, viewer?.id ?? null)
    if (!profile) return reply.code(404).send({ ok: false, error: 'Player not found.' })
    return reply.send({ ok: true, profile })
  })
}
