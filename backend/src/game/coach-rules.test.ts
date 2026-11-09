import { describe, expect, it } from 'vitest'
import { TIP_IDS, TOUR_STEPS, isTipId, nextTourStep } from './coach-rules.js'

describe('coach rules', () => {
  it('knows its tips', () => {
    expect(TIP_IDS.length).toBeGreaterThan(0)
    expect(isTipId('buy-mode')).toBe(true)
    expect(isTipId("'; DROP TABLE")).toBe(false)
  })
  it('tour progress only moves forward and ends after the last step', () => {
    expect(nextTourStep(0, 0)).toBe(1)
    expect(nextTourStep(4, 0)).toBe(4)
    expect(nextTourStep(0, TOUR_STEPS - 1)).toBeNull()
  })
})
