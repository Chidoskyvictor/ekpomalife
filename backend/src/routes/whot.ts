import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { createWhotTicket, joinWhot } from '../game/whot-live.js'
import {
  createWhotTable,
  getWhotTable,
  joinWhotTable,
  leaveWhotTable,
  rewardWhotCpuWin,
  seatInWhotTable,
  startWhotTable,
} from '../game/whot-tables.js'

const notLoggedIn = (reply: FastifyReply) => reply.code(401).send({ ok: false, error: 'Log in to play.' })

type Result = { ok: false; error: string; code: number } | { ok: true }

function send(reply: FastifyReply, result: Result) {
  if (result.ok === false) return reply.code(result.code).send({ ok: false, error: result.error })
  return reply.send(result)
}

const idParams = z.object({ id: z.string().min(1).max(64) })
const createBody = z.object({
  maxPlayers: z.number().int().min(2).max(4).default(4),
  stake: z.number().int().min(0).max(1_000_000_000_000).default(0),
})
const joinBody = z.object({ code: z.string().min(4).max(8) })
const wsQuery = z.object({ ticket: z.string().min(10).max(80).optional() })
const rate = { config: { rateLimit: { max: 40, timeWindow: '1 minute' } } }

export async function whotRoutes(app: FastifyInstance) {
  app.post('/whot/tables', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const parsed = createBody.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Pick table size.' })
    return send(reply, await createWhotTable(user.id, parsed.data))
  })

  app.post('/whot/tables/join', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const parsed = joinBody.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Enter a table code.' })
    return send(reply, await joinWhotTable(user.id, parsed.data.code))
  })

  app.get('/whot/tables/:id', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    return send(reply, await getWhotTable(user.id, idParams.parse(request.params).id))
  })

  app.post('/whot/tables/:id/leave', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    return send(reply, await leaveWhotTable(user.id, idParams.parse(request.params).id))
  })

  app.post('/whot/tables/:id/start', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    return send(reply, await startWhotTable(user.id, idParams.parse(request.params).id))
  })

  app.post('/whot/tables/:id/ticket', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const { id } = idParams.parse(request.params)
    const seat = await seatInWhotTable(user.id, id)
    if (!seat) return reply.code(404).send({ ok: false, error: 'Table not found or not live.' })
    return reply.send({ ok: true, ticket: createWhotTicket(id, seat.characterId, seat.seat), seat: seat.seat })
  })

  app.post('/whot/reward/cpu', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    return send(reply, await rewardWhotCpuWin(user.id))
  })

  app.get('/ws/whot', { websocket: true }, (socket, request) => {
    joinWhot(socket, wsQuery.parse(request.query).ticket)
  })
}
