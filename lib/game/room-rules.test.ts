import { describe, expect, it } from 'vitest'
import { FURNITURE_BY_ID, FURNITURE_CATALOG, ROOM_TIERS, DEFAULT_ROOM_STYLE } from './room-constants'
import { computeComfort, rotatedFootprint, validateLayout } from './room-rules'
import type { RoomItem } from './room-types'

const tier1 = ROOM_TIERS['hostel-poultry']
const catalog = FURNITURE_BY_ID

function item(
  uid: string,
  itemId: string,
  placed: boolean,
  x = 0,
  z = 0,
  rotation: 0 | 90 | 180 | 270 = 0,
): RoomItem {
  return { uid, itemId, placed, x, z, rotation }
}

describe('room-rules', () => {
  it('worked example: mattress + fan + poster → score 13 Bare', () => {
    const items = [
      item('a', 'mattress-floor', true, 0, 0),
      item('b', 'standing-fan', true, 2, 0),
      item('c', 'poster-afrobeats', true, 0, 0),
    ]
    const comfort = computeComfort(items, catalog, tier1, DEFAULT_ROOM_STYLE)
    expect(comfort.sleepQuality).toBe(8)
    expect(comfort.happiness).toBe(2)
    expect(comfort.study).toBe(0)
    expect(comfort.hygiene).toBe(0)
    expect(comfort.score).toBe(13)
    expect(comfort.label).toBe('Bare')
    expect(comfort.sleepEnergyBonusPct).toBe(8)
    expect(comfort.dailyFunBonus).toBe(0)
  })

  it('swaps footprint on 90/270 rotation', () => {
    expect(rotatedFootprint({ w: 2, d: 3 }, 0)).toEqual({ w: 2, d: 3 })
    expect(rotatedFootprint({ w: 2, d: 3 }, 90)).toEqual({ w: 3, d: 2 })
    expect(rotatedFootprint({ w: 2, d: 3 }, 270)).toEqual({ w: 3, d: 2 })
  })

  it('rejects out of bounds', () => {
    const items = [item('a', 'mattress-floor', true, 5, 0)] // 2x3 at x=5 on w=6 → overflow
    const result = validateLayout(items, catalog, tier1)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('OUT_OF_BOUNDS')
      expect(result.uid).toBe('a')
    }
  })

  it('rejects floor overlap', () => {
    const items = [
      item('a', 'mattress-floor', true, 0, 0),
      item('b', 'standing-fan', true, 0, 0),
    ]
    const result = validateLayout(items, catalog, tier1)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('OVERLAP')
  })

  it('allows rug to overlap floor items but not another rug', () => {
    const ok = validateLayout(
      [
        item('a', 'mattress-floor', true, 0, 0),
        item('b', 'rug-ankara', true, 0, 0),
      ],
      catalog,
      tier1,
    )
    expect(ok.ok).toBe(true)

    const bad = validateLayout(
      [
        item('a', 'rug-ankara', true, 0, 0),
        item('b', 'rug-ankara', true, 0, 0),
      ],
      catalog,
      tier1,
    )
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.code).toBe('OVERLAP')
  })

  it('requires wall items at z=0', () => {
    const result = validateLayout([item('a', 'poster-afrobeats', true, 0, 1)], catalog, tier1)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('WALL_ONLY_BACK')
  })

  it('replaces ignored item in comfort', () => {
    const items = [
      item('a', 'mattress-floor', true, 0, 0),
      item('b', 'bed-single', true, 3, 0),
    ]
    const comfort = computeComfort(items, catalog, tier1, DEFAULT_ROOM_STYLE)
    // bed-single only (replaces mattress): sleepQuality 8, happiness 2
    expect(comfort.sleepQuality).toBe(8)
    expect(comfort.happiness).toBe(2)
  })

  it('diminishes duplicate comfort', () => {
    const items = [
      item('a', 'standing-fan', true, 0, 0),
      item('b', 'standing-fan', true, 1, 0),
    ]
    const comfort = computeComfort(items, catalog, tier1, DEFAULT_ROOM_STYLE)
    // 5 + 2.5 = 7.5 → 8
    expect(comfort.sleepQuality).toBe(8)
  })

  it('applies style bonuses and caps', () => {
    const items = [item('a', 'bed-double', true, 0, 0)]
    const comfort = computeComfort(items, catalog, ROOM_TIERS['selfcon-g2'], {
      wallColor: '#3B4A5A',
      floorId: 'tiles-white',
    })
    // bed sleep 8 hap 5 + wall 3 + floor 2 = hap 10
    expect(comfort.sleepQuality).toBe(8)
    expect(comfort.happiness).toBe(10)
  })

  it('tier lock rejects placed over-tier items', () => {
    const items = [item('a', 'bed-double', true, 0, 0)]
    const result = validateLayout(items, catalog, tier1)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('TIER_LOCKED')
  })

  it('TOO_MANY when exceeding maxPerRoom', () => {
    const items = [
      item('a', 'plastic-chair', true, 0, 0),
      item('b', 'plastic-chair', true, 1, 0),
      item('c', 'plastic-chair', true, 2, 0),
      item('d', 'plastic-chair', true, 3, 0),
      item('e', 'plastic-chair', true, 4, 0),
    ]
    const result = validateLayout(items, catalog, tier1)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('TOO_MANY')
  })

  it('catalog has 18 seed rows', () => {
    expect(FURNITURE_CATALOG).toHaveLength(18)
  })
})
