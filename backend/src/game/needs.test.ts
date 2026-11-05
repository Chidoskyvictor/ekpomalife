import { describe, expect, it } from 'vitest'
import { clampNeeds, decayNeeds, defaultNeeds } from './needs.js'

describe('need decay', () => {
  it('clamps to 0–100', () => {
    expect(clampNeeds({ hunger: -10, energy: 200 }).hunger).toBe(0)
    expect(clampNeeds({ hunger: -10, energy: 200 }).energy).toBe(100)
  })

  it('needs do not drain on their own with time (only actions change them)', () => {
    const start = defaultNeeds()
    expect(decayNeeds(start, 600, [])).toEqual(start)
    expect(decayNeeds(start, 600, ['foodie', 'gym-rat'], 2)).toEqual(start)
  })
})
