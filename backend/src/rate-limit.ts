import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import rateLimit, { normalizeIP } from '@fastify/rate-limit'
import { hashSessionToken, SESSION_COOKIE } from './auth/session.js'
import { pool } from './db.js'
import { env } from './env.js'

const isProd = env.NODE_ENV === 'production'

/** Per minute. Campus Wi-Fi and carrier CGNAT put many players behind one IP, so logged-in traffic is keyed by user. */
export const USER_LIMIT = 300
export const IP_LIMIT = 120
export const AUTH_LIMIT = 10

const DEV_LIMIT = 2000
const DEV_ALLOWLIST = ['127.0.0.1', '::1']

// Exact-IP comparison (no IPv6 /64 grouping); maps ::ffff:1.2.3.4 to 1.2.3.4.
const exactIp = (ip: string) => normalizeIP(ip, 128)

export function parseAllowlist(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean)
    .map(exactIp)
}

// Session token hash → user id (null = not a live session). Short TTL keeps the extra query off most requests.
const SESSION_CACHE_MS = 60_000
const SESSION_CACHE_MAX = 10_000
const sessionCache = new Map<string, { userId: string | null; at: number }>()

async function sessionUserId(request: FastifyRequest): Promise<string | null> {
  const token = request.cookies?.[SESSION_COOKIE]
  if (!token) return null
  const tokenHash = hashSessionToken(token)
  const now = Date.now()
  const cached = sessionCache.get(tokenHash)
  if (cached && now - cached.at < SESSION_CACHE_MS) return cached.userId

  let userId: string | null
  try {
    const found = await pool.query<{ user_id: string }>(
      'SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > NOW()',
      [tokenHash],
    )
    userId = found.rows[0]?.user_id ?? null
  } catch (error) {
    // DB hiccup — fall back to the IP key rather than failing the request.
    request.log.warn({ err: error }, 'rate-limit session lookup failed')
    return null
  }

  sessionCache.delete(tokenHash)
  if (sessionCache.size >= SESSION_CACHE_MAX) {
    const oldest = sessionCache.keys().next().value
    if (oldest !== undefined) sessionCache.delete(oldest)
  }
  sessionCache.set(tokenHash, { userId, at: now })
  return userId
}

export const ipKey = (request: FastifyRequest) => `ip:${normalizeIP(request.ip)}`

/** Logged-in requests share one bucket per user; everything else is per IP. */
export async function clientKey(request: FastifyRequest) {
  const userId = await sessionUserId(request)
  return userId ? `user:${userId}` : ipKey(request)
}

export const limitForKey = (key: string) => (key.startsWith('user:') ? USER_LIMIT : IP_LIMIT)

/** Route config for login / signup / forgot / reset: strict, always per IP even with a session. */
export const authIpRateLimit = {
  max: AUTH_LIMIT,
  timeWindow: '1 minute',
  keyGenerator: ipKey,
}

/**
 * preHandler adding a second strict bucket per account identifier (email or username) on top of the
 * per-IP one, so a single target cannot be hammered from many IPs.
 */
export function authIdentityRateLimit(app: FastifyInstance, field: 'email' | 'username') {
  const identity = (request: FastifyRequest) => {
    const value = (request.body as Record<string, unknown> | undefined)?.[field]
    return typeof value === 'string' ? value.trim().toLowerCase().slice(0, 120) : ''
  }
  const limiter = app.createRateLimit({
    max: AUTH_LIMIT,
    timeWindow: '1 minute',
    keyGenerator: (request) => `${field}:${identity(request)}`,
  })

  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!identity(request)) return
    const result = await limiter(request)
    if (result.isAllowed || !result.isExceeded) return
    // Same headers and error shape as the plugin's own 429.
    reply.header('retry-after', result.ttlInSeconds)
    const error = new Error(`Rate limit exceeded, retry in ${result.ttlInSeconds} seconds`) as Error & {
      statusCode: number
    }
    error.statusCode = 429
    throw error
  }
}

export async function registerRateLimit(
  app: FastifyInstance,
  { production = isProd, allowlist = env.RATE_LIMIT_ALLOWLIST }: { production?: boolean; allowlist?: string } = {},
) {
  // Load-test IPs (RATE_LIMIT_ALLOWLIST) and, outside production, localhost skip every limit —
  // route overrides and the auth identity buckets inherit this.
  const skip = new Set([...parseAllowlist(allowlist), ...(production ? [] : DEV_ALLOWLIST.map(exactIp))])
  await app.register(rateLimit, {
    max: production ? (_request, key) => limitForKey(key) : DEV_LIMIT,
    timeWindow: '1 minute',
    keyGenerator: clientKey,
    allowList: (request) => skip.has(exactIp(request.ip)),
  })
}
