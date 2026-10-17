import { describe, expect, it } from 'vitest'
import { STARTING_RANGES, rollStartingMoney } from './starting-money.js'
import type { DreamId } from './dreams.js'

const DREAMS = Object.keys(STARTING_RANGES) as DreamId[]

describe('starting money ranges', () => {
  it('includes politics at ₦400k–₦700k', () => {
    expect(STARTING_RANGES.politics).toEqual({ min: 400_000, max: 700_000 })
  })

  it('rolls within each dream range (base traits)', () => {
    for (const dreamId of DREAMS) {
      const range = STARTING_RANGES[dreamId]
      for (let i = 0; i < 20; i += 1) {
        const rolled = rollStartingMoney({
          dreamId,
          traits: ['tech', 'hustler'],
          body: 'man',
        })
        expect(rolled.amount).toBeGreaterThanOrEqual(range.min - 50_000)
        expect(rolled.amount).toBeLessThanOrEqual(range.max + 100_000)
      }
    }
  })

  it('covers all seven dreams', () => {
    expect(DREAMS.sort()).toEqual(
      [
        'big-boy',
        'campus-celeb',
        'edo-star',
        'ekpoma-landlord',
        'first-class',
        'politics',
        'tech-founder',
      ].sort(),
    )
  })
})
