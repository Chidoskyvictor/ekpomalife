import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import {
  addComment,
  blockAuthor,
  createPost,
  createWall,
  getPost,
  getShare,
  hidePost,
  joinWall,
  joinWallByCode,
  leaveWall,
  listComments,
  listFeed,
  listMine,
  listWalls,
  report,
  toggleLike,
  type AnonFail,
} from '../game/anonymous.js'
import {
  CATEGORIES,
  COLORS,
  COMMENT_MAX,
  POST_MAX,
  REPORT_REASONS,
  WALL_KINDS,
  normalizeInviteCode,
} from '../game/anonymous-rules.js'

const notLoggedIn = (reply: FastifyReply) => reply.code(401).send({ ok: false, error: 'Log in to play.' })

function send(reply: FastifyReply, result: AnonFail | { ok: true }) {
  if (result.ok === false) return reply.code(result.status).send({ ok: false, code: result.code, error: result.error })
  return reply.send(result)
}

const rate = (max: number) => ({ config: { rateLimit: { max, timeWindow: '1 minute' } } })
const idParam = z.object({ id: z.string().min(1).max(64) })
const feedQuery = z.object({
  sort: z.enum(['new', 'trending']).default('new'),
  category: z.enum(CATEGORIES).optional(),
  wall: z.string().min(1).max(64).optional(),
  before: z.string().datetime({ offset: true }).optional(),
})
const mineQuery = z.object({ tab: z.enum(['posts', 'comments', 'likes']).default('posts') })
const postSchema = z.object({
  body: z.string().max(POST_MAX * 2),
  color: z.enum(COLORS),
  category: z.enum(CATEGORIES),
  wallId: z.string().min(1).max(64).nullish(),
})
const commentSchema = z.object({ body: z.string().max(COMMENT_MAX * 2) })
const reportSchema = z.object({ reason: z.enum(REPORT_REASONS) })
const wallSchema = z.object({
  name: z.string().max(80),
  description: z.string().max(300).default(''),
  kind: z.enum(WALL_KINDS).default('other'),
})

