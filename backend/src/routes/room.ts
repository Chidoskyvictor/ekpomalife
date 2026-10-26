import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { roomFail } from '../game/economy-codes.js'
import { isUuidV4, readIdempotencyKey } from '../game/idempotency.js'
import {
  buyRoomItem,
  getRoom,
  getVisitRoom,
  saveLayout,
  saveStyle,
  sellRoomItem,
} from '../game/room.js'

function fail(
  reply: { code: (status: number) => { send: (body: unknown) => unknown } },
  result: { error: string; code: number; roomCode?: string; uid?: string; room?: unknown },
) {
  const body: Record<string, unknown> = {
    ok: false,
    error: result.error,
  }
  if (result.roomCode) body.code = result.roomCode
  if (result.uid) body.uid = result.uid
  if (result.room) body.room = result.room
  return reply.code(result.code).send(body)
}

function requireIdemKey(request: FastifyRequest, reply: FastifyReply): string | null {
  const key = readIdempotencyKey(request.headers as Record<string, unknown>)
  if (!key || !isUuidV4(key)) {
    const f = roomFail('IDEMPOTENCY_KEY_REQUIRED')
    reply.code(400).send({ ok: false, error: f.error, code: f.code })
    return null
  }
  return key
}

const layoutItemSchema = z.object({
  uid: z.string().min(1).max(80),
  placed: z.boolean(),
  x: z.number().int().min(0).max(20),
  z: z.number().int().min(0).max(20),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
})

export async function roomRoutes(app: FastifyInstance) {
  app.get('/room', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    try {
      const result = await getRoom(user.id)
      if (!result.ok) return fail(reply, result)
      return reply.send({ ok: true, room: result.room, catalog: result.catalog, home: result.home })
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not load your room.' })
    }
  })

  app.get<{ Params: { username: string } }>('/room/:username', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    try {
      const result = await getVisitRoom(user.id, request.params.username)
      if (!result.ok) {
        return fail(reply, {
          error: result.error,
          code: result.code,
          roomCode: 'roomCode' in result ? result.roomCode : undefined,
        })
      }
      return reply.send({ ok: true, room: result.room, readOnly: true })
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not load that room.' })
    }
  })

  app.post('/room/buy', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const key = requireIdemKey(request, reply)
    if (!key) return
    const parsed = z
      .object({
        itemId: z.string().min(1).max(80),
        qty: z.number().int().min(1).max(5).optional(),
      })
      .safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'Pick what to buy for your room.' })
    }
    try {
      const result = await buyRoomItem(user.id, parsed.data.itemId, parsed.data.qty ?? 1, key)
      if (!result.ok) {
        return fail(reply, {
          error: result.error,
          code: result.code,
          roomCode: 'roomCode' in result ? result.roomCode : undefined,
          uid: 'uid' in result ? result.uid : undefined,
        })
      }
      return reply.send({
        ok: true,
        room: result.room,
        state: result.state,
        bought: result.bought,
        message: result.message,
      })
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not buy that.' })
    }
  })

  app.put('/room/layout', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const key = requireIdemKey(request, reply)
    if (!key) return
    const parsed = z
      .object({
        version: z.number().int().nonnegative(),
        items: z.array(layoutItemSchema).max(40),
      })
      .safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'Check your layout and try again.' })
    }
    try {
      const result = await saveLayout(user.id, parsed.data.version, parsed.data.items, key)
      if (!result.ok) {
        return fail(reply, {
          error: result.error,
          code: result.code,
          roomCode: 'roomCode' in result ? result.roomCode : undefined,
          uid: 'uid' in result ? result.uid : undefined,
          room: 'room' in result ? result.room : undefined,
        })
      }
      return reply.send({ ok: true, room: result.room })
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not save layout.' })
    }
  })

  app.put('/room/style', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const key = requireIdemKey(request, reply)
    if (!key) return
    const parsed = z
      .object({
        version: z.number().int().nonnegative(),
        wallColor: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
        floorId: z
          .enum(['cement', 'tiles-white', 'tiles-terracotta', 'wood-laminate', 'rug-carpet'])
          .optional(),
      })
      .safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'Check your style and try again.' })
    }
    try {
      const result = await saveStyle(
        user.id,
        parsed.data.version,
        { wallColor: parsed.data.wallColor, floorId: parsed.data.floorId },
        key,
      )
      if (!result.ok) {
        return fail(reply, {
          error: result.error,
          code: result.code,
          roomCode: 'roomCode' in result ? result.roomCode : undefined,
          room: 'room' in result ? result.room : undefined,
        })
      }
      return reply.send({
        ok: true,
        room: result.room,
        state: result.state,
        charged: result.charged,
        message: result.message,
      })
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not update style.' })
    }
  })

  app.post('/room/sell', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const key = requireIdemKey(request, reply)
    if (!key) return
    const parsed = z.object({ uid: z.string().min(1).max(80) }).safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'Pick what to sell.' })
    }
    try {
      const result = await sellRoomItem(user.id, parsed.data.uid, key)
      if (!result.ok) {
        return fail(reply, {
          error: result.error,
          code: result.code,
          roomCode: 'roomCode' in result ? result.roomCode : undefined,
          uid: 'uid' in result ? result.uid : undefined,
        })
      }
      return reply.send({
        ok: true,
        room: result.room,
        state: result.state,
        refunded: result.refunded,
        message: result.message,
      })
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not sell that.' })
    }
  })
}
