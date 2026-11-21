import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { TIP_MAX, TIP_MIN, tipStreetBoy } from '../game/street-tip.js'

/** Tip the street boy. Server-authoritative: amount checked against your cash inside the transaction. */
export async function streetTipRoutes(app: FastifyInstance) {
  app.post('/street/tip', { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const parsed = z.object({ amount: z.number().int().min(TIP_MIN).max(TIP_MAX) }).safeParse(request.body ?? {})
    if (!parsed.success) return reply.code(400).send({ ok: false, error: `Tip between ₦${TIP_MIN} and ₦${TIP_MAX.toLocaleString('en-NG')}.` })
    try {
      const res = await tipStreetBoy(user.id, parsed.data.amount)
      if (res.ok) return reply.send(res)
      return reply.code(res.code ?? 400).send({ ok: false, error: res.error })
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Something went wrong. Try again.' })
    }
  })
}
