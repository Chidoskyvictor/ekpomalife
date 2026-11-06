import { describe, expect, it } from 'vitest'
import { RIDE_BASE, RIDE_PER_HOP, fareForKm, rideQuote } from './phone.js'
import { roadKm } from './road-distances.js'
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
      const km = roadKm('admin-block', o.id)
      expect(o.fares.keke).toBe(km === null ? RIDE_BASE.keke + RIDE_PER_HOP.keke * o.hops : fareForKm('keke', km))
      expect(o.fares.okada).toBe(km === null ? RIDE_BASE.okada + RIDE_PER_HOP.okada * o.hops : fareForKm('okada', km))
      expect(o.minutes.okada).toBeLessThanOrEqual(o.minutes.trek)
      // The picker and POST /ride quote the same fare
      const quote = rideQuote('admin-block', o.id)
      if (quote.ok && !o.home) expect(quote.quotes.find((q) => q.mode === 'keke')?.fare).toBe(o.fares.keke)
    }
  })

  it('prices by real road distance: farther costs more and takes longer', () => {
    const near = travelOptions('aau-gate', 'off-campus-hostels').find((o) => o.id === 'sazza')!
    const far = travelOptions('aau-gate', 'off-campus-hostels').find((o) => o.id === 'market-square')!
    expect(far.fares.keke).toBeGreaterThan(near.fares.keke)
    expect(far.minutes.keke).toBeGreaterThan(near.minutes.keke)
    expect(fareForKm('keke', 0.01)).toBe(RIDE_BASE.keke)
  })
})
