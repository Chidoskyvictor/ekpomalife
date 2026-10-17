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

  it('locks production cookies to .ekpomalife.app over HTTPS', () => {
    process.env.NODE_ENV = 'production'
    const opts = sessionCookieOptions(new Date('2030-01-01T00:00:00.000Z'))
    expect(opts).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: true,
      domain: '.ekpomalife.app',
    })
  })
})
