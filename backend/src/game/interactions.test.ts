import { describe, expect, it } from 'vitest'
import { gate, INTERACTIONS, levelFor, pairOf } from './interactions.js'

describe('player interactions', () => {
  it('friendly actions are always open', () => {
    for (const d of Object.values(INTERACTIONS).filter((x) => x.tier === 'friendly')) {
      expect(gate(d, { points: 0, mutualPartners: false }), d.id).toBeNull()
      expect(d.ask, d.id).toBe(false)
    }
  })

  it('hug unlocks at close friend and always asks first', () => {
    const hug = INTERACTIONS.hug!
    expect(hug.ask).toBe(true)
    expect(gate(hug, { points: 5, mutualPartners: false })).not.toBeNull()
    expect(gate(hug, { points: 30, mutualPartners: false })).toBeNull()
  })

  it('romantic actions need BOTH opt-ins and always ask the other player', () => {
    for (const d of Object.values(INTERACTIONS).filter((x) => x.tier === 'romantic')) {
      expect(d.ask, d.id).toBe(true)
      // lots of points is not enough: one-sided opt-in is just "not mutual"
      expect(gate(d, { points: 999, mutualPartners: false }), d.id).not.toBeNull()
      expect(gate(d, { points: 0, mutualPartners: true }), d.id).toBeNull()
    }
  })

  it('levels by points; a one-sided opt-in never shows as partner', () => {
    expect(levelFor(0, false, false)).toBe('stranger')
    expect(levelFor(8, false, false)).toBe('padi')
    expect(levelFor(30, false, false)).toBe('close')
    expect(levelFor(50, true, false)).toBe('crush')
    expect(levelFor(0, true, true)).toBe('partner')
  })

  it('risky actions have a success chance and cooldowns are set', () => {
    expect(INTERACTIONS.joke!.chance).toBeLessThan(1)
    expect(INTERACTIONS.shade!.chance).toBeLessThan(1)
    for (const d of Object.values(INTERACTIONS)) expect(d.cooldownSec, d.id).toBeGreaterThanOrEqual(60)
  })

  it('pairs are ordered the same both ways', () => {
    expect(pairOf('b', 'a')).toEqual(['a', 'b'])
    expect(pairOf('a', 'b')).toEqual(['a', 'b'])
  })
})
