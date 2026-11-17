import type { FastifyRequest } from 'fastify'
import { pool } from '../db.js'
import { hashSessionToken, SESSION_COOKIE, SESSION_DAYS } from './session.js'

export type SessionUser = { id: string; name: string; username: string }

export async function getSessionUser(request: FastifyRequest): Promise<SessionUser | null> {
  const token = request.cookies[SESSION_COOKIE]
  if (!token) return null
  const tokenHash = hashSessionToken(token)
  const found = await pool.query<SessionUser & { renew: boolean }>(
    `SELECT u.id, u.name, u.username,
            s.expires_at < NOW() + make_interval(days => $2::int - 1) AS renew
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [tokenHash, SESSION_DAYS],
  )
  const row = found.rows[0]
  if (!row) return null
  markSeen(tokenHash)
  if (row.renew) renew(request, token, tokenHash)
  return { id: row.id, name: row.name, username: row.username }
}

/** Requests whose login was pushed out: server.ts re-sends the cookie with the new expiry. */
export const renewedSessions = new WeakMap<FastifyRequest, { token: string; expiresAt: Date }>()

/** At most once a day per login: move the expiry a full SESSION_DAYS ahead (never awaited). */
function renew(request: FastifyRequest, token: string, tokenHash: string) {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  renewedSessions.set(request, { token, expiresAt })
  void pool.query(`UPDATE sessions SET expires_at = $2 WHERE token_hash = $1 AND expires_at < $2`, [tokenHash, expiresAt]).catch(() => {})
}

/** Presence for GET /stats "online" — at most one write per session per minute, never awaited. */
function markSeen(tokenHash: string) {
  void pool
    .query(
      `UPDATE sessions SET last_seen_at = NOW()
       WHERE token_hash = $1 AND (last_seen_at IS NULL OR last_seen_at < NOW() - INTERVAL '1 minute')`,
      [tokenHash],
    )
    .catch(() => {})
}
