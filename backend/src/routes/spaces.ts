import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { liveKitConfig, verifyWebhook } from '../game/livekit.js'
import {
  approveSpeaker,
  banFromSpace,
  createSpace,
  endSpace,
  getSpace,
  handleLiveKitEvent,
  joinByCode,
  joinSpace,
  leaveSpace,
  listComments,
  listSpaces,
  postComment,
  reportSpace,
  requestSpeak,
  sweepSpaces,
  type SpacesFail,
} from '../game/spaces.js'
import { COMMENT_MAX, normalizeJoinCode, TITLE_MAX } from '../game/spaces-rules.js'

const notLoggedIn = (reply: FastifyReply) => reply.code(401).send({ ok: false, error: 'Log in to play.' })

function send(reply: FastifyReply, result: SpacesFail | { ok: true }) {
  if (result.ok === false) return reply.code(result.status).send({ ok: false, code: result.code, error: result.error })
  return reply.send(result)
}

const listQuery = z.object({
  tab: z.enum(['live', 'upcoming', 'mine', 'here']).default('live'),
  place_id: z.string().min(1).max(64).optional(),
})
const createSchema = z.object({
  // Real length limit is checked after trimming; this only stops huge bodies
  title: z.string().min(1).max(TITLE_MAX * 2),
  placeId: z.string().max(64).nullish(),
  visibility: z.enum(['public', 'link', 'invite']).default('public'),
  scheduledAt: z.string().datetime({ offset: true }).nullish(),
  maxListeners: z.coerce.number().int().min(1).max(50).optional(),
  askToSpeak: z.boolean().optional(),
})
const idParam = z.object({ id: z.string().min(1).max(64) })
const reportSchema = z.object({ reason: z.string().trim().min(1).max(300) })
const commentSchema = z.object({ text: z.string().max(COMMENT_MAX * 2) })
const sinceQuery = z.object({ since: z.string().datetime({ offset: true }).optional() })
const targetSchema = z.object({ userId: z.string().min(1).max(64) })
const approveSchema = targetSchema.extend({ approve: z.boolean().default(true) })

const rate = (max: number) => ({ config: { rateLimit: { max, timeWindow: '1 minute' } } })
const SWEEP_MS = 60_000

export async function spacesRoutes(app: FastifyInstance) {
  // LiveKit posts signed JSON as application/webhook+json; keep it raw to check the hash
  app.addContentTypeParser('application/webhook+json', { parseAs: 'string' }, (_request, body, done) => done(null, body))

  const timer = setInterval(() => {
    sweepSpaces().catch((error) => app.log.error(error, 'spaces sweep failed'))
  }, SWEEP_MS)
  timer.unref()
  app.addHook('onClose', async () => clearInterval(timer))

  app.get('/spaces', rate(60), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const parsed = listQuery.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ ok: false, code: 'BAD_TAB', error: 'Pick live, upcoming, mine or here.' })
    return send(reply, await listSpaces(user.id, parsed.data.tab, parsed.data.place_id ?? null))
  })

  app.post('/spaces', rate(10), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const parsed = createSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, code: 'BAD_INPUT', error: 'Check the title and time.' })
    return send(reply, await createSpace(user.id, parsed.data))
  })

  // Before /spaces/:id so "join-code" is never read as an id
  app.post('/spaces/join-code/:code', rate(20), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const code = normalizeJoinCode(String((request.params as { code?: string }).code ?? ''))
    if (!code) return reply.code(400).send({ ok: false, code: 'BAD_CODE', error: 'Codes are 6 letters and numbers.' })
    return send(reply, await joinByCode(user.id, code))
  })

  app.post('/spaces/livekit-webhook', { bodyLimit: 64 * 1024, config: { rateLimit: { max: 600, timeWindow: '1 minute' } } }, async (request, reply) => {
    const cfg = liveKitConfig()
    if (!cfg) return reply.code(503).send({ ok: false })
    const raw = typeof request.body === 'string' ? request.body : ''
    const event = verifyWebhook(cfg, raw, request.headers.authorization)
    if (!event) return reply.code(401).send({ ok: false })
    try {
      await handleLiveKitEvent(event)
    } catch (error) {
      request.log.error(error)
    }
    return reply.send({ ok: true })
  })

  app.get('/spaces/:id', rate(60), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const id = idParam.safeParse(request.params)
    if (!id.success) return reply.code(400).send({ ok: false, code: 'BAD_ID', error: 'Bad Space.' })
    return send(reply, await getSpace(user.id, id.data.id))
  })

  app.post('/spaces/:id/join', rate(20), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const id = idParam.safeParse(request.params)
    if (!id.success) return reply.code(400).send({ ok: false, code: 'BAD_ID', error: 'Bad Space.' })
    return send(reply, await joinSpace(user.id, id.data.id, { viaCode: false }))
  })

  app.post('/spaces/:id/leave', rate(30), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const id = idParam.safeParse(request.params)
    if (!id.success) return reply.code(400).send({ ok: false, code: 'BAD_ID', error: 'Bad Space.' })
    return send(reply, await leaveSpace(user.id, id.data.id))
  })

  app.post('/spaces/:id/end', rate(20), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const id = idParam.safeParse(request.params)
    if (!id.success) return reply.code(400).send({ ok: false, code: 'BAD_ID', error: 'Bad Space.' })
    return send(reply, await endSpace(user.id, id.data.id))
  })

  app.post('/spaces/:id/report', rate(10), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const id = idParam.safeParse(request.params)
    const body = reportSchema.safeParse(request.body)
    if (!id.success || !body.success) return reply.code(400).send({ ok: false, code: 'BAD_INPUT', error: 'Say what’s wrong.' })
    return send(reply, await reportSpace(user.id, id.data.id, body.data.reason))
  })

  app.post('/spaces/:id/ban', rate(30), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const id = idParam.safeParse(request.params)
    const body = targetSchema.safeParse(request.body)
    if (!id.success || !body.success) return reply.code(400).send({ ok: false, code: 'BAD_INPUT', error: 'Pick who to remove.' })
    return send(reply, await banFromSpace(user.id, id.data.id, body.data.userId))
  })

  app.post('/spaces/:id/request-speak', rate(10), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const id = idParam.safeParse(request.params)
    if (!id.success) return reply.code(400).send({ ok: false, code: 'BAD_ID', error: 'Bad Space.' })
    return send(reply, await requestSpeak(user.id, id.data.id))
  })

  app.post('/spaces/:id/approve-speaker', rate(60), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const id = idParam.safeParse(request.params)
    const body = approveSchema.safeParse(request.body)
    if (!id.success || !body.success) return reply.code(400).send({ ok: false, code: 'BAD_INPUT', error: 'Pick who can speak.' })
    return send(reply, await approveSpeaker(user.id, id.data.id, body.data.userId, body.data.approve))
  })

  app.get('/spaces/:id/comments', rate(120), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const id = idParam.safeParse(request.params)
    const query = sinceQuery.safeParse(request.query)
    if (!id.success || !query.success) return reply.code(400).send({ ok: false, code: 'BAD_INPUT', error: 'Bad request.' })
    return send(reply, await listComments(user.id, id.data.id, query.data.since ? new Date(query.data.since) : null))
  })

  app.post('/spaces/:id/comments', rate(30), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const id = idParam.safeParse(request.params)
    const body = commentSchema.safeParse(request.body)
    if (!id.success || !body.success) return reply.code(400).send({ ok: false, code: 'BAD_INPUT', error: 'Write something first.' })
    return send(reply, await postComment(user.id, id.data.id, body.data.text))
  })
}
