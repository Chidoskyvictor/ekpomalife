import { describe, expect, it } from 'vitest'
import { RIDE_BASE, RIDE_PER_HOP } from './phone.js'
import { NEAR_HOPS, travelOptions } from './travel.js'

describe('travelOptions', () => {
  const options = travelOptions('admin-block', 'off-campus-hostels')

  it('leaves out where you are and lists home first', () => {
    expect(options.some((o) => o.id === 'admin-block')).toBe(false)
    expect(options[0]).toMatchObject({ id: 'off-campus-hostels', home: true })
  })

  it('keeps home on the list when you are already on its block', () => {
    const atHome = travelOptions('off-campus-hostels', 'off-campus-hostels')
    expect(atHome[0]).toMatchObject({ id: 'off-campus-hostels', home: true, hops: 0 })
  })

  it('marks nearby places and prices rides like POST /ride', () => {
    for (const o of options) {
      expect(o.near).toBe(o.hops <= NEAR_HOPS)
      expect(o.fares.keke).toBe(RIDE_BASE.keke + RIDE_PER_HOP.keke * o.hops)
      expect(o.fares.okada).toBe(RIDE_BASE.okada + RIDE_PER_HOP.okada * o.hops)
      expect(o.minutes.okada).toBeLessThan(o.minutes.trek)
    }
  })
})
