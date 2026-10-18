import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import {
  DATA_BUNDLES,
  PHONE_APP_IDS,
  WALLPAPER_IDS,
  buyData,
  charge,
  getPhone,
  getRideQuote,
  listNotifications,
  openApp,
  setWallpaper,
  takeRide,
  type PhoneAppId,
  type WallpaperId,
} from '../game/phone.js'

function fail(
  reply: { code: (status: number) => { send: (body: unknown) => unknown } },
  result: { error: string; code?: number | string; status?: number },
) {
  const status =
    typeof result.status === 'number'
      ? result.status
      : typeof result.code === 'number'
        ? result.code
        : 400
  const body: { ok: false; error: string; code?: string } = {
    ok: false,
    error: result.error,
  }
  if (typeof result.code === 'string') body.code = result.code
  return reply.code(status).send(body)
}

const moneyRate = {
  config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
}

const openRate = {
  config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
}

const bundleIds = DATA_BUNDLES.map((b) => b.id) as [string, ...string[]]
const appIds = [...PHONE_APP_IDS] as [string, ...string[]]
const wallpaperIds = [...WALLPAPER_IDS] as [string, ...string[]]

export async function phoneRoutes(app: FastifyInstance) {
  app.get('/phone', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    try {
      const result = await getPhone(user.id)
      if (!result.ok) return fail(reply, result)
      return reply.send({
        ok: true,
        phone: result.phone,
        clock: result.clock,
        location: result.location,
        promos: result.promos,
        bundles: result.bundles,
        cash: result.cash,
      })
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not load phone.' })
    }
  })

  app.post('/phone/data/buy', moneyRate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const parsed = z
      .object({
        bundleId: z.enum(bundleIds),
        idempotencyKey: z.string().uuid(),
      })
      .safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid data bundle.',
      })
    }
    try {
      const result = await buyData(user.id, parsed.data.bundleId, parsed.data.idempotencyKey)
      if (!result.ok) return fail(reply, result)
      return reply.send({
        ok: true,
        phone: result.phone,
        cash: result.cash,
        ledgerId: result.ledgerId,
        message: result.message,
        replayed: result.replayed,
      })
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not buy data.' })
    }
  })

  app.post('/phone/charge', moneyRate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const parsed = z
      .object({ action: z.enum(['start', 'stop']) })
      .safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid charge action.',
      })
    }
    try {
      const result = await charge(user.id, parsed.data.action)
      if (!result.ok) return fail(reply, result)
      return reply.send({ ok: true, phone: result.phone, message: result.message })
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not charge phone.' })
    }
  })

  app.post('/phone/open', openRate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const parsed = z.object({ appId: z.enum(appIds) }).safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid app.',
      })
    }
    try {
      const result = await openApp(user.id, parsed.data.appId as PhoneAppId)
      if (!result.ok) return fail(reply, result)
      return reply.send({ ok: true, phone: result.phone, offline: result.offline })
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not open app.' })
    }
  })

  app.patch('/phone/settings', moneyRate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const parsed = z.object({ wallpaper: z.enum(wallpaperIds) }).safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid wallpaper.',
      })
    }
    try {
      const result = await setWallpaper(user.id, parsed.data.wallpaper as WallpaperId)
      if (!result.ok) return fail(reply, result)
      return reply.send({ ok: true, phone: result.phone })
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not save settings.' })
    }
  })

  app.get('/phone/notifications', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    try {
      const result = await listNotifications(user.id)
      if (!result.ok) return fail(reply, result)
      return reply.send({
        ok: true,
        unread: result.unread,
        newApps: result.newApps,
        items: result.items,
      })
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not load notifications.' })
    }
  })

  app.get('/ride/quote', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const to = (request.query as { to?: string }).to
    if (!to) {
      return reply.code(400).send({ ok: false, error: 'Pick where you are going.', code: 'BAD_PLACE' })
    }
    try {
      const result = await getRideQuote(user.id, to)
      if (!result.ok) return fail(reply, result)
      return reply.send({
        ok: true,
        from: result.from,
        to: result.to,
        quotes: result.quotes,
      })
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not quote ride.' })
    }
  })

  app.post('/ride', moneyRate, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const parsed = z
      .object({
        to: z.string().min(1).max(80),
        mode: z.enum(['keke', 'okada']),
        idempotencyKey: z.string().uuid(),
      })
      .safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid ride.',
      })
    }
    try {
      const result = await takeRide(
        user.id,
        parsed.data.to,
        parsed.data.mode,
        parsed.data.idempotencyKey,
      )
      if (!result.ok) return fail(reply, result)
      return reply.send({
        ok: true,
        state: result.state,
        fare: result.fare,
        cash: result.cash,
        ledgerId: result.ledgerId,
        message: result.message,
        replayed: result.replayed,
      })
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Could not book ride.' })
    }
  })
}
