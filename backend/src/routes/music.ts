import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { getSessionUser } from '../auth/current-user.js'
import { countStream, listTrackStats, setLike } from '../game/music.js'

export async function musicRoutes(app: FastifyInstance) {
  const read = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }
  const write = { config: { rateLimit: { max: 40, timeWindow: '1 minute' } } }

  const guard =
    (fn: (userId: string, request: FastifyRequest<{ Params: { id: string } }>) => Promise<unknown>) =>
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = await getSessionUser(request)
      if (!user) return reply.code(401).send({ ok: false, error: 'Log in to use Music.' })
      try {
        const result = (await fn(user.id, request)) as { ok: boolean; error?: string; code?: number }
        if (result.ok) return result
        return reply.code(result.code ?? 400).send({ ok: false, error: result.error })
      } catch (error) {
        request.log.error(error)
        return reply.code(500).send({ ok: false, error: 'Something went wrong. Try again.' })
      }
    }

  app.get('/music', read, guard(async (u) => ({ ok: true, tracks: await listTrackStats(u) })))
  app.post<{ Params: { id: string } }>('/music/:id/like', write, guard((u, r) => setLike(u, r.params.id, true)))
  app.delete<{ Params: { id: string } }>('/music/:id/like', write, guard((u, r) => setLike(u, r.params.id, false)))
  app.post<{ Params: { id: string } }>('/music/:id/stream', write, guard((u, r) => countStream(u, r.params.id)))
}
