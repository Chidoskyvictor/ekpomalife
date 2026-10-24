import type { FastifyRequest } from 'fastify'
import { pool } from '../db.js'
import { hashSessionToken, SESSION_COOKIE } from './session.js'

export type SessionUser = { id: string; name: string; username: string }

export async function getSessionUser(request: FastifyRequest): Promise<SessionUser | null> {
  const token = request.cookies[SESSION_COOKIE]
  if (!token) return null
  const tokenHash = hashSessionToken(token)
  const found = await pool.query<SessionUser>(
    `SELECT u.id, u.name, u.username
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [tokenHash],
  )
  const user = found.rows[0] ?? null
  if (user) markSeen(tokenHash)
  return user
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
