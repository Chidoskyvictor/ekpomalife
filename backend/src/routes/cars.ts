import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { buyCar, buyParking, driveCar, getGarage, paintCar, sellCar } from '../game/cars.js'
import { isUuidV4, readIdempotencyKey } from '../game/idempotency.js'

type Failure = { ok: false; error: string; code: number; reason?: string }

function send(reply: FastifyReply, result: { ok: boolean }) {
  if (result.ok) return reply.send(result)
  const f = result as Failure
  return reply.code(f.code).send({ ok: false, error: f.error, reason: f.reason })
}

const carId = z.string().min(1).max(64)

/** Magmus Autos: showroom, my garage, parking space. Every write needs an Idempotency-Key (UUID v4). */
export async function carRoutes(app: FastifyInstance) {
  const limit = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }

  app.get('/cars', limit, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    try {
      return send(reply, await getGarage(user.id))
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not load the car lot.' })
    }
  })

  function write<T extends z.ZodTypeAny>(
    path: string,
    schema: T,
    badInput: string,
    run: (userId: string, body: z.infer<T>, key: string) => Promise<{ ok: boolean }>,
  ) {
    app.post(path, limit, async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await getSessionUser(request)
      if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
      const key = readIdempotencyKey(request.headers as Record<string, unknown>)
      if (!key || !isUuidV4(key)) {
        return reply.code(400).send({ ok: false, code: 'IDEMPOTENCY_KEY_REQUIRED', error: 'Something went wrong. Try again.' })
      }
      const parsed = schema.safeParse(request.body ?? {})
      if (!parsed.success) return reply.code(400).send({ ok: false, error: badInput })
      try {
        return send(reply, await run(user.id, parsed.data, key))
      } catch (error) {
        request.log.error(error)
        return reply.code(500).send({ ok: false, error: 'Something went wrong. Try again.' })
      }
    })
  }

  write('/cars/buy', z.object({ modelId: z.string().min(1).max(40), withParking: z.boolean().default(false) }), 'Pick a car.', (u, b, k) =>
    buyCar(u, b.modelId, b.withParking, k),
  )
  write('/cars/parking', z.object({}), 'Try again.', (u, _b, k) => buyParking(u, k))
  write('/cars/drive', z.object({ carId }), 'Pick a car.', (u, b, k) => driveCar(u, b.carId, k))
  write('/cars/paint', z.object({ carId, color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }), 'Pick a colour.', (u, b, k) => paintCar(u, b.carId, b.color, k))
  write('/cars/sell', z.object({ carId }), 'Pick a car.', (u, b, k) => sellCar(u, b.carId, k))
}
