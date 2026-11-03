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
