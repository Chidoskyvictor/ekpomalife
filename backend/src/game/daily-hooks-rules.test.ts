import { describe, expect, it } from 'vitest'
import { MAX_STORIES_PER_DAY, SCHOOL_STORY_IDS, STORY_EVENTS, STREAK_REWARDS, cycleDay, nextStreak, pickStory, rewardForStreak, shouldOfferStory } from './daily-hooks-rules.js'

describe('login streak rules', () => {
  it('rewards grow over 7 days, repeat, day 7 is the gift', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(rewardForStreak)).toEqual([...STREAK_REWARDS])
    expect(rewardForStreak(7)).toBe(50_000)
    expect(rewardForStreak(8)).toBe(5_000)
    expect(cycleDay(14)).toBe(7)
    expect(cycleDay(15)).toBe(1)
  })
  it('continues on the next day, resets after a miss, nothing twice in a day', () => {
    expect(nextStreak({ day: 10, streak: 3 }, 11)).toBe(4)
    expect(nextStreak({ day: 10, streak: 3 }, 12)).toBe(1)
    expect(nextStreak({ day: 0, streak: 0 }, 5)).toBe(1)
    expect(nextStreak({ day: 11, streak: 4 }, 11)).toBeNull()
  })
})

describe('story moments', () => {
  it('has about 12 events, each with exactly 2 choices and no Lagos/Uniben', () => {
    expect(STORY_EVENTS.length).toBeGreaterThanOrEqual(12)
    const ids = new Set(STORY_EVENTS.map((e) => e.id))
    expect(ids.size).toBe(STORY_EVENTS.length)
    for (const e of STORY_EVENTS) {
      expect(e.choices).toHaveLength(2)
      expect(JSON.stringify(e)).not.toMatch(/lagos|uniben/i)
    }
  })
  it('does not repeat a seen event until all are seen', () => {
    const seen = STORY_EVENTS.slice(0, 11).map((e) => e.id)
    for (const r of [0, 0.5, 0.99]) expect(pickStory(r, seen).id).toBe(STORY_EVENTS[11]!.id)
    const all = STORY_EVENTS.map((e) => e.id)
    expect(pickStory(0, all).id).not.toBe(all[all.length - 1])
  })
  it('offers at most 2 a day, spaced apart', () => {
    const base = { now: 10 * 3600_000, roll: 0 }
    expect(shouldOfferStory({ ...base, shownToday: 0, lastShownAt: null })).toBe(true)
    expect(shouldOfferStory({ ...base, shownToday: MAX_STORIES_PER_DAY, lastShownAt: null })).toBe(false)
    expect(shouldOfferStory({ ...base, shownToday: 1, lastShownAt: base.now - 3600_000 })).toBe(false)
    expect(shouldOfferStory({ ...base, shownToday: 1, lastShownAt: base.now - 4 * 3600_000 })).toBe(true)
    expect(shouldOfferStory({ ...base, roll: 0.9, shownToday: 0, lastShownAt: null })).toBe(false)
  })
})

describe('story moments and student status', () => {
  it('non-students never get school stories, however the dice fall', () => {
    for (let i = 0; i < 100; i++) {
      const ev = pickStory(i / 100, [], false)
      expect(SCHOOL_STORY_IDS.has(ev.id), ev.id).toBe(false)
    }
    const seenAll = STORY_EVENTS.map((e) => e.id)
    for (let i = 0; i < 50; i++) expect(SCHOOL_STORY_IDS.has(pickStory(i / 50, seenAll, false).id)).toBe(false)
  })
  it('students can still get them', () => {
    const ids = new Set(Array.from({ length: 200 }, (_, i) => pickStory(i / 200, []).id))
    expect(ids.has('group-project')).toBe(true)
  })
})
