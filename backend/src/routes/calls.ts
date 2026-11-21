import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { pool } from '../db.js'
import { joinToken, liveKitConfig } from '../game/livekit.js'
import { callRoom, peopleInRoom } from '../game/voice.js'

/** Private voice calls: ring, accept/decline, hang up. Tokens only ever go to the two people on the call. */
const RING_SECONDS = 45
type Row = { id: string; caller_id: string; callee_id: string; status: string; caller_name: string; callee_name: string }
type Reply = { code: (n: number) => { send: (b: unknown) => unknown } }

const SELECT = `SELECT c.*, cu.username AS caller_name, eu.username AS callee_name
  FROM voice_calls c JOIN users cu ON cu.id = c.caller_id JOIN users eu ON eu.id = c.callee_id`

export async function callRoutes(app: FastifyInstance) {
  const limit = { config: { rateLimit: { max: 90, timeWindow: '1 minute' } } }
  const auth = async (request: Parameters<typeof getSessionUser>[0], reply: Reply) => {
    const user = await getSessionUser(request)
    if (!user) reply.code(401).send({ ok: false, error: 'Log in to play.' })
    return user
  }
  const sweep = () =>
    pool.query(`UPDATE voice_calls SET status = 'missed', ended_at = NOW() WHERE status = 'ringing' AND created_at < NOW() - make_interval(secs => $1)`, [RING_SECONDS])

  // Poll: the call ringing for me, or the one I'm on / ringing out (if any)
  app.get('/calls', limit, async (request, reply) => {
    const user = await auth(request, reply)
    if (!user) return
    await sweep()
    const r = (await pool.query<Row>(`${SELECT} WHERE (c.caller_id = $1 OR c.callee_id = $1) AND c.status IN ('ringing','active') ORDER BY c.created_at DESC LIMIT 1`, [user.id])).rows[0]
    if (!r) return reply.send({ ok: true, call: null })
    const mine = r.caller_id === user.id
    return reply.send({ ok: true, call: { id: r.id, status: r.status, direction: mine ? 'out' : 'in', peer: mine ? r.callee_name : r.caller_name } })
  })

  app.get('/calls/:id', limit, async (request, reply) => {
    const user = await auth(request, reply)
    if (!user) return
    await sweep()
    const { id } = request.params as { id: string }
    const r = (await pool.query<Row>(`${SELECT} WHERE c.id = $1`, [id])).rows[0]
    if (!r || (r.caller_id !== user.id && r.callee_id !== user.id)) return reply.code(404).send({ ok: false, error: 'No such call.' })
    return reply.send({ ok: true, status: r.status })
  })

  app.post('/calls', limit, async (request, reply) => {
    const user = await auth(request, reply)
    if (!user) return
    const b = z.object({ username: z.string().regex(/^[A-Za-z0-9_]{1,40}$/) }).safeParse(request.body)
    if (!b.success) return reply.code(400).send({ ok: false, error: 'Bad request.' })
    if (!liveKitConfig()) return reply.code(503).send({ ok: false, error: 'Voice is not available right now.' })
    await sweep()
    const peer = (await pool.query<{ id: string }>(`SELECT id FROM users WHERE LOWER(username) = LOWER($1)`, [b.data.username])).rows[0]
    if (!peer || peer.id === user.id) return reply.code(404).send({ ok: false, error: 'No such player.' })
    const blocked = await pool.query(`SELECT 1 FROM player_blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`, [user.id, peer.id])
    if (blocked.rows.length) return reply.code(403).send({ ok: false, error: 'You can’t call this player.' })
    const busy = await pool.query(`SELECT 1 FROM voice_calls WHERE status IN ('ringing','active') AND (caller_id = ANY($1::text[]) OR callee_id = ANY($1::text[])) LIMIT 1`, [[user.id, peer.id]])
    if (busy.rows.length) return reply.code(409).send({ ok: false, error: 'One of you is already on a call.' })
    const id = randomUUID()
    await pool.query(`INSERT INTO voice_calls (id, caller_id, callee_id) VALUES ($1, $2, $3)`, [id, user.id, peer.id])
    return reply.send({ ok: true, id })
  })

  // accept | decline (callee) | hangup (either; also cancels while ringing)
  app.post('/calls/:id/:action', limit, async (request, reply) => {
    const user = await auth(request, reply)
    if (!user) return
    const { id, action } = request.params as { id: string; action: string }
    await sweep()
    const r = (await pool.query<Row>(`${SELECT} WHERE c.id = $1`, [id])).rows[0]
    if (!r || (r.caller_id !== user.id && r.callee_id !== user.id)) return reply.code(404).send({ ok: false, error: 'No such call.' })
    if (action === 'token') {
      const cfg = liveKitConfig()
      if (!cfg) return reply.code(503).send({ ok: false, error: 'Voice is not available right now.' })
      if (r.status !== 'active') return reply.code(409).send({ ok: false, error: 'This call is over.' })
      const name = r.caller_id === user.id ? r.caller_name : r.callee_name
      const token = joinToken(cfg, { spaceId: callRoom(id), room: callRoom(id), userId: user.id, name, canPublish: true, ttlSeconds: 60 * 60 })
      return reply.send({ ok: true, url: cfg.url, token, people: await peopleInRoom(cfg, callRoom(id)) })
    }
    if (action === 'accept' || action === 'decline') {
      if (r.callee_id !== user.id || r.status !== 'ringing') return reply.code(409).send({ ok: false, error: 'This call is over.' })
      await pool.query(
        action === 'accept' ? `UPDATE voice_calls SET status = 'active', answered_at = NOW() WHERE id = $1` : `UPDATE voice_calls SET status = 'declined', ended_at = NOW() WHERE id = $1`,
        [id],
      )
    } else if (action === 'hangup') {
      await pool.query(`UPDATE voice_calls SET status = 'ended', ended_at = NOW() WHERE id = $1 AND status IN ('ringing','active')`, [id])
    } else return reply.code(400).send({ ok: false, error: 'Bad request.' })
    return reply.send({ ok: true })
  })
}
