import { describe, expect, it } from 'vitest'
import { BUSH_SPOTS, PALM_SPOTS, STREET_LAMPS } from './world-scenery'
import { MAP_ZONES, ROADS, inRect } from './world-layout'

describe('world scenery', () => {
  it('places palms, bushes and lamps', () => {
    console.log({ palms: PALM_SPOTS.length, bushes: BUSH_SPOTS.length, lamps: STREET_LAMPS.length })
    expect(PALM_SPOTS.length).toBeGreaterThan(40)
    expect(BUSH_SPOTS.length).toBeGreaterThan(40)
    expect(STREET_LAMPS.length).toBeGreaterThan(10)
  })

  it('keeps props off roads and zone footprints', () => {
    for (const p of [...PALM_SPOTS, ...BUSH_SPOTS]) {
      expect(ROADS.some((road) => inRect(p.x, p.z, road))).toBe(false)
      expect(
        MAP_ZONES.some((zone) =>
          inRect(p.x, p.z, { x: zone.position[0], z: zone.position[1], w: zone.footprint[0], d: zone.footprint[1] }),
        ),
      ).toBe(false)
    }
  })
})
