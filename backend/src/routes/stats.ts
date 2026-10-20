import type { FastifyInstance } from 'fastify'
import { countPlayersWithSetupComplete } from '../game/setup-status.js'

let cached: { players: number; at: number } | null = null
const CACHE_MS = 60_000

export async function statsRoutes(app: FastifyInstance) {
  app.get('/stats', async (_request, reply) => {
    const now = Date.now()
    if (cached && now - cached.at < CACHE_MS) {
      return reply.send({ ok: true, players: cached.players })
    }

    const players = await countPlayersWithSetupComplete()
    cached = { players, at: now }
    return reply.send({ ok: true, players })
  })
}
