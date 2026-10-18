import { createHash, randomBytes } from 'node:crypto'
import type { FastifyReply } from 'fastify'
import { pool } from '../db.js'
import { createId } from '../ids.js'

export const SESSION_COOKIE = 'el_session'
const SESSION_DAYS = 30
const PROD_COOKIE_DOMAIN = '.ekpomalife.app'

export function createSessionToken() {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string) {
  const pepper = process.env.SESSION_SECRET ?? ''
  // Unpeppered hash keeps existing local sessions; production always sets SESSION_SECRET.
  if (!pepper) return createHash('sha256').update(token).digest('hex')
  return createHash('sha256').update(`${pepper}:${token}`).digest('hex')
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

/** Cookie flags for el_session — production stays strict; LAN/HTTP dev stays usable on phone. */
export function sessionCookieOptions(expiresAt: Date) {
  const isProd = process.env.NODE_ENV === 'production'
  return {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    path: '/',
    secure: isProd,
    expires: expiresAt,
    ...(isProd ? { domain: PROD_COOKIE_DOMAIN } : {}),
  }
}

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(expiresAt))
}

export function clearSessionCookie(reply: FastifyReply) {
  const isProd = process.env.NODE_ENV === 'production'
  reply.clearCookie(SESSION_COOKIE, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    ...(isProd ? { domain: PROD_COOKIE_DOMAIN } : {}),
  })
}
