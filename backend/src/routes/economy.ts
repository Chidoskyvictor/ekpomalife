import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import {
  applyForJob,
  buyItem,
  getRent,
  listHustles,
  listInventory,
  listJobs,
  listLedger,
  listShop,
  payRent,
  runHustle,
  useInventoryItem,
  workShift,
} from '../game/economy.js'
import {
  getIdempotentResponse,
  readIdempotencyKey,
  saveIdempotentResponse,
} from '../game/idempotency.js'

function fail(
  reply: { code: (status: number) => { send: (body: unknown) => unknown } },
  result: { error: string; code: number },
) {
  return reply.code(result.code).send({ ok: false, error: result.error })
}

async function withIdempotency(
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string,
  route: string,
  run: () => Promise<{ status: number; body: unknown }>,
) {
  const key = readIdempotencyKey(request.headers as Record<string, unknown>)
  if (!key) {
    return reply.code(400).send({ ok: false, error: 'Idempotency-Key header required.' })
  }
  const cached = await getIdempotentResponse(userId, route, key)
  if (cached) {
    return reply.code(cached.statusCode).send(cached.body)
  }
  const result = await run()
  await saveIdempotentResponse(userId, route, key, result.status, result.body)
  return reply.code(result.status).send(result.body)
}

export async function economyRoutes(app: FastifyInstance) {
  app.get('/jobs', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const placeId = (request.query as { placeId?: string }).placeId ?? null
    try {
      const result = await listJobs(user.id, placeId)
      if (!result.ok) return fail(reply, result)
      return reply.send({ ok: true, jobs: result.jobs, currentJobId: result.currentJobId })
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not load jobs.' })
    }
  })

  app.post('/jobs/apply', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const parsed = z.object({ jobId: z.string().min(1).max(80) }).safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'Pick a job.' })
    }
    return withIdempotency(request, reply, user.id, 'POST /jobs/apply', async () => {
      try {
        const result = await applyForJob(user.id, parsed.data.jobId)
        if (!result.ok) return { status: result.code, body: { ok: false, error: result.error } }
        return { status: 200, body: { ok: true, job: result.job, message: result.message } }
      } catch (error) {
        request.log.error(error)
        return { status: 500, body: { ok: false, error: 'Could not apply for that job.' } }
      }
    })
  })

  app.post('/jobs/shift', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    return withIdempotency(request, reply, user.id, 'POST /jobs/shift', async () => {
      try {
        const result = await workShift(user.id)
        if (!result.ok) return { status: result.code, body: { ok: false, error: result.error } }
        return {
          status: 200,
          body: {
            ok: true,
            state: result.state,
            earned: result.earned,
            xp: result.xp,
            levelUp: result.levelUp,
            message: result.message,
          },
        }
      } catch (error) {
        request.log.error(error)
        return { status: 500, body: { ok: false, error: 'Could not finish the shift.' } }
      }
    })
  })

  app.get('/shop', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const placeId = (request.query as { placeId?: string }).placeId ?? 'town-shop-1'
    try {
      const result = await listShop(user.id, placeId)
      if (!result.ok) return fail(reply, result)
      return reply.send({ ok: true, items: result.items, placeId: result.placeId })
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not load the shop.' })
    }
  })

  app.post('/shop/buy', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const parsed = z
      .object({
        itemId: z.string().min(1).max(80),
        qty: z.number().int().positive().max(99).optional(),
      })
      .safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'Pick what to buy.' })
    }
    return withIdempotency(request, reply, user.id, 'POST /shop/buy', async () => {
      try {
        const result = await buyItem(user.id, parsed.data.itemId, parsed.data.qty ?? 1)
        if (!result.ok) return { status: result.code, body: { ok: false, error: result.error } }
        return {
          status: 200,
          body: {
            ok: true,
            state: result.state,
            inventory: result.inventory,
            message: result.message,
            questComplete: result.questComplete,
          },
        }
      } catch (error) {
        request.log.error(error)
        return { status: 500, body: { ok: false, error: 'Could not buy that.' } }
      }
    })
  })

  app.get('/inventory', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    try {
      const result = await listInventory(user.id)
      if (!result.ok) return fail(reply, result)
      return reply.send({ ok: true, items: result.items })
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not load inventory.' })
    }
  })

  app.post('/inventory/use', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const parsed = z.object({ itemId: z.string().min(1).max(80) }).safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'Pick an item.' })
    }
    return withIdempotency(request, reply, user.id, 'POST /inventory/use', async () => {
      try {
        const result = await useInventoryItem(user.id, parsed.data.itemId)
        if (!result.ok) return { status: result.code, body: { ok: false, error: result.error } }
        return {
          status: 200,
          body: {
            ok: true,
            state: result.state,
            inventory: result.inventory,
            message: result.message,
          },
        }
      } catch (error) {
        request.log.error(error)
        return { status: 500, body: { ok: false, error: 'Could not use that item.' } }
      }
    })
  })

  app.get('/rent', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    try {
      const result = await getRent(user.id)
      if (!result.ok) return fail(reply, result)
      return reply.send({ ok: true, rent: result.rent })
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not load rent.' })
    }
  })

  app.post('/rent/pay', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    return withIdempotency(request, reply, user.id, 'POST /rent/pay', async () => {
      try {
        const result = await payRent(user.id)
        if (!result.ok) return { status: result.code, body: { ok: false, error: result.error } }
        return {
          status: 200,
          body: {
            ok: true,
            state: result.state,
            rent: result.rent,
            message: result.message,
          },
        }
      } catch (error) {
        request.log.error(error)
        return { status: 500, body: { ok: false, error: 'Could not pay rent.' } }
      }
    })
  })

  app.get('/hustles', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    try {
      const result = await listHustles(user.id)
      if (!result.ok) return fail(reply, result)
      return reply.send({
        ok: true,
        hustles: result.hustles,
        hustleLockoutUntil: result.hustleLockoutUntil,
      })
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not load hustles.' })
    }
  })

  app.post('/hustles/run', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const parsed = z.object({ hustleId: z.string().min(1).max(80) }).safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'Pick a hustle.' })
    }
    return withIdempotency(request, reply, user.id, 'POST /hustles/run', async () => {
      try {
        const result = await runHustle(user.id, parsed.data.hustleId)
        if (!result.ok) return { status: result.code, body: { ok: false, error: result.error } }
        return {
          status: 200,
          body: {
            ok: true,
            state: result.state,
            outcome: result.outcome,
            earned: result.earned,
            fine: result.fine,
            message: result.message,
          },
        }
      } catch (error) {
        request.log.error(error)
        return { status: 500, body: { ok: false, error: 'Could not run that hustle.' } }
      }
    })
  })

  app.get('/ledger', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const query = request.query as { limit?: string; cursor?: string }
    const limitRaw = query.limit
    const limit = limitRaw ? Number(limitRaw) : 20
    const cursor = query.cursor?.trim() || null
    try {
      const result = await listLedger(user.id, Number.isFinite(limit) ? limit : 20, cursor)
      if (!result.ok) return fail(reply, result)
      return reply.send({
        ok: true,
        entries: result.entries,
        cash: result.cash,
        nextCursor: result.nextCursor ?? null,
      })
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not load ledger.' })
    }
  })
}