export async function anonymousRoutes(app: FastifyInstance) {
  app.get('/anonymous/feed', rate(90), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const q = feedQuery.safeParse(request.query)
    if (!q.success) return reply.code(400).send({ ok: false, code: 'BAD_QUERY', error: 'Bad filter.' })
    return reply.send(
      await listFeed(user.id, { sort: q.data.sort, category: q.data.category, communityId: q.data.wall ?? null, before: q.data.before }),
    )
  })

  app.get('/anonymous/mine', rate(60), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const q = mineQuery.safeParse(request.query)
    if (!q.success) return reply.code(400).send({ ok: false, code: 'BAD_QUERY', error: 'Bad tab.' })
    return reply.send(await listMine(user.id, q.data.tab))
  })

  app.post('/anonymous/posts', rate(10), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const parsed = postSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, code: 'BAD_INPUT', error: 'Check your post.' })
    const { wallId, ...rest } = parsed.data
    const result = await createPost(user.id, { ...rest, communityId: wallId ?? null })
    if (result.ok === false) return send(reply, result)
    return reply.send(result)
  })

  app.get('/anonymous/posts/:id', rate(90), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const id = idParam.safeParse(request.params)
    if (!id.success) return reply.code(400).send({ ok: false, code: 'BAD_ID', error: 'Bad post.' })
    const result = await getPost(user.id, id.data.id)
    if (result.ok === false) return send(reply, result)
    return reply.send(result)
  })

  app.post('/anonymous/posts/:id/like', rate(60), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const id = idParam.safeParse(request.params)
    if (!id.success) return reply.code(400).send({ ok: false, code: 'BAD_ID', error: 'Bad post.' })
    const result = await toggleLike(user.id, id.data.id)
    if (result.ok === false) return send(reply, result)
    return reply.send(result)
  })

  app.get('/anonymous/posts/:id/comments', rate(90), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const id = idParam.safeParse(request.params)
    if (!id.success) return reply.code(400).send({ ok: false, code: 'BAD_ID', error: 'Bad post.' })
    const result = await listComments(user.id, id.data.id)
    if (result.ok === false) return send(reply, result)
    return reply.send(result)
  })

  app.post('/anonymous/posts/:id/comments', rate(20), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const id = idParam.safeParse(request.params)
    const body = commentSchema.safeParse(request.body)
    if (!id.success || !body.success) return reply.code(400).send({ ok: false, code: 'BAD_INPUT', error: 'Check your comment.' })
    const result = await addComment(user.id, id.data.id, body.data.body)
    if (result.ok === false) return send(reply, result)
    return reply.send(result)
  })

  app.post('/anonymous/posts/:id/report', rate(20), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const id = idParam.safeParse(request.params)
    const body = reportSchema.safeParse(request.body)
    if (!id.success || !body.success) return reply.code(400).send({ ok: false, code: 'BAD_INPUT', error: 'Pick a reason.' })
    const result = await report(user.id, 'post', id.data.id, body.data.reason)
    if (result.ok === false) return send(reply, result)
    return reply.send(result)
  })

  app.post('/anonymous/comments/:id/report', rate(20), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const id = idParam.safeParse(request.params)
    const body = reportSchema.safeParse(request.body)
    if (!id.success || !body.success) return reply.code(400).send({ ok: false, code: 'BAD_INPUT', error: 'Pick a reason.' })
    const result = await report(user.id, 'comment', id.data.id, body.data.reason)
    if (result.ok === false) return send(reply, result)
    return reply.send(result)
  })

  app.post('/anonymous/posts/:id/hide', rate(60), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const id = idParam.safeParse(request.params)
    if (!id.success) return reply.code(400).send({ ok: false, code: 'BAD_ID', error: 'Bad post.' })
    return send(reply, await hidePost(user.id, id.data.id))
  })

  app.post('/anonymous/posts/:id/block', rate(30), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const id = idParam.safeParse(request.params)
    if (!id.success) return reply.code(400).send({ ok: false, code: 'BAD_ID', error: 'Bad post.' })
    return send(reply, await blockAuthor(user.id, 'post', id.data.id))
  })

  app.post('/anonymous/comments/:id/block', rate(30), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const id = idParam.safeParse(request.params)
    if (!id.success) return reply.code(400).send({ ok: false, code: 'BAD_ID', error: 'Bad comment.' })
    return send(reply, await blockAuthor(user.id, 'comment', id.data.id))
  })

  /* ---- walls ---- */
  app.get('/anonymous/walls', rate(60), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    return reply.send(await listWalls(user.id))
  })

  app.post('/anonymous/walls', rate(10), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const parsed = wallSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, code: 'BAD_INPUT', error: 'Check the name.' })
    const result = await createWall(user.id, parsed.data)
    if (result.ok === false) return send(reply, result)
    return reply.send(result)
  })

  // Before /walls/:id so "join-code" is never read as an id
  app.post('/anonymous/walls/join-code/:code', rate(20), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const code = normalizeInviteCode(String((request.params as { code?: string }).code ?? ''))
    if (!code) return reply.code(400).send({ ok: false, code: 'BAD_CODE', error: 'Codes are 6 letters and numbers.' })
    const result = await joinWallByCode(user.id, code)
    if (result.ok === false) return send(reply, result)
    return reply.send(result)
  })

  app.post('/anonymous/walls/:id/join', rate(30), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const id = idParam.safeParse(request.params)
    if (!id.success) return reply.code(400).send({ ok: false, code: 'BAD_ID', error: 'Bad wall.' })
    const result = await joinWall(user.id, id.data.id)
    if (result.ok === false) return send(reply, result)
    return reply.send(result)
  })

  app.post('/anonymous/walls/:id/leave', rate(30), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const id = idParam.safeParse(request.params)
    if (!id.success) return reply.code(400).send({ ok: false, code: 'BAD_ID', error: 'Bad wall.' })
    return send(reply, await leaveWall(user.id, id.data.id))
  })

  /* ---- public share card: text + counts only, no login, no author ---- */
  app.get('/anonymous/share/:id', rate(60), async (request, reply) => {
    const id = idParam.safeParse(request.params)
    if (!id.success) return reply.code(400).send({ ok: false, code: 'BAD_ID', error: 'Bad post.' })
    const result = await getShare(id.data.id)
    if (result.ok === false) return send(reply, result)
    return reply.send(result)
  })
}
