import { describe, expect, it } from 'vitest'
import { MISSIONS, MISSION_BY_ID, missionPlaces, pickDailyMissions, swapMission } from './missions-rules.js'
import { PLACES } from './places.js'

const placeIds = new Set(PLACES.map((p) => p.id))

describe('daily missions', () => {
  it('every mission is 60s or less and its places exist on the map', () => {
    for (const m of MISSIONS) {
      expect(m.seconds).toBeLessThanOrEqual(60)
      if (Array.isArray(m.places)) for (const p of m.places) expect(placeIds.has(p), `${m.id} → ${p}`).toBe(true)
    }
  })
  it('2 role missions + 1 general, same picks all day', () => {
    const a = pickDailyMissions('char1:10', 'student', new Set())
    const b = pickDailyMissions('char1:10', 'student', new Set())
    expect(a).toEqual(b)
    expect(a.ids).toHaveLength(3)
    expect(MISSION_BY_ID.get(a.ids[0]!)!.role).toBe('student')
    expect(MISSION_BY_ID.get(a.ids[1]!)!.role).toBe('student')
    expect(MISSION_BY_ID.get(a.ids[2]!)!.role).toBe('general')
    expect(placeIds.has(a.hiddenPlace)).toBe(true)
  })
  it('casual players get 3 general missions', () => {
    const picks = pickDailyMissions('char2:10', 'casual', new Set())
    expect(picks.ids.every((id) => MISSION_BY_ID.get(id)!.role === 'general')).toBe(true)
  })
  it('once-only missions never come back', () => {
    for (let day = 1; day < 60; day++) {
      expect(pickDailyMissions(`g:${day}`, 'graduate', new Set(['get-results'])).ids).not.toContain('get-results')
    }
  })
  it('swap gives a different mission of the same role', () => {
    const { ids } = pickDailyMissions('char3:4', 'lecturer', new Set())
    const next = swapMission('char3:4', 'lecturer', ids, ids[0]!, new Set())
    expect(next).not.toBeNull()
    expect(ids).not.toContain(next)
    expect(MISSION_BY_ID.get(next!)!.role).toBe('lecturer')
  })
  it('faculty missions use your own lecture buildings', () => {
    const def = MISSION_BY_ID.get('lecturer-note')!
    expect(missionPlaces(def, { courseId: 'nursing', hiddenPlace: 'bukka' })).toEqual(['hall-100', 'hall-200', 'etf-hall', 'mls-hall'])
    expect(missionPlaces(MISSION_BY_ID.get('hidden-prize')!, { courseId: null, hiddenPlace: 'bukka' })).toEqual(['bukka'])
  })
})

describe('tutorial missions', () => {
  it('a brand-new player gets the 3 tutorial missions, in order, with cash rewards', () => {
    const { ids } = pickDailyMissions('new:1', 'student', new Set(), true)
    expect(ids).toEqual(['tut-eat', 'tut-ride', 'tut-text'])
    for (const id of ids) {
      expect(MISSION_BY_ID.get(id)!.reward).toBeGreaterThan(0)
      expect(MISSION_BY_ID.get(id)!.once).toBe(true)
    }
  })
  it('finished tutorial missions are replaced by ordinary general ones', () => {
    const { ids } = pickDailyMissions('new:2', 'student', new Set(['tut-eat']), true)
    expect(ids.slice(0, 2)).toEqual(['tut-ride', 'tut-text'])
    expect(ids).toHaveLength(3)
    expect(MISSION_BY_ID.get(ids[2]!)!.role).toBe('general')
  })
  it('once all are done (or for existing players) nobody sees them', () => {
    const done = new Set(['tut-eat', 'tut-ride', 'tut-text'])
    expect(pickDailyMissions('new:3', 'student', done, true).ids.some((id) => id.startsWith('tut-'))).toBe(false)
    for (let day = 0; day < 40; day++) {
      expect(pickDailyMissions(`old:${day}`, 'student', new Set()).ids.some((id) => id.startsWith('tut-'))).toBe(false)
    }
  })
  it('are finished by real actions, not at a place', () => {
    for (const id of ['tut-eat', 'tut-ride', 'tut-text']) expect(MISSION_BY_ID.get(id)!.auto).toBeTruthy()
  })
})

describe('missions and student status', () => {
  it('only students get student (lecture / faculty / handout) missions', () => {
    for (const type of ['casual', null, 'graduate', 'lecturer', 'indigene']) {
      for (let day = 0; day < 60; day++) {
        const ids = pickDailyMissions(`p:${day}`, type, new Set()).ids
        expect(ids.some((id) => MISSION_BY_ID.get(id)!.role === 'student'), `${type} day ${day}`).toBe(false)
      }
    }
  })
})
