import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { POST_MAX, createPost, getFeed, getProfile, getTagged, getThread, reportPost, toggleFollow, toggleLike, topVoices } from '../game/eta.js'

const notLoggedIn = (reply: FastifyReply) => reply.code(401).send({ ok: false, error: 'Log in to play.' })

function send(reply: FastifyReply, result: { ok: false; status: number; code: string; error: string } | { ok: true }) {
  if (result.ok === false) return reply.code(result.status).send({ ok: false, code: result.code, error: result.error })
  return reply.send(result)
}

const feedSchema = z.object({
  tab: z.enum(['foryou', 'money', 'following']).default('foryou'),
  before: z.coerce.number().int().positive().optional(),
})
const postSchema = z.object({
  body: z.string().max(POST_MAX * 2),
  replyTo: z.coerce.number().int().positive().optional(),
})
const followSchema = z.object({ kind: z.enum(['user', 'npc']), id: z.string().min(1).max(64) })
const idParam = z.object({ id: z.coerce.number().int().positive() })

export async function etaRoutes(app: FastifyInstance) {
  app.get('/eta/feed', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const parsed = feedSchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Bad feed.' })
    const feed = await getFeed(user.id, parsed.data.tab, parsed.data.before)
    return reply.send({ ok: true, ...feed })
  })

  app.get('/eta/posts/:id', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const parsed = idParam.safeParse(request.params)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Bad gist.' })
    return send(reply, await getThread(user.id, parsed.data.id))
  })

  app.post('/eta/posts', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const parsed = postSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: `Keep it under ${POST_MAX} characters.` })
    const result = await createPost(user.id, parsed.data.body, parsed.data.replyTo)
    if (result.ok === false) return send(reply, result)
    return reply.code(201).send(result)
  })

  app.post('/eta/posts/:id/like', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const parsed = idParam.safeParse(request.params)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Bad gist.' })
    return send(reply, await toggleLike(user.id, parsed.data.id))
  })

  app.post('/eta/posts/:id/report', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const parsed = idParam.safeParse(request.params)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Bad gist.' })
    return send(reply, await reportPost(user.id, parsed.data.id))
  })

  app.post('/eta/follow', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const parsed = followSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Bad account.' })
    return send(reply, await toggleFollow(user.id, parsed.data.kind, parsed.data.id))
  })

  app.get('/eta/profile/:kind/:id', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const parsed = followSchema.safeParse(request.params)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Bad account.' })
    return send(reply, await getProfile(user.id, parsed.data.kind, parsed.data.id))
  })

  app.get('/eta/top', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    return reply.send({ ok: true, voices: await topVoices() })
  })

  app.get('/eta/tag/:tag', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const parsed = z.object({ tag: z.string().min(3).max(40) }).safeParse(request.params)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Bad tag.' })
    return reply.send({ ok: true, posts: await getTagged(user.id, parsed.data.tag) })
  })
}
