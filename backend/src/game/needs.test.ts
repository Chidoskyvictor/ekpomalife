import { describe, expect, it } from 'vitest'
import { clampNeeds, decayNeeds, defaultNeeds } from './needs.js'

describe('need decay', () => {
  it('clamps to 0–100', () => {
    expect(clampNeeds({ hunger: -10, energy: 200 }).hunger).toBe(0)
    expect(clampNeeds({ hunger: -10, energy: 200 }).energy).toBe(100)
  })

  it('decays over in-game time', () => {
    const start = defaultNeeds()
    const after = decayNeeds(start, 60, [])
    expect(after.hunger).toBeLessThan(start.hunger)
    expect(after.energy).toBeLessThan(start.energy)
  })

  it('foodie slows hunger drain', () => {
    const start = defaultNeeds()
    const base = decayNeeds(start, 120, [])
    const foodie = decayNeeds(start, 120, ['foodie'])
    expect(foodie.hunger).toBeGreaterThan(base.hunger)
  })

  it('gym-rat slows energy drain', () => {
    const start = defaultNeeds()
    const base = decayNeeds(start, 120, [])
    const gym = decayNeeds(start, 120, ['gym-rat'])
    expect(gym.energy).toBeGreaterThan(base.energy)
  })
})
