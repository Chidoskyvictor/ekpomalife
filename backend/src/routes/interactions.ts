import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { doInteraction, getRelation, reportPlayer, respondInteraction, setBlock, setPartner } from '../game/interactions.js'

const name = z.string().regex(/^[A-Za-z0-9_]{1,40}$/)
const rate = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }

/** People you meet in a home: relationship, partner opt-in, block / report, and interactions. */
export async function interactionRoutes(app: FastifyInstance) {
  const send = (reply: { code: (n: number) => { send: (b: unknown) => unknown } }, r: { ok: boolean; code?: number; error?: string }) =>
    r.ok ? r : reply.code(r.code ?? 400).send({ ok: false, error: r.error })

  app.get<{ Params: { username: string } }>('/people/:username/relation', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    if (!name.safeParse(request.params.username).success) return reply.code(400).send({ ok: false, error: 'Bad username.' })
    return send(reply, await getRelation(user.id, request.params.username))
  })

  const flag = z.object({ on: z.boolean() })
  app.post<{ Params: { username: string } }>('/people/:username/partner', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const body = flag.safeParse(request.body)
    if (!body.success || !name.safeParse(request.params.username).success) return reply.code(400).send({ ok: false, error: 'Bad request.' })
    return send(reply, await setPartner(user.id, request.params.username, body.data.on))
  })

  app.post<{ Params: { username: string } }>('/people/:username/block', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const body = flag.safeParse(request.body)
    if (!body.success || !name.safeParse(request.params.username).success) return reply.code(400).send({ ok: false, error: 'Bad request.' })
    return send(reply, await setBlock(user.id, request.params.username, body.data.on))
  })

  app.post<{ Params: { username: string } }>('/people/:username/report', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const body = z.object({ reason: z.string().max(200).optional() }).safeParse(request.body)
    if (!body.success || !name.safeParse(request.params.username).success) return reply.code(400).send({ ok: false, error: 'Bad request.' })
    return send(reply, await reportPlayer(user.id, request.params.username, body.data.reason ?? ''))
  })

  app.post<{ Params: { username: string } }>('/people/:username/act', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const body = z.object({ action: z.string().max(30), home: name }).safeParse(request.body)
    if (!body.success || !name.safeParse(request.params.username).success) return reply.code(400).send({ ok: false, error: 'Bad request.' })
    return send(reply, await doInteraction(user.id, user.username, request.params.username, body.data.home, body.data.action))
  })

  app.post<{ Params: { id: string } }>('/interactions/:id/respond', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const body = z.object({ accept: z.boolean() }).safeParse(request.body)
    if (!body.success) return reply.code(400).send({ ok: false, error: 'Bad request.' })
    return send(reply, await respondInteraction(user.id, request.params.id, body.data.accept))
  })
}
