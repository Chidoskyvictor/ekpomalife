import { afterEach, describe, expect, it, vi } from 'vitest'
import { RATE_LIMIT_EVENT, retryAfterMs, withRateLimitRetry } from './rate-limit'

const res = (status: number, retryAfter?: string) =>
  new Response('{}', { status, headers: retryAfter ? { 'Retry-After': retryAfter } : {} })

afterEach(() => {
  vi.useRealTimers()
})

describe('withRateLimitRetry', () => {
  it('passes non-429 responses straight through', async () => {
    const run = vi.fn(async () => res(200))
    expect((await withRateLimitRetry(run)).status).toBe(200)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('on 429 notifies, waits Retry-After, and retries exactly once', async () => {
    vi.useFakeTimers()
    const seen = vi.fn()
    window.addEventListener(RATE_LIMIT_EVENT, seen)
    const run = vi.fn().mockResolvedValueOnce(res(429, '3')).mockResolvedValueOnce(res(429, '3'))

    const pending = withRateLimitRetry(run)
    await vi.advanceTimersByTimeAsync(2999)
    expect(run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect((await pending).status).toBe(429)
    expect(run).toHaveBeenCalledTimes(2)
    expect(seen).toHaveBeenCalledTimes(1)
    window.removeEventListener(RATE_LIMIT_EVENT, seen)
  })

  it('parses and caps Retry-After', () => {
    expect(retryAfterMs(res(429, '5'))).toBe(5000)
    expect(retryAfterMs(res(429, '9999'))).toBe(60_000)
    expect(retryAfterMs(res(429))).toBe(2000)
  })
})
