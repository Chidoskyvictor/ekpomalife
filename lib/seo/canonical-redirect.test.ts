import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { middleware } from '@/middleware'
import { canonicalRedirect } from './canonical-redirect'

const req = (url: string, headers: Record<string, string> = {}) =>
  new NextRequest(url, { headers: { host: new URL(url).host, ...headers } })

describe('canonical redirect middleware', () => {
  it('301s plain http to https on the apex, keeping path and query', () => {
    const res = middleware(req('http://ekpomalife.app/dream?x=1'))
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe('https://ekpomalife.app/dream?x=1')
  })

  it('301s http www to https apex', () => {
    const res = middleware(req('http://www.ekpomalife.app/login'))
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe('https://ekpomalife.app/login')
  })

  it('301s https www to apex', () => {
    const res = middleware(req('https://www.ekpomalife.app/'))
    expect(res.headers.get('location')).toBe('https://ekpomalife.app/')
  })

  it('uses Cloudflare scheme headers when the worker URL says https', () => {
    const viaVisitor = middleware(req('https://ekpomalife.app/room', { 'cf-visitor': '{"scheme":"http"}' }))
    expect(viaVisitor.status).toBe(301)
    expect(viaVisitor.headers.get('location')).toBe('https://ekpomalife.app/room')
    const viaProto = middleware(req('https://ekpomalife.app/room', { 'x-forwarded-proto': 'http' }))
    expect(viaProto.status).toBe(301)
  })

  it('serves https apex without a redirect', () => {
    const res = middleware(req('https://ekpomalife.app/', { 'cf-visitor': '{"scheme":"https"}' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  it('leaves local dev hosts alone', () => {
    expect(canonicalRedirect(new URL('http://localhost:3000/'), new Headers({ host: 'localhost:3000' }))).toBeNull()
    expect(canonicalRedirect(new URL('http://127.0.0.1:3917/x'), new Headers({ host: '127.0.0.1:3917' }))).toBeNull()
  })
})
