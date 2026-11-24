import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { roomFail } from '../game/economy-codes.js'
import {
  acceptWork,
  applyToGig,
  cancelGig,
  disputeGig,
  getGig,
  hireWorker,
  jobKeyFor,
  listBoard,
  listMine,
  myGigStats,
  listPros,
  listWorking,
  markDone,
  postGig,
  rateGig,
  removeMyPro,
  reportTarget,
  respondToOffer,
  saveMyPro,
  startWork,
  undoLayout,
  withdrawApplication,
} from '../game/gigs.js'
import { getGigHome, gigMove, gigPlace, gigStore } from '../game/gigs-home.js'
import { cookDish } from '../game/gigs-cook.js'
import { cleanMess, getHouseMess } from '../game/house-mess.js'
import { isUuidV4, readIdempotencyKey } from '../game/idempotency.js'

function idemKey(request: FastifyRequest, reply: FastifyReply): string | null {
  const key = readIdempotencyKey(request.headers as Record<string, unknown>)
  if (!key || !isUuidV4(key)) {
    const f = roomFail('IDEMPOTENCY_KEY_REQUIRED')
    void reply.code(400).send({ ok: false, error: f.error, code: f.code })
    return null
  }
  return key
}

type Failure = { ok: false; error: string; code: number; reason?: string }
function send(reply: FastifyReply, result: { ok: boolean }) {
  if (result.ok) return reply.send(result)
  const f = result as Failure
  return reply.code(f.code ?? 400).send({ ok: false, error: f.error, reason: f.reason })
}

const id = z.string().min(1).max(80)
const spot = {
  x: z.number().int().min(0).max(40),
  z: z.number().int().min(0).max(40),
  rot: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
}

