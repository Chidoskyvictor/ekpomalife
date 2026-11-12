import { describe, expect, it } from 'vitest'
import { CARS, PARKING_PRICE, carSellBack, dentFixPrice, isPaint, needsParking } from './cars-rules.js'

describe('cars rules', () => {
  it('sells seven cars cheapest first at the agreed prices', () => {
    expect(CARS.map((c) => c.price)).toEqual([4_500_000, 5_000_000, 15_000_000, 20_000_000, 60_000_000, 150_000_000, 1_500_000_000])
    expect(new Set(CARS.map((c) => c.id)).size).toBe(7)
  })
  it('buys back at 60% and fixes dents for 2%', () => {
    expect(carSellBack(5_000_000)).toBe(3_000_000)
    expect(dentFixPrice(5_000_000)).toBe(100_000)
  })
  it('only one-bedroom homes come with parking', () => {
    expect(PARKING_PRICE).toBe(500_000)
    expect(needsParking('onebed-ojo', false)).toBe(false)
    expect(needsParking('hostel-poultry', false)).toBe(true)
    expect(needsParking('selfcon-g2', true)).toBe(false)
  })
  it('checks paint colours', () => {
    expect(isPaint('#2F6BF0')).toBe(true)
    expect(isPaint('#123456')).toBe(false)
  })
})
