import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { isUuidV4, readIdempotencyKey } from '../game/idempotency.js'
import { buyBusiness, buyLand, buyRide, getInvest, sellBusiness, sellLand, sellRide } from '../game/invest.js'

const notLoggedIn = (reply: FastifyReply) => reply.code(401).send({ ok: false, error: 'Log in to play.' })

/** Buys and sells must carry an Idempotency-Key (UUID v4) so a retry never charges twice. */
function idemKey(request: FastifyRequest, reply: FastifyReply) {
  const key = readIdempotencyKey(request.headers as Record<string, unknown>)
  if (!key || !isUuidV4(key)) {
    reply.code(400).send({ ok: false, code: 'IDEMPOTENCY_KEY_REQUIRED', error: 'Something went wrong. Try again.' })
    return null
  }
  return key
}

type Result = { ok: false; error: string; code: number } | { status: number; body: unknown } | { ok: true }

function send(reply: FastifyReply, result: Result) {
  if ('status' in result) return reply.code(result.status).send(result.body)
  if ('ok' in result && result.ok === false) return reply.code(result.code).send({ ok: false, error: result.error })
  return reply.send(result)
}

const areaSchema = z.object({ areaId: z.string().min(1).max(40) })
const kindSchema = z.object({ kind: z.string().min(1).max(20) })
const holdingSchema = z.object({ holdingId: z.string().min(1).max(64) })
const businessSchema = z.object({ businessId: z.string().min(1).max(40) })
const rate = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }

export async function investRoutes(app: FastifyInstance) {
  app.get('/invest', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    return send(reply, await getInvest(user.id))
  })

  app.post('/invest/land/buy', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const key = idemKey(request, reply)
    if (!key) return
    const parsed = areaSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Pick an area.' })
    return send(reply, await buyLand(user.id, parsed.data.areaId, key))
  })

  app.post('/invest/land/sell', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const key = idemKey(request, reply)
    if (!key) return
    const parsed = holdingSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Pick a plot.' })
    return send(reply, await sellLand(user.id, parsed.data.holdingId, key))
  })

  app.post('/invest/rides/buy', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const key = idemKey(request, reply)
    if (!key) return
    const parsed = kindSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Pick a ride.' })
    return send(reply, await buyRide(user.id, parsed.data.kind, key))
  })

  app.post('/invest/rides/sell', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const key = idemKey(request, reply)
    if (!key) return
    const parsed = holdingSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Pick a ride.' })
    return send(reply, await sellRide(user.id, parsed.data.holdingId, key))
  })

  app.post('/invest/business/buy', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const key = idemKey(request, reply)
    if (!key) return
    const parsed = businessSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Pick a business.' })
    return send(reply, await buyBusiness(user.id, parsed.data.businessId, key))
  })

  app.post('/invest/business/sell', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const key = idemKey(request, reply)
    if (!key) return
    const parsed = holdingSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Pick a business.' })
    return send(reply, await sellBusiness(user.id, parsed.data.holdingId, key))
  })
}
