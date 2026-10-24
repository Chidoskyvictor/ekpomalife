import cookie from '@fastify/cookie'
import Fastify from 'fastify'
import { afterAll, describe, expect, it } from 'vitest'
import { createSession, SESSION_COOKIE } from './auth/session.js'
import {
  AUTH_LIMIT,
  authIdentityRateLimit,
  authIpRateLimit,
  IP_LIMIT,
  parseAllowlist,
  registerRateLimit,
  USER_LIMIT,
} from './rate-limit.js'
import { cleanupTestUser, createTestUser } from './test/db-fixtures.js'

const usersToClean: string[] = []
afterAll(async () => {
  for (const id of usersToClean) await cleanupTestUser(id)
})

async function buildApp(allowlist = '') {
  const app = Fastify({ trustProxy: true })
  await app.register(cookie)
  await registerRateLimit(app, { production: true, allowlist })
  app.get('/health', { config: { rateLimit: false } }, async () => ({ ok: true }))
  app.get('/ping', async () => ({ ok: true }))
  app.post(
    '/auth/forgot',
    { config: { rateLimit: authIpRateLimit }, preHandler: authIdentityRateLimit(app, 'email') },
    async () => ({ ok: true }),
  )
  await app.ready()
  return app
}

const fromIp = (ip: string, extra: Record<string, string> = {}) => ({ 'x-forwarded-for': ip, ...extra })

async function hit(app: Awaited<ReturnType<typeof buildApp>>, times: number, headers: Record<string, string>) {
  let last = 0
  for (let i = 0; i < times; i++) last = (await app.inject({ method: 'GET', url: '/ping', headers })).statusCode
  return last
}

describe('rate limits', () => {
  it('parses the allowlist env value', () => {
    expect(parseAllowlist(undefined)).toEqual([])
    expect(parseAllowlist(' 1.2.3.4, ,::ffff:5.6.7.8 ')).toEqual(['1.2.3.4', '5.6.7.8'])
  })

  it('limits anonymous traffic per IP and never limits /health', async () => {
    const app = await buildApp()
    expect(await hit(app, IP_LIMIT, fromIp('10.0.0.1'))).toBe(200)
    const blocked = await app.inject({ method: 'GET', url: '/ping', headers: fromIp('10.0.0.1') })
    expect(blocked.statusCode).toBe(429)
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0)
    // Another IP has its own bucket
    expect((await app.inject({ method: 'GET', url: '/ping', headers: fromIp('10.0.0.2') })).statusCode).toBe(200)
    for (let i = 0; i < IP_LIMIT + 20; i++) {
      expect((await app.inject({ method: 'GET', url: '/health', headers: fromIp('10.0.0.1') })).statusCode).toBe(200)
    }
    await app.close()
  })

  it('keys logged-in players by user, so a shared IP does not block them', async () => {
    const app = await buildApp()
    const shared = '10.1.0.1'
    expect(await hit(app, IP_LIMIT + 1, fromIp(shared))).toBe(429)

    const user = await createTestUser()
    usersToClean.push(user.userId)
    const { token } = await createSession(user.userId)
    const authed = fromIp(shared, { cookie: `${SESSION_COOKIE}=${token}` })
    expect(await hit(app, USER_LIMIT, authed)).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/ping', headers: authed })).statusCode).toBe(429)

    // A forged cookie is not a session — it stays on the (exhausted) IP bucket
    const forged = fromIp(shared, { cookie: `${SESSION_COOKIE}=not-a-real-token` })
    expect((await app.inject({ method: 'GET', url: '/ping', headers: forged })).statusCode).toBe(429)
    await app.close()
  })

  it('auth routes are strict per IP and per email', async () => {
    const app = await buildApp()
    const post = (ip: string, email: string) =>
      app.inject({ method: 'POST', url: '/auth/forgot', headers: fromIp(ip), payload: { email } })

    for (let i = 0; i < AUTH_LIMIT; i++) expect((await post('10.2.0.1', `a${i}@x.test`)).statusCode).toBe(200)
    expect((await post('10.2.0.1', 'fresh@x.test')).statusCode).toBe(429)

    // Same email from many IPs
    for (let i = 0; i < AUTH_LIMIT; i++) expect((await post(`10.3.0.${i}`, 'Target@X.test')).statusCode).toBe(200)
    const blocked = await post('10.3.1.1', 'target@x.test')
    expect(blocked.statusCode).toBe(429)
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0)
    await app.close()
  })

  it('allowlisted IPs skip every limit', async () => {
    const app = await buildApp('10.4.0.1')
    expect(await hit(app, IP_LIMIT + 20, fromIp('10.4.0.1'))).toBe(200)
    for (let i = 0; i < AUTH_LIMIT + 5; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/forgot',
        headers: fromIp('10.4.0.1'),
        payload: { email: 'load@x.test' },
      })
      expect(res.statusCode).toBe(200)
    }
    await app.close()
  })
})
