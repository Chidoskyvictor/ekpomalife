import { describe, expect, it } from 'vitest'
import {
  anniversaryDue,
  BAE_CLOSENESS_NEEDED,
  closenessGate,
  coupleLevel,
  cooldownLeftHours,
  goalKind,
  isExpired,
  statusLabel,
} from './bae-rules.js'

describe('bae rules', () => {
  it('locks until 40 closeness and shows progress', () => {
    expect(closenessGate(12)).toEqual({ unlocked: false, progress: '12/40' })
    expect(closenessGate(BAE_CLOSENESS_NEEDED).unlocked).toBe(true)
    expect(closenessGate(90).progress).toBe('40/40')
  })
  it('status hides when asked and ignores sneaky links', () => {
    expect(statusLabel(0, false)).toBe('Single')
    expect(statusLabel(2, false)).toBe('In a relationship')
    expect(statusLabel(2, true)).toBeNull()
  })
  it('requests expire and declines cool down', () => {
    const now = new Date('2026-01-10T00:00:00Z')
    expect(isExpired(new Date('2026-01-09T00:00:00Z'), now)).toBe(true)
    expect(isExpired(new Date('2026-01-11T00:00:00Z'), now)).toBe(false)
    expect(cooldownLeftHours(null, now)).toBe(0)
    expect(cooldownLeftHours(new Date('2026-01-09T12:00:00Z'), now)).toBe(12)
    expect(cooldownLeftHours(new Date('2026-01-01T00:00:00Z'), now)).toBe(0)
  })
  it('couple level and goals', () => {
    expect(coupleLevel({ dates: 0, hangouts: 0, cozy: 0, anniversaries: 0 })).toBe(1)
    expect(coupleLevel({ dates: 5, hangouts: 0, cozy: 0, anniversaries: 0 })).toBe(2)
    expect(goalKind('cuddle')).toBe('cozy')
    expect(goalKind('together')).toBe('hangouts')
    expect(goalKind('hello')).toBeNull()
  })
  it('anniversary is weekly', () => {
    const since = new Date('2026-01-01T00:00:00Z')
    expect(anniversaryDue(since, 0, new Date('2026-01-07T00:00:00Z'))).toBe(false)
    expect(anniversaryDue(since, 0, new Date('2026-01-08T00:00:00Z'))).toBe(true)
    expect(anniversaryDue(since, 1, new Date('2026-01-08T00:00:00Z'))).toBe(false)
  })
})

import { pairSpots, PAIR_POSES } from './bae-rules.js'
describe('paired animation spots', () => {
  it('face-to-face poses stand a gap apart and look at each other', () => {
    const s = pairSpots('hug', { x: 0, z: 0 }, { x: 3, z: 0 })!
    expect(Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z)).toBeCloseTo(0.62, 5)
    expect(s.a.x).toBeCloseTo(1.19, 5)
    expect(s.a.h).toBeCloseTo(Math.PI / 2, 5) // facing +x
    expect(s.b.h).toBeCloseTo(-Math.PI / 2, 5)
    expect(s.a.pose).toBe('hug')
  })
  it('side-by-side poses face the same way and know which side the partner is on', () => {
    const s = pairSpots('cuddle', { x: 0, z: 0 }, { x: 2, z: 0 })!
    expect(s.a.h).toBeCloseTo(s.b.h, 5)
    expect(PAIR_POSES).toContain(s.a.pose)
    expect(PAIR_POSES).toContain(s.b.pose)
    expect(s.a.pose.slice(-1)).not.toBe(s.b.pose.slice(-1))
  })
  it('works when both stand on the same spot', () => {
    expect(pairSpots('kiss', { x: 1, z: 1 }, { x: 1, z: 1 })).not.toBeNull()
    expect(pairSpots('hello', { x: 0, z: 0 }, { x: 1, z: 1 })).toBeNull()
  })
})
