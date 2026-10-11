import { createHash, randomBytes } from 'node:crypto'
import type { FastifyReply } from 'fastify'
import { pool } from '../db.js'
import { env } from '../env.js'
import { createId } from '../ids.js'

export const SESSION_COOKIE = 'el_session'
const SESSION_DAYS = 30

export function createSessionToken() {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId: string) {
  const token = createSessionToken()
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await pool.query('INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)', [
    createId(),
    userId,
    hashSessionToken(token),
    expiresAt,
  ])
  return { token, expiresAt }
}

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: env.COOKIE_SECURE,
    expires: expiresAt,
  })
}
