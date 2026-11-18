import { describe, expect, it } from 'vitest'
import { autoAcceptAt, budgetLeft, canMove, cleanGigText, cleanMoney, escrowFor, keyOpen, rankFor, startAtFrom } from './gigs-rules.js'

describe('gig ranks', () => {
  it('starts New and climbs with jobs and rating', () => {
    expect(rankFor(0, null).id).toBe('new')
    expect(rankFor(1, 5).id).toBe('new')
    expect(rankFor(2, 3.5).id).toBe('rising')
    expect(rankFor(2, 3.4).id).toBe('new')
    expect(rankFor(8, 4).id).toBe('pro')
    expect(rankFor(8, 3.9).id).toBe('rising')
    expect(rankFor(25, 4.5).id).toBe('top')
    expect(rankFor(100, 4.4).id).toBe('pro')
  })
  it('orders higher ranks higher', () => {
    expect(rankFor(25, 5).order).toBeGreaterThan(rankFor(8, 4).order)
    expect(rankFor(0, null).order).toBe(0)
  })
})

describe('gig status moves', () => {
  it('allows only the real flow', () => {
    expect(canMove('open', 'hired')).toBe(true)
    expect(canMove('hired', 'cancelled')).toBe(true)
    expect(canMove('working', 'cancelled')).toBe(false)
    expect(canMove('done', 'completed')).toBe(true)
    expect(canMove('completed', 'cancelled')).toBe(false)
    expect(canMove('cancelled', 'hired')).toBe(false)
  })
})

describe('gig text and money', () => {
  it('masks bad words, blocks links and numbers', () => {
    const ok = cleanGigText('  Fix my   room, you idiot ', 60, { required: true })
    expect(ok.ok && ok.text).toBe('Fix my room, you i****')
    expect(cleanGigText('call 08012345678', 60).ok).toBe(false)
    expect(cleanGigText('see wa.me/234', 60).ok).toBe(false)
    expect(cleanGigText('', 60, { required: true }).ok).toBe(false)
    expect(cleanGigText('x'.repeat(61), 60).ok).toBe(false)
  })
  it('takes whole naira in range only', () => {
    expect(cleanMoney(5000, 100, 1_000_000)).toBe(5000)
    expect(cleanMoney(50.5, 100, 1_000_000)).toBeNull()
    expect(cleanMoney(99, 100, 1_000_000)).toBeNull()
    expect(cleanMoney('abc', 100, 1_000_000)).toBeNull()
  })
  it('escrow is fee plus budget; leftovers are what is unspent', () => {
    expect(escrowFor(5000, 2000)).toBe(7000)
    expect(budgetLeft(2000, 1500)).toBe(500)
    expect(budgetLeft(2000, 2500)).toBe(0)
  })
})

describe('gig time windows', () => {
  const now = new Date('2026-01-01T10:00:00Z')
  it('only the listed start times', () => {
    expect(startAtFrom(0, now)?.startAt.getTime()).toBe(now.getTime())
    expect(startAtFrom(72, now)).not.toBeNull()
    expect(startAtFrom(5, now)).toBeNull()
  })
  it('the key opens from start time until the window ends, only while hired/working', () => {
    const w = startAtFrom(6, now)!
    expect(keyOpen('hired', w.startAt, w.expiresAt, now)).toBe(false)
    expect(keyOpen('hired', w.startAt, w.expiresAt, new Date(w.startAt.getTime() + 1000))).toBe(true)
    expect(keyOpen('working', w.startAt, w.expiresAt, new Date(w.expiresAt.getTime() + 1000))).toBe(false)
    expect(keyOpen('done', w.startAt, w.expiresAt, w.startAt)).toBe(false)
  })
  it('auto-accept is 24h after done', () => {
    expect(autoAcceptAt(now).getTime() - now.getTime()).toBe(24 * 3_600_000)
  })
})

import { cleanlinessOf, messDue } from './gigs-rules.js'

describe('house mess rules', () => {
  it('cleanliness falls with each prop and never below 0', () => {
    expect(cleanlinessOf(0)).toBe(100)
    expect(cleanlinessOf(3)).toBe(64)
    expect(cleanlinessOf(20)).toBe(0)
  })
  it('spawns one per 3 hours up to the cap', () => {
    expect(messDue(2.9, 0)).toBe(0)
    expect(messDue(7, 0)).toBe(2)
    expect(messDue(100, 6)).toBe(2)
    expect(messDue(100, 8)).toBe(0)
  })
})
