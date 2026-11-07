import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getSessionUser, type SessionUser } from '../auth/current-user.js'
import { env } from '../env.js'
import { adminAnonAction, listAnonReports } from '../game/anonymous.js'
import { adminBanHost, adminEndSpace, listSpaceReports, type SpacesFail } from '../game/spaces.js'
import {
  adminDeletePost,
  adminHide,
  adminPost,
  adminReject,
  adminReward,
  adminStats,
  adminSubmissions,
  adminTopups,
} from '../game/hub.js'

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

  app.get('/admin/anonymous/reports', rate(60), async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return
    return reply.send(await listAnonReports())
  })

  // dismiss | remove | warn | ban on a reported Anonymous post or comment
  app.post('/admin/anonymous/:type/:id/:action', rate(60), async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return
    const p = z
      .object({
        type: z.enum(['post', 'comment']),
        id: z.string().min(1).max(64),
        action: z.enum(['dismiss', 'remove', 'warn', 'ban']),
      })
      .safeParse(request.params)
    if (!p.success) return reply.code(400).send({ ok: false, code: 'BAD_INPUT', error: 'Bad request.' })
    const result = await adminAnonAction(p.data.type, p.data.id, p.data.action)
    if (result.ok === false) return reply.code(result.status).send({ ok: false, code: result.code, error: result.error })
    return reply.send(result)
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

  // —— Admin dashboard (/admin): who you are, stats, revenue, Innovation Hub review ——
  app.get('/admin/me', rate(60), async (request, reply) => {
    const admin = await requireAdmin(request, reply)
    if (!admin) return
    return reply.send({ ok: true, username: admin.username })
  })

  app.get('/admin/stats', rate(60), async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return
    return reply.send(await adminStats())
  })

  app.get('/admin/topups', rate(60), async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return
    const q = z.object({ status: z.enum(['success', 'pending', 'failed']).default('success') }).safeParse(request.query)
    return reply.send(await adminTopups(q.success ? q.data.status : 'success'))
  })

  app.get('/admin/hub/submissions', rate(60), async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return
    const q = z.object({ status: z.enum(['new', 'rewarded', 'rejected', 'all']).default('new') }).safeParse(request.query)
    return reply.send(await adminSubmissions(q.success ? q.data.status : 'new'))
  })

  app.post('/admin/hub/submissions/:id/reward', rate(30), async (request, reply) => {
    const admin = await requireAdmin(request, reply)
    if (!admin) return
    const id = idParam.safeParse(request.params)
    const body = z.object({ amount: z.number().int() }).safeParse(request.body)
    if (!id.success || !body.success) return reply.code(400).send({ ok: false, error: 'Choose an amount.' })
    return hubSend(reply, await adminReward(admin.username, id.data.id, body.data.amount))
  })

  app.post('/admin/hub/submissions/:id/reject', rate(30), async (request, reply) => {
    const admin = await requireAdmin(request, reply)
    if (!admin) return
    const id = idParam.safeParse(request.params)
    if (!id.success) return reply.code(400).send({ ok: false, error: 'Bad id.' })
    return hubSend(reply, await adminReject(admin.username, id.data.id))
  })

  app.post('/admin/hub/submissions/:id/hide', rate(30), async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return
    const id = idParam.safeParse(request.params)
    const body = z.object({ hidden: z.boolean() }).safeParse(request.body)
    if (!id.success || !body.success) return reply.code(400).send({ ok: false, error: 'Bad request.' })
    return hubSend(reply, await adminHide(id.data.id, body.data.hidden))
  })

  app.post('/admin/hub/posts', rate(20), async (request, reply) => {
    const admin = await requireAdmin(request, reply)
    if (!admin) return
    const body = z.object({ body: z.string().min(1).max(4000) }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ ok: false, error: 'Write the update first.' })
    return hubSend(reply, await adminPost(admin.username, body.data.body))
  })

  app.post('/admin/hub/posts/:id/delete', rate(20), async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return
    const id = idParam.safeParse(request.params)
    if (!id.success) return reply.code(400).send({ ok: false, error: 'Bad id.' })
    return hubSend(reply, await adminDeletePost(id.data.id))
  })
}

function hubSend(reply: FastifyReply, result: { ok: false; error: string; code: number } | ({ ok: true } & Record<string, unknown>)) {
  if (result.ok === false) return reply.code(result.code).send({ ok: false, error: result.error })
  return reply.send(result)
}
