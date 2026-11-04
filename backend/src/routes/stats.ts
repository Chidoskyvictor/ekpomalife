import type { FastifyInstance } from 'fastify'
import { pool } from '../db.js'
import { countPlayersWithSetupComplete } from '../game/setup-status.js'
import { countDailyVisit } from '../game/hub.js'

type Stats = { players: number; online: number; today: number; visits: number }

let cached: { stats: Stats; at: number } | null = null
const CACHE_MS = 10_000
/** A session counts as online if it made a request this recently. */
const ONLINE_WINDOW = '5 minutes'

async function countOnline(): Promise<number> {
  const result = await pool.query<{ count: number }>(
    `SELECT COUNT(DISTINCT user_id)::int AS count
     FROM sessions
     WHERE last_seen_at > NOW() - $1::interval AND expires_at > NOW()`,
    [ONLINE_WINDOW],
  )
  return result.rows[0]?.count ?? 0
}

/** Distinct players with a session active since midnight in Ekpoma (Africa/Lagos). */
async function countToday(): Promise<number> {
  const result = await pool.query<{ count: number }>(
    `SELECT COUNT(DISTINCT user_id)::int AS count
     FROM sessions
     WHERE last_seen_at >= (date_trunc('day', NOW() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos')`,
  )
  return result.rows[0]?.count ?? 0
}

async function readVisits(): Promise<number> {
  const result = await pool.query<{ value: string }>(`SELECT value FROM site_counters WHERE id = 'visits'`)
  return Number(result.rows[0]?.value ?? 0)
}

async function loadStats(): Promise<Stats> {
  const [players, online, today, visits] = await Promise.all([
    countPlayersWithSetupComplete(),
    countOnline(),
    countToday(),
    readVisits(),
  ])
  return { players, online, today, visits }
}

export async function statsRoutes(app: FastifyInstance) {
  app.get('/stats', async (_request, reply) => {
    const now = Date.now()
    if (!cached || now - cached.at >= CACHE_MS) {
      cached = { stats: await loadStats(), at: now }
    }
    return reply.send({ ok: true, ...cached.stats })
  })

  // Called once per browser visit (the client remembers it in sessionStorage).
  app.post(
    '/stats/visit',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (_request, reply) => {
      const result = await pool.query<{ value: string }>(
        `UPDATE site_counters SET value = value + 1 WHERE id = 'visits' RETURNING value`,
      )
      // Per-day count for the admin dashboard (best-effort)
      await countDailyVisit().catch(() => {})
      const visits = Number(result.rows[0]?.value ?? 0)
      if (cached) cached.stats.visits = visits
      return reply.send({ ok: true, visits })
    },
  )
}
