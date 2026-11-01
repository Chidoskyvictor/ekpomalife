import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { WALLET_PACKS } from '../game/wallet-packs.js'
import { handlePaystackEvent, initTopup, validPaystackSignature, verifyTopup } from '../game/wallet-topup.js'

const notLoggedIn = (reply: FastifyReply) => reply.code(401).send({ ok: false, error: 'Log in to play.' })
const initSchema = z.object({ pack_id: z.string().min(1).max(40) })
const referenceSchema = z.object({ reference: z.string().min(6).max(80).regex(/^[A-Za-z0-9_-]+$/) })

export async function walletRoutes(app: FastifyInstance) {
  app.get('/wallet/packs', async () => ({
    ok: true,
    currency: 'NGN',
    packs: WALLET_PACKS.map((pack) => ({
      id: pack.id,
      name: pack.name,
      emoji: pack.emoji,
      naira: pack.naira,
      game_money: pack.gameMoney,
      tag: pack.tag ?? null,
      highlight: Boolean(pack.highlight),
    })),
  }))

  app.post('/wallet/topup/init', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const parsed = initSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Pick a pack.' })
    const result = await initTopup(user, parsed.data.pack_id)
    if (!result.ok) return reply.code(result.code).send({ ok: false, error: result.error })
    return result
  })

  app.get('/wallet/topup/verify/:reference', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const parsed = referenceSchema.safeParse(request.params)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Bad reference.' })
    const result = await verifyTopup(user.id, parsed.data.reference)
    if (!result.ok) return reply.code(result.code).send({ ok: false, error: result.error })
    return result
  })

  // Webhook in its own encapsulated scope so the raw-body JSON parser only applies here.
  await app.register(async (scope) => {
    scope.removeContentTypeParser('application/json')
    scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => done(null, body))

    scope.post('/webhooks/paystack', { bodyLimit: 256 * 1024, config: { rateLimit: { max: 600, timeWindow: '1 minute' } } }, async (request, reply) => {
      const raw = request.body as Buffer
      const signature = request.headers['x-paystack-signature']
      if (!Buffer.isBuffer(raw) || !validPaystackSignature(raw, typeof signature === 'string' ? signature : undefined)) {
        return reply.code(401).send({ ok: false })
      }
      let event: { event?: string; data?: { reference?: string; amount?: number; currency?: string; status?: string } }
      try {
        event = JSON.parse(raw.toString('utf8'))
      } catch {
        return reply.code(400).send({ ok: false })
      }
      try {
        const credited = await handlePaystackEvent(event)
        if (credited) request.log.info({ reference: credited.reference }, 'wallet top-up credited (webhook)')
      } catch (error) {
        request.log.error(error, 'paystack webhook credit failed')
        return reply.code(500).send({ ok: false })
      }
      return { ok: true }
    })
  })
}
