import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { env } from '../env.js'
import { getSessionUser } from '../auth/current-user.js'
import {
  breakUp,
  cancelRequest,
  claimAnniversary,
  devSeedCloseness,
  getRequest,
  listFamily,
  markEventsSeen,
  planDate,
  removeRelative,
  respondRequest,
  sendRequest,
  setHideStatus,
  setSneaky,
  withPlayer,
} from '../game/bae.js'

const name = z.string().regex(/^[A-Za-z0-9_]{1,40}$/)
const rate = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }

/** Bae & Family: requests (chat card / Family app / notifications share these), baes, relatives, dates. */
export async function familyRoutes(app: FastifyInstance) {
  const send = (reply: { code: (n: number) => { send: (b: unknown) => unknown } }, r: { ok: boolean; code?: number; error?: string }) =>
    r.ok ? r : reply.code(r.code ?? 400).send({ ok: false, error: r.error })
  const auth = async (request: Parameters<typeof getSessionUser>[0], reply: { code: (n: number) => { send: (b: unknown) => unknown } }) => {
    const user = await getSessionUser(request)
    if (!user) reply.code(401).send({ ok: false, error: 'Log in to play.' })
    return user
  }
  const bad = (reply: { code: (n: number) => { send: (b: unknown) => unknown } }) => reply.code(400).send({ ok: false, error: 'Bad request.' })

  app.get('/family', rate, async (request, reply) => {
    const user = await auth(request, reply)
    if (!user) return
    return send(reply, await listFamily(user.id))
  })

  app.post('/family/seen', rate, async (request, reply) => {
    const user = await auth(request, reply)
    if (!user) return
    return send(reply, await markEventsSeen(user.id))
  })

  app.get<{ Params: { username: string } }>('/family/with/:username', rate, async (request, reply) => {
    const user = await auth(request, reply)
    if (!user) return
    if (!name.safeParse(request.params.username).success) return bad(reply)
    return send(reply, await withPlayer(user.id, request.params.username))
  })

  const reqBody = z.object({ kind: z.enum(['bae', 'relative']), relation: z.string().max(20).optional() })
  app.post<{ Params: { username: string } }>('/family/with/:username/request', rate, async (request, reply) => {
    const user = await auth(request, reply)
    if (!user) return
    const body = reqBody.safeParse(request.body)
    if (!body.success || !name.safeParse(request.params.username).success) return bad(reply)
    return send(reply, await sendRequest(user.id, request.params.username, body.data.kind, body.data.relation))
  })

  app.get<{ Params: { id: string } }>('/family/requests/:id', rate, async (request, reply) => {
    const user = await auth(request, reply)
    if (!user) return
    return send(reply, await getRequest(user.id, request.params.id))
  })

  app.post<{ Params: { id: string } }>('/family/requests/:id/respond', rate, async (request, reply) => {
    const user = await auth(request, reply)
    if (!user) return
    const body = z.object({ accept: z.boolean() }).safeParse(request.body)
    if (!body.success) return bad(reply)
    return send(reply, await respondRequest(user.id, request.params.id, body.data.accept))
  })

  app.post<{ Params: { id: string } }>('/family/requests/:id/cancel', rate, async (request, reply) => {
    const user = await auth(request, reply)
    if (!user) return
    return send(reply, await cancelRequest(user.id, request.params.id))
  })

  app.post<{ Params: { username: string } }>('/family/baes/:username/sneaky', rate, async (request, reply) => {
    const user = await auth(request, reply)
    if (!user) return
    const body = z.object({ on: z.boolean() }).safeParse(request.body)
    if (!body.success || !name.safeParse(request.params.username).success) return bad(reply)
    return send(reply, await setSneaky(user.id, request.params.username, body.data.on))
  })

  app.post<{ Params: { username: string } }>('/family/baes/:username/breakup', rate, async (request, reply) => {
    const user = await auth(request, reply)
    if (!user) return
    if (!name.safeParse(request.params.username).success) return bad(reply)
    return send(reply, await breakUp(user.id, request.params.username))
  })

  app.post<{ Params: { username: string } }>('/family/baes/:username/date', rate, async (request, reply) => {
    const user = await auth(request, reply)
    if (!user) return
    const body = z.object({ spot: z.string().max(20) }).safeParse(request.body)
    if (!body.success || !name.safeParse(request.params.username).success) return bad(reply)
    return send(reply, await planDate(user.id, request.params.username, body.data.spot))
  })

  app.post<{ Params: { username: string } }>('/family/baes/:username/anniversary', rate, async (request, reply) => {
    const user = await auth(request, reply)
    if (!user) return
    if (!name.safeParse(request.params.username).success) return bad(reply)
    return send(reply, await claimAnniversary(user.id, request.params.username))
  })

  app.post<{ Params: { username: string } }>('/family/relatives/:username/remove', rate, async (request, reply) => {
    const user = await auth(request, reply)
    if (!user) return
    if (!name.safeParse(request.params.username).success) return bad(reply)
    return send(reply, await removeRelative(user.id, request.params.username))
  })

  app.post('/family/settings', rate, async (request, reply) => {
    const user = await auth(request, reply)
    if (!user) return
    const body = z.object({ hideStatus: z.boolean() }).safeParse(request.body)
    if (!body.success) return bad(reply)
    return send(reply, await setHideStatus(user.id, body.data.hideStatus))
  })

  // Dev only: jump a pair to 40 closeness so two test accounts can try the flow
  if (env.NODE_ENV !== 'production') {
    app.post<{ Params: { username: string } }>('/family/dev/closeness/:username', rate, async (request, reply) => {
      const user = await auth(request, reply)
      if (!user) return
      if (!name.safeParse(request.params.username).success) return bad(reply)
      return send(reply, await devSeedCloseness(user.id, request.params.username))
    })
  }
}
