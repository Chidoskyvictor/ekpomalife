import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { roomFail } from '../game/economy-codes.js'
import { getHomeBuy, getHomePlacements, moveHomeItem, placeHomeItem, sellHomeItem } from '../game/home-buy.js'
import { isUuidV4, readIdempotencyKey } from '../game/idempotency.js'

function requireIdemKey(request: FastifyRequest, reply: FastifyReply): string | null {
  const key = readIdempotencyKey(request.headers as Record<string, unknown>)
  if (!key || !isUuidV4(key)) {
    const f = roomFail('IDEMPOTENCY_KEY_REQUIRED')
    reply.code(400).send({ ok: false, error: f.error, code: f.code })
    return null
  }
  return key
}

const spotSchema = {
  x: z.number().int().min(0).max(40),
  z: z.number().int().min(0).max(40),
  rot: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
}

type Failure = { ok: false; error: string; code: number; reason?: string }

function send(reply: FastifyReply, result: { ok: boolean }) {
  if (result.ok) return reply.send(result)
  const f = result as Failure
  return reply.code(f.code).send({ ok: false, error: f.error, reason: f.reason })
}

export async function homeBuyRoutes(app: FastifyInstance) {
  const limit = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }

  app.get('/home/furniture', limit, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    try {
      return send(reply, await getHomeBuy(user.id))
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not load your furniture.' })
    }
  })

  app.get<{ Params: { username: string } }>('/home/furniture/:username', limit, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    try {
      return send(reply, await getHomePlacements(user.id, request.params.username))
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not load that home.' })
    }
  })

  app.post('/home/place', limit, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const key = requireIdemKey(request, reply)
    if (!key) return
    const parsed = z.object({ itemId: z.string().min(1).max(60), ...spotSchema }).safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Pick an item and a spot.' })
    try {
      const { itemId, ...spot } = parsed.data
      return send(reply, await placeHomeItem(user.id, itemId, spot, key))
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not buy that.' })
    }
  })

  app.post('/home/move', limit, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const key = requireIdemKey(request, reply)
    if (!key) return
    const parsed = z.object({ id: z.string().min(1).max(60), ...spotSchema }).safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Pick a spot.' })
    try {
      const { id, ...spot } = parsed.data
      return send(reply, await moveHomeItem(user.id, id, spot, key))
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not move that.' })
    }
  })

  app.post('/home/sell', limit, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const key = requireIdemKey(request, reply)
    if (!key) return
    const parsed = z.object({ id: z.string().min(1).max(60) }).safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Pick what to sell.' })
    try {
      return send(reply, await sellHomeItem(user.id, parsed.data.id, key))
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not sell that.' })
    }
  })
}
