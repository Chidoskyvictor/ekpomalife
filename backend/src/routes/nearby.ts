import type { FastifyInstance } from 'fastify'
import { getSessionUser } from '../auth/current-user.js'
import { pool } from '../db.js'
import { joinToken, liveKitConfig, roomCount } from '../game/livekit.js'

/**
 * Nearby voice: everyone at the same place shares one live voice room (LiveKit, never recorded).
 * The room comes from where the server says your character is, so nobody can listen in elsewhere.
 * Your own home is a room of its own. Mic starts off; each player turns their own on.
 */

async function whereAmI(userId: string) {
  const { rows } = await pool.query<{ character_id: string; username: string; location_id: string | null }>(
    `SELECT c.id AS character_id, u.username, gs.location_id
       FROM characters c
       JOIN users u ON u.id = c.user_id
       LEFT JOIN game_state gs ON gs.character_id = c.id
      WHERE c.user_id = $1
      LIMIT 1`,
    [userId],
  )
  const row = rows[0]
  if (!row?.location_id) return null
  const place = row.location_id === 'home' ? `home_${row.character_id}` : row.location_id
  return { ...row, room: `near_${place}`.slice(0, 120) }
}

export async function nearbyRoutes(app: FastifyInstance) {
  const limit = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }

  // How many people are on the voice where you are now (for the mic badge)
  app.get('/nearby/voice', limit, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const cfg = liveKitConfig()
    const at = await whereAmI(user.id)
    if (!cfg || !at) return reply.send({ ok: true, available: Boolean(cfg), place: at?.location_id ?? null, count: 0 })
    const count = await roomCount(cfg, at.room).catch(() => 0)
    return reply.send({ ok: true, available: true, place: at.location_id, count })
  })

  // Join the voice where you are now
  app.post('/nearby/voice', limit, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const cfg = liveKitConfig()
    if (!cfg) return reply.code(503).send({ ok: false, error: 'Voice is not available right now.' })
    try {
      const at = await whereAmI(user.id)
      if (!at) return reply.code(400).send({ ok: false, error: 'Go somewhere first.' })
      const token = joinToken(cfg, { spaceId: at.room, room: at.room, userId: user.id, name: at.username, canPublish: true, ttlSeconds: 60 * 60 })
      return reply.send({ ok: true, url: cfg.url, token, place: at.location_id })
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Something went wrong. Try again.' })
    }
  })
}
