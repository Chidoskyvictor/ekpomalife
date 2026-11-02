import { afterEach, describe, expect, it } from 'vitest'
import { sessionCookieOptions } from './session.js'

describe('sessionCookieOptions', () => {
  const prev = process.env.NODE_ENV
  afterEach(() => {
    process.env.NODE_ENV = prev
  })

  it('uses insecure Lax cookies with no domain in development', () => {
    process.env.NODE_ENV = 'development'
    const opts = sessionCookieOptions(new Date('2030-01-01T00:00:00.000Z'))
    expect(opts).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: false,
    })
    expect('domain' in opts).toBe(false)
  })

  it('uses host-only Secure cookies in production', () => {
    process.env.NODE_ENV = 'production'
    const opts = sessionCookieOptions(new Date('2030-01-01T00:00:00.000Z'))
    expect(opts).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: true,
    })
    expect('domain' in opts).toBe(false)
  })

  it('also clears the legacy .ekpomalife.app cookie when logging in', async () => {
    process.env.NODE_ENV = 'production'
    const { default: Fastify } = await import('fastify')
    const { default: cookie } = await import('@fastify/cookie')
    const { setSessionCookie } = await import('./session.js')
    const app = Fastify()
    await app.register(cookie)
    app.get('/', async (_req, reply) => {
      setSessionCookie(reply, 'tok', new Date('2030-01-01T00:00:00.000Z'))
      return 'ok'
    })
    const res = await app.inject('/')
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? [])
    expect(cookies).toHaveLength(2)
    expect(cookies.some((c) => /Domain=\.?ekpomalife\.app/i.test(c) && /Expires=Thu, 01 Jan 1970/i.test(c))).toBe(true)
    expect(cookies.some((c) => c.startsWith('el_session=tok') && !/Domain=/i.test(c))).toBe(true)
    await app.close()
  })
})
