import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { isUuidV4, readIdempotencyKey } from '../game/idempotency.js'
import { joinLive } from '../game/club-live.js'
import { buyAtVenue, enterVenue, getVenue, liveTicket, sprayAtVenue, venueHeartbeat, venuePeople } from '../game/venues.js'

const notLoggedIn = (reply: FastifyReply) => reply.code(401).send({ ok: false, error: 'Log in to play.' })

/** Paying the door and buying must carry an Idempotency-Key (UUID v4) so a retry never charges twice. */
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

const venueParams = z.object({ id: z.string().min(1).max(40) })
const buySchema = z.object({ itemId: z.string().min(1).max(40) })
const spraySchema = z.object({ amount: z.number().int().positive() })
const wsQuery = z.object({ ticket: z.string().min(10).max(80).optional() })
const peopleQuery = z.object({ offset: z.coerce.number().int().min(0).max(10_000).optional() })
const rate = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }

export async function venueRoutes(app: FastifyInstance) {
  app.get('/venues/:id', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const { id } = venueParams.parse(request.params)
    return send(reply, await getVenue(user.id, id))
  })

  app.post('/venues/:id/enter', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const key = idemKey(request, reply)
    if (!key) return
    const { id } = venueParams.parse(request.params)
    return send(reply, await enterVenue(user.id, id, key))
  })

  app.post('/venues/:id/buy', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const key = idemKey(request, reply)
    if (!key) return
    const { id } = venueParams.parse(request.params)
    const parsed = buySchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Pick something from the menu.' })
    return send(reply, await buyAtVenue(user.id, id, parsed.data.itemId, key))
  })

  app.post('/venues/:id/spray', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const key = idemKey(request, reply)
    if (!key) return
    const { id } = venueParams.parse(request.params)
    const parsed = spraySchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Pick an amount to spray.' })
    return send(reply, await sprayAtVenue(user.id, id, parsed.data.amount, key))
  })

  app.post('/venues/:id/live-ticket', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const { id } = venueParams.parse(request.params)
    return send(reply, await liveTicket(user.id, id))
  })

  // Live crowd socket (opened with a ticket from /live-ticket, so no cookie is needed)
  app.get('/ws/club', { websocket: true }, (socket, request) => {
    joinLive(socket, wsQuery.parse(request.query).ticket)
  })

  app.post('/venues/:id/heartbeat', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const { id } = venueParams.parse(request.params)
    return send(reply, await venueHeartbeat(user.id, id))
  })

  app.post('/venues/:id/leave', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const { id } = venueParams.parse(request.params)
    return send(reply, await venueHeartbeat(user.id, id, true))
  })

  app.get('/venues/:id/people', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const { id } = venueParams.parse(request.params)
    const { offset } = peopleQuery.parse(request.query)
    return send(reply, await venuePeople(user.id, id, offset ?? 0))
  })
}
