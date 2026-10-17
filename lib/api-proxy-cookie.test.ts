import { describe, expect, it } from 'vitest'
import { sanitizeSetCookie } from './api-proxy-cookie'

describe('sanitizeSetCookie', () => {
  it('strips Domain so the cookie stays on the frontend origin', () => {
    const raw =
      'el_session=abc; Path=/; HttpOnly; SameSite=Lax; Domain=192.168.0.200'
    const cleaned = sanitizeSetCookie(raw, 'http://192.168.0.199:3000/api/auth/login')
    expect(cleaned.toLowerCase()).not.toContain('domain=')
    expect(cleaned).toContain('el_session=abc')
    expect(cleaned).toMatch(/HttpOnly/i)
    expect(cleaned).toMatch(/SameSite=Lax/i)
  })

  it('strips Secure on plain HTTP so phones can store the cookie', () => {
    const raw = 'el_session=abc; Path=/; HttpOnly; Secure; SameSite=Lax'
    const cleaned = sanitizeSetCookie(raw, 'http://192.168.0.199:3000/api/auth/login')
    expect(cleaned.toLowerCase()).not.toContain('secure')
  })

  it('keeps Secure on HTTPS', () => {
    const raw = 'el_session=abc; Path=/; HttpOnly; Secure; SameSite=Lax'
    const cleaned = sanitizeSetCookie(raw, 'https://ekpomalife.app/api/auth/login')
    expect(cleaned.toLowerCase()).toContain('secure')
  })
})
