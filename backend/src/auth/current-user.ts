import type { FastifyRequest } from 'fastify'
import { pool } from '../db.js'
import { hashSessionToken, SESSION_COOKIE } from './session.js'

export type SessionUser = { id: string; name: string; username: string }

export async function getSessionUser(request: FastifyRequest): Promise<SessionUser | null> {
  const token = request.cookies[SESSION_COOKIE]
  if (!token) return null
  const found = await pool.query<SessionUser>(
    `SELECT u.id, u.name, u.username
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [hashSessionToken(token)],
  )
  return found.rows[0] ?? null
}
