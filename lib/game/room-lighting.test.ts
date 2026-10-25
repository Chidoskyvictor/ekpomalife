import { describe, expect, it } from 'vitest'
import { minuteOfDay, pinnedRoomTime, roomLightAt } from './room-lighting'

const at = (h: number, m = 0) => h * 60 + m

describe('room lighting', () => {
  it('leaves midday as the room always looked: no lamps, no sky tint', () => {
    const noon = roomLightAt(at(12))
    expect(noon.lamps).toBe(0)
    expect(noon.skyOpacity).toBe(0)
    expect(noon.ambientIntensity).toBeCloseTo(0.75)
  })

  it('turns the lamps on and darkens the sky at night', () => {
    const night = roomLightAt(at(23))
    expect(night.lamps).toBe(1)
    expect(night.skyOpacity).toBeGreaterThan(0.9)
    expect(night.sunIntensity).toBeLessThan(0.3)
  })

  it('gives morning and evening their own warm tint, partly lit lamps in the evening', () => {
    expect(roomLightAt(at(7)).skyOpacity).toBeGreaterThan(0.4)
    const evening = roomLightAt(at(18))
    expect(evening.skyOpacity).toBeGreaterThan(0.4)
    expect(evening.lamps).toBeGreaterThan(0.3)
    expect(evening.lamps).toBeLessThan(1)
  })

  it('blends smoothly and wraps around midnight', () => {
    expect(roomLightAt(at(23, 59)).lamps).toBeCloseTo(roomLightAt(0).lamps)
    const a = roomLightAt(at(8)).ambientIntensity
    const b = roomLightAt(at(8, 10)).ambientIntensity
    expect(Math.abs(a - b)).toBeLessThan(0.05)
  })

  it('reads absolute game time (any day) as time of day', () => {
    expect(minuteOfDay(3 * 1440 + at(9))).toBe(at(9))
    expect(roomLightAt(3 * 1440 + at(12)).lamps).toBe(0)
  })

  it('pins the clock from ?roomTime=HH:MM in development only', () => {
    expect(pinnedRoomTime('?roomTime=21:30')).toBe(process.env.NODE_ENV === 'development' ? at(21, 30) : null)
    expect(pinnedRoomTime('?roomTime=nope')).toBeNull()
  })
})
