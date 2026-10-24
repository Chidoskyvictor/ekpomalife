import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { getCoin, launchCoin, listCoins, toggleCoinFollow, tradeCoin } from '../game/crypto.js'
import { isUuidV4, readIdempotencyKey } from '../game/idempotency.js'

const notLoggedIn = (reply: FastifyReply) => reply.code(401).send({ ok: false, error: 'Log in to play.' })

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

const launchSchema = z.object({
  ticker: z.string().min(2).max(9),
  name: z.string().min(2).max(24),
  emoji: z.string().max(8).default('🪙'),
  description: z.string().max(140).default(''),
  devBuy: z.coerce.number().min(0).max(1_000_000_000).default(0),
})
const tradeSchema = z.object({ amount: z.coerce.number().positive().max(1_000_000_000) })
const idParam = z.object({ id: z.string().min(1).max(64) })
const rate = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }

export async function cryptoRoutes(app: FastifyInstance) {
  app.get('/crypto', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    return reply.send(await listCoins(user.id))
  })

  app.get('/crypto/:id', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const parsed = idParam.safeParse(request.params)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Bad coin.' })
    return send(reply, await getCoin(user.id, parsed.data.id))
  })

  app.post('/crypto/launch', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const key = idemKey(request, reply)
    if (!key) return
    const parsed = launchSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Check the ticker and name.' })
    return send(reply, await launchCoin(user.id, parsed.data, key))
  })

  for (const side of ['buy', 'sell'] as const) {
    app.post(`/crypto/:id/${side}`, rate, async (request, reply) => {
      const user = await getSessionUser(request)
      if (!user) return notLoggedIn(reply)
      const key = idemKey(request, reply)
      if (!key) return
      const id = idParam.safeParse(request.params)
      const body = tradeSchema.safeParse(request.body)
      if (!id.success || !body.success) return reply.code(400).send({ ok: false, error: 'Enter an amount.' })
      return send(reply, await tradeCoin(user.id, id.data.id, side, body.data.amount, key))
    })
  }

  app.post('/crypto/:id/follow', rate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const parsed = idParam.safeParse(request.params)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Bad coin.' })
    return send(reply, await toggleCoinFollow(user.id, parsed.data.id))
  })
}
