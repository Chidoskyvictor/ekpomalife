import { describe, expect, it } from 'vitest'
import { ACTIONS, getAction } from './actions.js'
import { cooldownLeft, gainText, SELF_ACTIONS, waitText } from './self-actions.js'
import { isSkill } from './skills.js'

describe('self actions (tap yourself at home)', () => {
  it('are home actions with a cooldown, registered with the game actions', () => {
    for (const id of Object.keys(SELF_ACTIONS)) {
      const a = getAction(id)
      expect(a?.home, id).toBe(true)
      expect(a?.self?.cooldownSec, id).toBeGreaterThanOrEqual(60)
      for (const t of a!.self!.skills) expect(isSkill(t.skill), `${id}:${t.skill}`).toBe(true)
    }
    expect(Object.keys(ACTIONS).length).toBeGreaterThan(Object.keys(SELF_ACTIONS).length)
  })

  it('money earners are small and on a long cooldown', () => {
    for (const [id, a] of Object.entries(SELF_ACTIONS)) {
      expect(a.cost, id).toBeGreaterThanOrEqual(0)
      if (a.cost > 0) {
        expect(a.cost).toBeLessThanOrEqual(500)
        expect(a.cooldownSec).toBeGreaterThanOrEqual(15 * 60)
      }
    }
  })

  it('cooldown maths and notice text', () => {
    const now = new Date('2026-01-01T10:00:00Z')
    expect(cooldownLeft(null, 90, now)).toBe(0)
    expect(cooldownLeft(new Date('2026-01-01T09:59:30Z'), 90, now)).toBe(60)
    expect(cooldownLeft(new Date('2026-01-01T09:00:00Z'), 90, now)).toBe(0)
    expect(waitText(45)).toBe('45s')
    expect(waitText(61)).toBe('2m')
    expect(gainText(SELF_ACTIONS['sing-afrobeats'])).toBe('+Fun +Music')
    expect(gainText(SELF_ACTIONS['press-ups'])).toBe('+Fun −Energy +Fitness')
  })
})