export async function gigsRoutes(app: FastifyInstance) {
  const read = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }
  const write = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }

  /** Runs `fn` for a logged-in player; one place for the 401 and the 500. */
  const guard =
    <P = Record<string, string>>(fn: (userId: string, request: FastifyRequest<{ Params: P }>, reply: FastifyReply) => Promise<unknown>) =>
    async (request: FastifyRequest<{ Params: P }>, reply: FastifyReply) => {
      const user = await getSessionUser(request)
      if (!user) return reply.code(401).send({ ok: false, error: 'Log in to use Gigs.' })
      try {
        return await fn(user.id, request, reply)
      } catch (error) {
        request.log.error(error)
        return reply.code(500).send({ ok: false, error: 'Something went wrong. Try again.' })
      }
    }

  const gigParams = z.object({ id })
  const q = (r: FastifyRequest) => (r.query as { category?: string }).category ?? null
  const text = (r: FastifyRequest) => (r.query as { q?: string }).q ?? null

  app.get('/gigs/board', read, guard(async (u, r, reply) => send(reply, await listBoard(u, q(r), text(r)))))
  app.get('/gigs/pros', read, guard(async (u, r, reply) => send(reply, await listPros(u, q(r), text(r)))))
  app.get('/gigs/me', read, guard(async (u, _r, reply) => send(reply, await myGigStats(u))))
  app.get('/gigs/mine', read, guard(async (u, _r, reply) => send(reply, await listMine(u))))
  app.get('/gigs/working', read, guard(async (u, _r, reply) => send(reply, await listWorking(u))))
  app.get<{ Params: { username: string } }>('/gigs/key/:username', read, guard<{ username: string }>(async (u, r, reply) => send(reply, await jobKeyFor(u, r.params.username))))
  app.get<{ Params: { id: string } }>('/gigs/:id', read, guard<{ id: string }>(async (u, r, reply) => send(reply, await getGig(u, gigParams.parse(r.params).id))))

  app.post('/gigs', write, guard(async (u, r, reply) => {
    const key = idemKey(r, reply)
    if (!key) return
    return send(reply, await postGig(u, (r.body ?? {}) as Parameters<typeof postGig>[1], key))
  }))

  app.post<{ Params: { id: string } }>('/gigs/:id/apply', write, guard<{ id: string }>(async (u, r, reply) => {
    const key = idemKey(r, reply)
    if (!key) return
    const body = z.object({ message: z.string().max(400).optional() }).safeParse(r.body ?? {})
    return send(reply, await applyToGig(u, gigParams.parse(r.params).id, body.success ? body.data.message : '', key))
  }))
  app.delete<{ Params: { id: string } }>('/gigs/:id/apply', write, guard<{ id: string }>(async (u, r, reply) => send(reply, await withdrawApplication(u, gigParams.parse(r.params).id))))

  app.post<{ Params: { id: string } }>('/gigs/:id/hire', write, guard<{ id: string }>(async (u, r, reply) => {
    const key = idemKey(r, reply)
    if (!key) return
    const body = z.object({ workerId: id }).safeParse(r.body)
    if (!body.success) return reply.code(400).send({ ok: false, error: 'Pick who to hire.' })
    return send(reply, await hireWorker(u, gigParams.parse(r.params).id, body.data.workerId, key))
  }))
  app.post<{ Params: { id: string } }>('/gigs/:id/offer', write, guard<{ id: string }>(async (u, r, reply) => {
    const key = idemKey(r, reply)
    if (!key) return
    const body = z.object({ accept: z.boolean() }).safeParse(r.body)
    if (!body.success) return reply.code(400).send({ ok: false, error: 'Accept or decline.' })
    return send(reply, await respondToOffer(u, gigParams.parse(r.params).id, body.data.accept, key))
  }))

  const simple = (path: string, fn: (u: string, gigId: string, key: string) => Promise<{ ok: boolean }>) =>
    app.post<{ Params: { id: string } }>(`/gigs/:id/${path}`, write, guard<{ id: string }>(async (u, r, reply) => {
      const key = idemKey(r, reply)
      if (!key) return
      return send(reply, await fn(u, gigParams.parse(r.params).id, key))
    }))
  simple('start', startWork)
  simple('done', markDone)
  simple('accept', acceptWork)
  simple('cancel', cancelGig)
  simple('undo-layout', undoLayout)
  simple('cook', cookDish)

  app.post<{ Params: { id: string } }>('/gigs/:id/dispute', write, guard<{ id: string }>(async (u, r, reply) => {
    const key = idemKey(r, reply)
    if (!key) return
    const body = z.object({ reason: z.string().max(400) }).safeParse(r.body)
    return send(reply, await disputeGig(u, gigParams.parse(r.params).id, body.success ? body.data.reason : '', key))
  }))
  app.post<{ Params: { id: string } }>('/gigs/:id/rate', write, guard<{ id: string }>(async (u, r, reply) => {
    const body = z.object({ stars: z.number().int().min(1).max(5) }).safeParse(r.body)
    if (!body.success) return reply.code(400).send({ ok: false, error: 'Pick 1 to 5 stars.' })
    return send(reply, await rateGig(u, gigParams.parse(r.params).id, body.data.stars))
  }))
  app.post<{ Params: { id: string } }>('/gigs/:id/report', write, guard<{ id: string }>(async (u, r, reply) => {
    const body = z.object({ reason: z.string().max(400).optional() }).safeParse(r.body ?? {})
    return send(reply, await reportTarget(u, { gigId: gigParams.parse(r.params).id }, body.success ? body.data.reason : ''))
  }))

  // List me for hire
  app.put('/gigs/pros/me', write, guard(async (u, r, reply) => send(reply, await saveMyPro(u, (r.body ?? {}) as Parameters<typeof saveMyPro>[1]))))
  app.delete('/gigs/pros/me', write, guard(async (u, _r, reply) => send(reply, await removeMyPro(u))))
  app.post<{ Params: { userId: string } }>('/gigs/pros/:userId/report', write, guard<{ userId: string }>(async (u, r, reply) => {
    const body = z.object({ reason: z.string().max(400).optional() }).safeParse(r.body ?? {})
    return send(reply, await reportTarget(u, { proId: z.string().min(1).max(80).parse(r.params.userId) }, body.success ? body.data.reason : ''))
  }))

  // The decorator's 3D work in the owner's house (needs an open job key)
  app.get<{ Params: { id: string } }>('/gigs/:id/home', read, guard<{ id: string }>(async (u, r, reply) => send(reply, await getGigHome(u, gigParams.parse(r.params).id))))
  app.post<{ Params: { id: string } }>('/gigs/:id/home/move', write, guard<{ id: string }>(async (u, r, reply) => {
    const key = idemKey(r, reply)
    if (!key) return
    const body = z.object({ pieceId: id, ...spot }).safeParse(r.body)
    if (!body.success) return reply.code(400).send({ ok: false, error: 'Pick a spot.' })
    const { pieceId, ...s } = body.data
    return send(reply, await gigMove(u, gigParams.parse(r.params).id, pieceId, s, key))
  }))
  app.post<{ Params: { id: string } }>('/gigs/:id/home/store', write, guard<{ id: string }>(async (u, r, reply) => {
    const key = idemKey(r, reply)
    if (!key) return
    const body = z.object({ pieceId: id }).safeParse(r.body)
    if (!body.success) return reply.code(400).send({ ok: false, error: 'Pick a piece.' })
    return send(reply, await gigStore(u, gigParams.parse(r.params).id, body.data.pieceId, key))
  }))
  app.post<{ Params: { id: string } }>('/gigs/:id/home/place', write, guard<{ id: string }>(async (u, r, reply) => {
    const key = idemKey(r, reply)
    if (!key) return
    const body = z.object({ itemId: id, finish: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(), ...spot }).safeParse(r.body)
    if (!body.success) return reply.code(400).send({ ok: false, error: 'Pick an item and a spot.' })
    const { itemId, finish, ...s } = body.data
    return send(reply, await gigPlace(u, gigParams.parse(r.params).id, itemId, s, finish, key))
  }))

  // Mess in a house (anyone can look) and the Cleaner tapping it away
  app.get<{ Params: { username: string } }>('/homes/:username/mess', read, guard<{ username: string }>(async (_u, r, reply) => {
    if (!/^[A-Za-z0-9_]{1,40}$/.test(r.params.username)) return reply.code(400).send({ ok: false, error: 'Bad username.' })
    return send(reply, await getHouseMess(r.params.username))
  }))
  app.post<{ Params: { id: string } }>('/gigs/:id/clean', write, guard<{ id: string }>(async (u, r, reply) => {
    const key = idemKey(r, reply)
    if (!key) return
    const body = z.object({ messId: id }).safeParse(r.body)
    if (!body.success) return reply.code(400).send({ ok: false, error: 'Pick what to clean.' })
    return send(reply, await cleanMess(u, gigParams.parse(r.params).id, body.data.messId, key))
  }))
}
