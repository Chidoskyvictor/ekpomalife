import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetEconomyMock } from './economy-mock'
import {
  buyData,
  getPhone,
  getRideQuote,
  openApp,
  takeRide,
} from './phone-api'
import { resetPhoneMock, setPhoneMockLocation } from './phone-mock'

describe('phone-api (mocks)', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_USE_MOCKS = '1'
    resetEconomyMock()
    resetPhoneMock()
    if (typeof localStorage !== 'undefined') localStorage.removeItem('mock-no-phone')
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_USE_MOCKS
  })

  it('loads home payload with phone, clock, promos, bundles', async () => {
    const res = await getPhone()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.phone.battery).toBeGreaterThan(0)
    expect(res.bundles.length).toBe(3)
    expect(res.location.town).toBe('Ekpoma, Edo')
    expect(res.promos.length).toBeGreaterThan(0)
  })

  it('reuses idempotency key on data buy retry (replayed)', async () => {
    const key = crypto.randomUUID()
    const first = await buyData('data-100', key)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.replayed).toBe(false)
    const cashAfter = first.cash

    const second = await buyData('data-100', key)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.replayed).toBe(true)
    expect(second.cash).toBe(cashAfter)
  })

  it('opens app and clears unread / new badge', async () => {
    const before = await getPhone()
    expect(before.ok).toBe(true)
    if (!before.ok) return
    expect(before.phone.unread.jobs ?? 0).toBeGreaterThan(0)

    const opened = await openApp('jobs')
    expect(opened.ok).toBe(true)
    if (!opened.ok) return
    expect(opened.phone.unread.jobs ?? 0).toBe(0)
  })

  it('quotes and books a ride without shaming copy on insufficient funds', async () => {
    setPhoneMockLocation('school-hostels-1')
    const quote = await getRideQuote('market')
    expect(quote.ok).toBe(true)
    if (!quote.ok) return
    expect(quote.quotes.some((q) => q.mode === 'keke')).toBe(true)

    // Drain cash
    const { setMockCash } = await import('./economy-mock')
    setMockCash(10)
    const key = crypto.randomUUID()
    const book = await takeRide('market', 'keke', key)
    expect(book.ok).toBe(false)
    if (book.ok) return
    expect(book.code).toBe('INSUFFICIENT_FUNDS')
    expect(book.error).not.toMatch(/broke|poor|can't afford/i)
  })

  it('reuses ride idempotency key', async () => {
    setPhoneMockLocation('school-hostels-1')
    const key = crypto.randomUUID()
    const first = await takeRide('market', 'okada', key)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const cash = first.cash
    const second = await takeRide('market', 'okada', key)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.replayed).toBe(true)
    expect(second.cash).toBe(cash)
  })
})
