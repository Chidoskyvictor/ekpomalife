import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { createGameTicket, joinGame } from '../game/game-live.js'
import {
  acceptChallenge,
  closeChallenge,
  createChallenge,
  getMatch,
  listMatches,
  quickMatch,
  reportResult,
  rewardCpuWin,
  seatInMatch,
} from '../game/games.js'

const notLoggedIn = (reply: FastifyReply) => reply.code(401).send({ ok: false, error: 'Log in to play.' })

type Result = { ok: false; error: string; code: number } | { ok: true }

function send(reply: FastifyReply, result: Result) {
  if (result.ok === false) return reply.code(result.code).send({ ok: false, error: result.error })
  return reply.send(result)
}

const idParams = z.object({ id: z.string().min(1).max(64) })
const challengeBody = z.object({
  game: z.string().min(1).max(30),
  variant: z.string().max(30).default(''),
  username: z.string().min(1).max(40),
  stake: z.number().int().min(0).max(1_000_000_000_000).default(0),
})
const quickBody = challengeBody.omit({ username: true })
const reportBody = z.object({ winner: z.enum(['me', 'opponent']), forfeit: z.boolean().optional() })
const wsQuery = z.object({ ticket: z.string().min(10).max(80).optional() })
const rate = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }

export async function gamesRoutes(app: FastifyInstance) {
  app.get('/games/matches', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    return send(reply, await listMatches(user.id))
  })

  app.get('/games/matches/:id', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    return send(reply, await getMatch(user.id, idParams.parse(request.params).id))
  })

  app.post('/games/challenges', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const parsed = challengeBody.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Type a username and pick a game.' })
    return send(reply, await createChallenge(user.id, parsed.data))
  })

  app.post('/games/quick', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const parsed = quickBody.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Pick a game.' })
    return send(reply, await quickMatch(user.id, parsed.data))
  })

  app.post('/games/matches/:id/accept', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    return send(reply, await acceptChallenge(user.id, idParams.parse(request.params).id))
  })

  app.post('/games/matches/:id/close', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    return send(reply, await closeChallenge(user.id, idParams.parse(request.params).id))
  })

  app.post('/games/matches/:id/report', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const parsed = reportBody.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Who won?' })
    return send(reply, await reportResult(user.id, idParams.parse(request.params).id, parsed.data))
  })

  app.post('/games/reward', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    return send(reply, await rewardCpuWin(user.id))
  })

  app.post('/games/matches/:id/ticket', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const { id } = idParams.parse(request.params)
    const seat = await seatInMatch(user.id, id)
    if (!seat) return reply.code(404).send({ ok: false, error: 'Match not found.' })
    if (seat.status !== 'active') return reply.code(409).send({ ok: false, error: 'This match is not live.' })
    return reply.send({ ok: true, ticket: createGameTicket(id, seat.character_id, seat.seat), seat: seat.seat })
  })

  // Live match socket (opened with a ticket, no cookie needed)
  app.get('/ws/game', { websocket: true }, (socket, request) => {
    joinGame(socket, wsQuery.parse(request.query).ticket)
  })
}
