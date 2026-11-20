import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { pool } from '../db.js'
import { homeHas } from '../game/club-live.js'
import { joinToken, liveKitConfig } from '../game/livekit.js'
import { houseVoiceAccess, peopleInRoom, type HouseVoice } from '../game/voice.js'

/**
 * Nearby voice: a live voice room per place (LiveKit, never recorded). Being in a place connects you
 * to nobody: a token is only issued on an explicit join (POST), and the room comes from where the
 * server says you are. Houses add the owner's privacy mode (open / friends / private + invites).
 */

type Where = { room: string; place: string; ownerId: string | null; username: string }

async function whereAmI(userId: string, visitHome?: string): Promise<Where | { error: string } | null> {
  const { rows } = await pool.query<{ character_id: string; username: string; location_id: string | null }>(
    `SELECT c.id AS character_id, u.username, gs.location_id
       FROM characters c JOIN users u ON u.id = c.user_id LEFT JOIN game_state gs ON gs.character_id = c.id
      WHERE c.user_id = $1 LIMIT 1`,
    [userId],
  )
  const me = rows[0]
  if (!me) return null
  // Visiting someone's house: you must be inside it right now (live room), and it's their room
  if (visitHome && visitHome.toLowerCase() !== me.username.toLowerCase()) {
    const o = await pool.query<{ user_id: string; character_id: string }>(
      `SELECT c.user_id, c.id AS character_id FROM characters c JOIN users u ON u.id = c.user_id WHERE LOWER(u.username) = LOWER($1) LIMIT 1`,
      [visitHome],
    )
    const owner = o.rows[0]
    if (!owner) return { error: 'No such home.' }
    if (!homeHas(owner.user_id, userId)) return { error: 'Go inside the house first.' }
    return { room: `near_home_${owner.character_id}`.slice(0, 120), place: 'home', ownerId: owner.user_id, username: me.username }
  }
  if (!me.location_id) return null
  const isHome = me.location_id === 'home'
  const place = isHome ? `home_${me.character_id}` : me.location_id
  return { room: `near_${place}`.slice(0, 120), place: me.location_id, ownerId: isHome ? userId : null, username: me.username }
}

const placeQuery = z.object({ home: z.string().regex(/^[A-Za-z0-9_]{1,40}$/).optional() })
type Reply = { code: (n: number) => { send: (b: unknown) => unknown } }

async function houseState(ownerId: string) {
  const mode = (await pool.query<{ house_voice: HouseVoice }>(`SELECT house_voice FROM characters WHERE user_id = $1 LIMIT 1`, [ownerId])).rows[0]?.house_voice ?? 'open'
  const inv = await pool.query<{ username: string }>(
    `SELECT u.username FROM house_voice_invites i JOIN users u ON u.id = i.user_id WHERE i.owner_id = $1 ORDER BY i.created_at`,
    [ownerId],
  )
  return { ok: true as const, mode, invited: inv.rows.map((r) => r.username) }
}

export async function nearbyRoutes(app: FastifyInstance) {
  const limit = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }
  const auth = async (request: Parameters<typeof getSessionUser>[0], reply: Reply) => {
    const user = await getSessionUser(request)
    if (!user) reply.code(401).send({ ok: false, error: 'Log in to play.' })
    return user
  }

  // Who is live where you are now, without joining (the pill: "Live, N talking, Join")
  app.get('/nearby/voice', limit, async (request, reply) => {
    const user = await auth(request, reply)
    if (!user) return
    const cfg = liveKitConfig()
    const q = placeQuery.safeParse(request.query)
    const at = await whereAmI(user.id, q.success ? q.data.home : undefined)
    if (!cfg || !at || 'error' in at) return reply.send({ ok: true, available: Boolean(cfg), place: null, people: [], count: 0, allowed: false })
    const access = at.ownerId ? await houseVoiceAccess(at.ownerId, user.id) : null
    // Only people who may join can see who is in a private house voice
    const people = !access || access.ok ? await peopleInRoom(cfg, at.room) : []
    return reply.send({
      ok: true,
      available: true,
      place: at.place,
      people,
      count: people.length,
      allowed: access ? access.ok : true,
      reason: access && !access.ok ? access.error : undefined,
      mode: access?.mode ?? null,
      isOwner: at.ownerId === user.id,
    })
  })

  // Join to hear (and talk): the only place a nearby token is issued
  app.post('/nearby/voice', limit, async (request, reply) => {
    const user = await auth(request, reply)
    if (!user) return
    const cfg = liveKitConfig()
    if (!cfg) return reply.code(503).send({ ok: false, error: 'Voice is not available right now.' })
    const body = placeQuery.safeParse(request.body ?? {})
    try {
      const at = await whereAmI(user.id, body.success ? body.data.home : undefined)
      if (!at) return reply.code(400).send({ ok: false, error: 'Go somewhere first.' })
      if ('error' in at) return reply.code(403).send({ ok: false, error: at.error })
      if (at.ownerId) {
        const access = await houseVoiceAccess(at.ownerId, user.id)
        if (!access.ok) return reply.code(403).send({ ok: false, error: access.error })
      }
      const token = joinToken(cfg, { spaceId: at.room, room: at.room, userId: user.id, name: at.username, canPublish: true, ttlSeconds: 60 * 60 })
      return reply.send({ ok: true, url: cfg.url, token, place: at.place })
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ ok: false, error: 'Something went wrong. Try again.' })
    }
  })

  // Your house voice: mode + invite list
  app.get('/nearby/house', limit, async (request, reply) => {
    const user = await auth(request, reply)
    if (!user) return
    return reply.send(await houseState(user.id))
  })

  app.post('/nearby/house', limit, async (request, reply) => {
    const user = await auth(request, reply)
    if (!user) return
    const name = z.string().regex(/^[A-Za-z0-9_]{1,40}$/)
    const b = z.object({ mode: z.enum(['open', 'friends', 'private']).optional(), invite: name.optional(), uninvite: name.optional() }).safeParse(request.body)
    if (!b.success) return reply.code(400).send({ ok: false, error: 'Bad request.' })
    if (b.data.mode) await pool.query(`UPDATE characters SET house_voice = $2 WHERE user_id = $1`, [user.id, b.data.mode])
    const other = b.data.invite ?? b.data.uninvite
    if (other) {
      const u = (await pool.query<{ id: string }>(`SELECT id FROM users WHERE LOWER(username) = LOWER($1)`, [other])).rows[0]
      if (!u || u.id === user.id) return reply.code(404).send({ ok: false, error: 'No such player.' })
      if (b.data.invite) await pool.query(`INSERT INTO house_voice_invites (owner_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [user.id, u.id])
      else await pool.query(`DELETE FROM house_voice_invites WHERE owner_id = $1 AND user_id = $2`, [user.id, u.id])
    }
    return reply.send(await houseState(user.id))
  })
}
