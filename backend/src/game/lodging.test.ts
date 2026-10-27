import { describe, expect, it } from 'vitest'
import { STARTING_CASH_MIN, STARTING_RANGES } from './starting-money.js'
import { moveInFeeFor } from './lodging.js'

describe('move-in fee', () => {
  it('is free for the AAU hostel and grows with the house', () => {
    expect(moveInFeeFor('hostel-poultry')).toBe(0)
    expect(moveInFeeFor('single-poultry')).toBeLessThan(moveInFeeFor('selfcon-g2'))
    expect(moveInFeeFor('selfcon-g2')).toBeLessThan(moveInFeeFor('onebed-ojo'))
  })

  it('treats an unknown house as the hostel', () => {
    expect(moveInFeeFor(null)).toBe(0)
    expect(moveInFeeFor('mansion')).toBe(0)
  })

  it('keeps the hostel open to every spin, and the dearest house out of reach of the lowest', () => {
    expect(moveInFeeFor('hostel-poultry')).toBeLessThanOrEqual(STARTING_CASH_MIN)
    const lowest = Math.min(...Object.values(STARTING_RANGES).map((range) => range.min))
    expect(moveInFeeFor('onebed-ojo')).toBeGreaterThan(lowest)
  })
})
