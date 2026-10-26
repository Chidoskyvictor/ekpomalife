import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getSessionUser, type SessionUser } from '../auth/current-user.js'
import { env } from '../env.js'
import { adminBanHost, adminEndSpace, listSpaceReports, type SpacesFail } from '../game/spaces.js'

const admins = () =>
  new Set(
    env.ADMIN_USERNAMES.split(',')
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean),
  )

/** Logged-in player whose username is in ADMIN_USERNAMES; otherwise replies 401/403 and returns null. */
async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<SessionUser | null> {
  const user = await getSessionUser(request)
  if (!user) {
    void reply.code(401).send({ ok: false, error: 'Log in first.' })
    return null
  }
  if (!admins().has(user.username.toLowerCase())) {
    void reply.code(403).send({ ok: false, code: 'NOT_ADMIN', error: 'Admins only.' })
    return null
  }
  return user
}

const idParam = z.object({ id: z.string().min(1).max(64) })
const rate = (max: number) => ({ config: { rateLimit: { max, timeWindow: '1 minute' } } })

function send(reply: FastifyReply, result: SpacesFail | { ok: true }) {
  if (result.ok === false) return reply.code(result.status).send({ ok: false, code: result.code, error: result.error })
  return reply.send(result)
}

export async function adminRoutes(app: FastifyInstance) {
  app.get('/admin/space-reports', rate(60), async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return
    return reply.send(await listSpaceReports())
  })

  app.post('/admin/spaces/:id/end', rate(30), async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return
    const id = idParam.safeParse(request.params)
    if (!id.success) return reply.code(400).send({ ok: false, code: 'BAD_ID', error: 'Bad Space.' })
    return send(reply, await adminEndSpace(id.data.id))
  })

  app.post('/admin/spaces/:id/ban-host', rate(30), async (request, reply) => {
    const admin = await requireAdmin(request, reply)
    if (!admin) return
    const id = idParam.safeParse(request.params)
    if (!id.success) return reply.code(400).send({ ok: false, code: 'BAD_ID', error: 'Bad Space.' })
    return send(reply, await adminBanHost(admin.id, id.data.id))
  })
}
