import { describe, expect, it } from 'vitest'
import {
  looksLikeContactInfo,
  makeInviteCode,
  normalizeInviteCode,
  shouldAutoHide,
  toPublicComment,
  toPublicPost,
  trendingScore,
} from './anonymous-rules.js'

const AUTHOR = 'user-secret-id-123'
const post = {
  id: 'p1',
  user_id: AUTHOR,
  community_id: null,
  body: 'hello',
  color: 'violet',
  category: 'general',
  like_count: 2,
  comment_count: 1,
  status: 'ok',
  created_at: new Date('2026-01-01T00:00:00Z'),
  liked: true,
}

describe('anonymity guarantee', () => {
  it('public post never carries the author id (to anyone, including the author)', () => {
    for (const viewer of ['someone-else', AUTHOR]) {
      const json = JSON.stringify(toPublicPost(post, viewer))
      expect(json).not.toContain(AUTHOR)
      expect(json).not.toMatch(/user_?id|username|author/i)
    }
  })
  it('only the author sees mine=true', () => {
    expect(toPublicPost(post, AUTHOR).mine).toBe(true)
    expect(toPublicPost(post, 'other').mine).toBe(false)
  })
  it('comments never carry the author id either', () => {
    const row = { id: 'c1', post_id: 'p1', user_id: AUTHOR, body: 'hi', status: 'ok', created_at: new Date() }
    const json = JSON.stringify(toPublicComment(row, 'other'))
    expect(json).not.toContain(AUTHOR)
    expect(json).not.toMatch(/user_?id|username|author/i)
    expect(toPublicComment(row, AUTHOR).mine).toBe(true)
  })
})

describe('contact info filter', () => {
  it.each(['call 08012345678', 'my number +234 801 234 5678', 'mail me a.b@gmail.com', 'dm @chidi_99 now'])('flags %s', (t) => {
    expect(looksLikeContactInfo(t)).toBe(true)
  })
  it.each(['I got 15 out of 20 in CSC 301', 'Hostel fee is 120000 naira', 'who else hates 8am classes?'])('allows %s', (t) => {
    expect(looksLikeContactInfo(t)).toBe(false)
  })
})

describe('moderation + ranking rules', () => {
  it('auto-hides at 3 reports unless already cleared by an admin', () => {
    expect(shouldAutoHide(2, 'ok', false)).toBe(false)
    expect(shouldAutoHide(3, 'ok', false)).toBe(true)
    expect(shouldAutoHide(3, 'ok', true)).toBe(false)
    expect(shouldAutoHide(5, 'removed', false)).toBe(false)
  })
  it('trending: engagement lifts, age decays', () => {
    expect(trendingScore(10, 5, 1)).toBeGreaterThan(trendingScore(1, 0, 1))
    expect(trendingScore(10, 5, 1)).toBeGreaterThan(trendingScore(10, 5, 48))
    expect(trendingScore(0, 3, 2)).toBeGreaterThan(trendingScore(3, 0, 2)) // comments count double
  })
  it('invite codes are 6 safe characters and normalise', () => {
    expect(makeInviteCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    expect(normalizeInviteCode('ab-cd 23')).toBe('ABCD23')
    expect(normalizeInviteCode('abc')).toBeNull()
  })
})
