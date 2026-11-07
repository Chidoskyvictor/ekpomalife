import type { FastifyInstance } from 'fastify'
import { getSessionUser } from '../auth/current-user.js'
import { pool } from '../db.js'
import { getSkills } from '../game/skills.js'

/** GET /skills: your skill levels (0-10) and XP towards the next level. */
export async function skillRoutes(app: FastifyInstance) {
  app.get('/skills', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return reply.code(401).send({ ok: false, error: 'Log in to play.' })
    const ch = await pool.query<{ id: string }>(`SELECT id FROM characters WHERE user_id = $1`, [user.id])
    const id = ch.rows[0]?.id
    if (!id) return reply.code(409).send({ ok: false, error: 'Create your character first.' })
    return { ok: true, skills: await getSkills(id) }
  })
}
