import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { finishPitch, pitchStatus, startPitch } from '../game/pitch.js'
import { listPosts, listSuggestions, mySubmissions, react, submit, SUBMISSION_KINDS, toggleVote } from '../game/hub.js'

const submitBody = z.object({
  kind: z.enum(SUBMISSION_KINDS),
  body: z.string().min(1).max(2000),
  stars: z.number().int().min(1).max(5).nullish(),
})
const idParam = z.object({ id: z.string().min(1).max(64) })
const rate = (max: number) => ({ config: { rateLimit: { max, timeWindow: '1 minute' } } })

type Fail = { ok: false; error: string; code: number }
function send(reply: FastifyReply, result: Fail | ({ ok: true } & Record<string, unknown>)) {
  if (result.ok === false) return reply.code(result.code).send({ ok: false, error: result.error })
  return reply.send(result)
}

/** Innovation Hub for players: feedback, public suggestions + votes, the Developers' Corner feed. */
export async function hubRoutes(app: FastifyInstance) {
  // Pitch Room: GET status, POST start (idea), POST finish (after the review time)
  app.get('/hub/pitch', rate(60), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    return send(reply, await pitchStatus(user.id))
  })
  app.post('/hub/pitch', rate(10), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const parsed = z.object({ idea: z.string().min(1).max(200) }).safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Tell the investor what you are building.' })
    return send(reply, await startPitch(user.id, parsed.data.idea))
  })
  app.post('/hub/pitch/:id/finish', rate(30), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const parsed = idParam.safeParse(request.params)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Unknown pitch.' })
    return send(reply, await finishPitch(user.id, parsed.data.id))
  })
  app.post('/hub/submit', rate(10), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in first.' })
    const body = submitBody.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ ok: false, error: 'Write something first.' })
    return send(reply, await submit(user, body.data))
  })

  app.get('/hub/mine', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in first.' })
    return send(reply, await mySubmissions(user.id))
  })

  app.get('/hub/suggestions', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in first.' })
    const sort = (request.query as { sort?: string }).sort === 'new' ? 'new' : 'top'
    return send(reply, await listSuggestions(user.id, sort))
  })

  app.post('/hub/suggestions/:id/vote', rate(60), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in first.' })
    const id = idParam.safeParse(request.params)
    if (!id.success) return reply.code(400).send({ ok: false, error: 'Bad id.' })
    return send(reply, await toggleVote(user.id, id.data.id))
  })

  app.get('/hub/posts', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in first.' })
    return send(reply, await listPosts(user.id))
  })

  app.post('/hub/posts/:id/react', rate(60), async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in first.' })
    const id = idParam.safeParse(request.params)
    const emoji = z.object({ emoji: z.string().min(1).max(8) }).safeParse(request.body)
    if (!id.success || !emoji.success) return reply.code(400).send({ ok: false, error: 'Bad reaction.' })
    return send(reply, await react(user.id, id.data.id, emoji.data.emoji))
  })
}
