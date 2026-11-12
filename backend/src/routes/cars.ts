import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { buyCar, buyParking, driveCar, fixCar, getGarage, paintCar, parkCar, sellCar } from '../game/cars.js'
import { createRace, finishRace, inviteToRace, raceVoiceAccess, joinRace, leaveRace, listRaces, startRace } from '../game/car-races.js'
import { createMapTicket } from '../game/club-live.js'
import { joinToken, liveKitConfig, raceRoom } from '../game/livekit.js'
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
  write('/cars/fix', z.object({ carId }), 'Pick a car.', (u, b, k) => fixCar(u, b.carId, k))
  write('/cars/sell', z.object({ carId }), 'Pick a car.', (u, b, k) => sellCar(u, b.carId, k))

  /* —— Drag races —— */
  const spot = z.number().min(-20000).max(20000)
  const raceId = z.string().min(1).max(64)

  app.get('/cars/races', { config: { rateLimit: { max: 90, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    try {
      return send(reply, await listRaces(user.id))
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not load the races.' })
    }
  })
  write(
    '/cars/races',
    z.object({ destId: z.string().min(1).max(80), stake: z.number().int().min(0), x: spot, z: spot, h: z.number().min(-100).max(100), destX: spot, destZ: spot }),
    'Pick where the race ends.',
    (u, b, k) => createRace(u, b, k),
  )
  write('/cars/races/join', z.object({ raceId }), 'Pick a race.', (u, b, k) => joinRace(u, b.raceId, k))

  // Start, finish and leave change a race once: a repeat finds it already changed, so no idempotency key
  function raceStep<T extends z.ZodTypeAny>(path: string, schema: T, run: (userId: string, body: z.infer<T>) => Promise<{ ok: boolean }>) {
    app.post(path, limit, async (request, reply) => {
      const user = await getSessionUser(request)
      if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
      const parsed = schema.safeParse(request.body ?? {})
      if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Pick a race.' })
      try {
        return send(reply, await run(user.id, parsed.data))
      } catch (error) {
        request.log.error(error)
        return reply.code(500).send({ ok: false, error: 'Something went wrong. Try again.' })
      }
    })
  }
  raceStep('/cars/races/start', z.object({ raceId }), (u, b) => startRace(u, b.raceId))
  raceStep('/cars/races/finish', z.object({ raceId, x: spot, z: spot }), (u, b) => finishRace(u, b.raceId, b.x, b.z))
  raceStep('/cars/races/invite', z.object({ raceId, userId: z.string().min(1).max(64) }), (u, b) => inviteToRace(u, b.raceId, b.userId))
  // Live voice for a race's racers (LiveKit, never recorded). Mic starts off; each racer turns their own on.
  app.post('/cars/races/voice', limit, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const parsed = z.object({ raceId }).safeParse(request.body ?? {})
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Pick a race.' })
    const cfg = liveKitConfig()
    if (!cfg) return reply.code(503).send({ ok: false, error: 'Race voice is not available right now.' })
    const access = await raceVoiceAccess(user.id, parsed.data.raceId)
    if (!access.ok) return reply.code(access.code).send({ ok: false, error: access.error })
    const token = joinToken(cfg, { spaceId: parsed.data.raceId, room: raceRoom(parsed.data.raceId), userId: user.id, name: access.username, canPublish: true, ttlSeconds: 30 * 60 })
    return reply.send({ ok: true, url: cfg.url, token })
  })
  raceStep('/cars/races/leave', z.object({ raceId }), (u, b) => leaveRace(u, b.raceId))

  // Parking moves you and the car; no money moves, so no idempotency key
  app.post('/cars/park', limit, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const parsed = z
      .object({ placeId: z.string().min(1).max(80), x: z.number().min(-1000).max(1000), z: z.number().min(-1000).max(1000), dents: z.number().int().min(0).max(9).default(0) })
      .safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Pick where to park.' })
    try {
      const { placeId, x, z: pz, dents } = parsed.data
      return send(reply, await parkCar(user.id, placeId, x, pz, dents))
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not park the car.' })
    }
  })

  // Live room for the map: drivers send where their car is, everyone on the map sees them (socket: /ws/club)
  app.post('/cars/live-ticket', limit, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const ticket = await createMapTicket(user.id)
    if (!ticket) return reply.code(404).send({ ok: false, error: 'No character yet.' })
    return { ok: true, ...ticket }
  })
}
