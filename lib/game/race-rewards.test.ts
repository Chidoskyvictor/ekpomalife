import { describe, expect, it } from 'vitest'
import * as server from '../../backend/src/game/race-rewards-rules'
import { bodyFor, drive, newBody, upgradedTune, type Tune } from './car-physics'
import * as rules from './race-rewards'

const base: Tune = { top: 55, topGrass: 11, gas: 13, reverse: 7, brake: 32, drag: 6 }
const pedalsGas = { gas: true, brake: false, steer: 0 }
const run = (tune: Tune, secs: number) => {
  const b = newBody(0, 0, 0)
  for (let t = 0; t < secs; t += 0.02) {
    const s = drive(b, pedalsGas, bodyFor('camry'), tune, 'road', 0.02)
    b.x = s.x
    b.z = s.z
    b.h = s.h
  }
  return b
}
const fx = (up: rules.Upgrades) => rules.upgradeEffects(up)

describe('rank', () => {
  it('climbs Learner, Okada Rider, Danfo Driver, Street Racer, Expressway King', () => {
    expect(rules.RANKS.map((r) => r.name)).toEqual(['Learner', 'Okada Rider', 'Danfo Driver', 'Street Racer', 'Expressway King'])
    expect(rules.rankFor(0).name).toBe('Learner')
    expect(rules.rankFor(199).name).toBe('Learner')
    expect(rules.rankFor(200).name).toBe('Okada Rider')
    expect(rules.rankFor(99999).name).toBe('Expressway King')
    expect(rules.rankProgress(450).toGo).toBe(250)
    expect(rules.rankProgress(5000).next).toBeNull()
  })

  it('pays more for wins, podiums, beating faster players and personal bests', () => {
    const base1 = { mode: 'ai' as 'ai' | 'pvp' | 'trial', place: 4, of: 4, personalBest: false, beatFaster: 0, counted: true }
    const xp = (e: Partial<typeof base1>) => rules.xpFor({ ...base1, ...e })
    expect(xp({ counted: false })).toBe(0)
    expect(xp({ place: 1 })).toBeGreaterThan(xp({ place: 2 }))
    expect(xp({ place: 2 })).toBeGreaterThan(xp({ place: 3 }))
    expect(xp({ place: 3 })).toBeGreaterThan(xp({ place: 4 }))
    expect(xp({ place: 1, beatFaster: 2 })).toBeGreaterThan(xp({ place: 1 }))
    expect(xp({ personalBest: true })).toBeGreaterThan(xp({}))
    expect(xp({ mode: 'pvp', place: 1 })).toBeGreaterThan(xp({ place: 1 }))
    expect(xp({ mode: 'pvp', place: 1, beatFaster: 3, personalBest: true })).toBeLessThanOrEqual(rules.XP_CAP)
    expect(rules.xpForRepeat(80, false)).toBeLessThan(80)
    expect(rules.xpForRepeat(80, true)).toBe(80)
  })
})

describe('badges', () => {
  const facts = { wins: 0, routeRank: null, won: false, beatAiSkill: null, crashed: true, night: false, comeback: false, finished: true }
  it('awards each badge for the right thing', () => {
    expect(rules.badgesEarned({ ...facts, won: true, wins: 1 })).toContain('first-win')
    expect(rules.badgesEarned({ ...facts, wins: 9 })).not.toContain('ten-wins')
    expect(rules.badgesEarned({ ...facts, wins: 10 })).toContain('ten-wins')
    expect(rules.badgesEarned({ ...facts, routeRank: 10 })).toContain('top-10')
    expect(rules.badgesEarned({ ...facts, routeRank: 11 })).not.toContain('top-10')
    const first = rules.badgesEarned({ ...facts, routeRank: 1 })
    expect(first).toContain('number-one')
    expect(first).toContain('top-10')
    expect(rules.badgesEarned({ ...facts, beatAiSkill: 0.95 })).toContain('ai-pro')
    expect(rules.badgesEarned({ ...facts, beatAiSkill: 0.8 })).not.toContain('ai-pro')
    expect(rules.badgesEarned({ ...facts, crashed: false })).toContain('clean-race')
    expect(rules.badgesEarned({ ...facts, crashed: false, finished: false })).not.toContain('clean-race')
    expect(rules.badgesEarned({ ...facts, won: true, wins: 1, night: true })).toContain('night-racer')
    expect(rules.badgesEarned({ ...facts, night: true })).not.toContain('night-racer')
    expect(rules.badgesEarned({ ...facts, won: true, wins: 1, comeback: true })).toContain('comeback')
    expect(rules.badgesEarned({ ...facts, comeback: true })).not.toContain('comeback')
  })
  it('has a name, emoji and blurb for every badge', () => {
    for (const b of rules.BADGES) expect(Boolean(b.name && b.emoji && b.blurb)).toBe(true)
    expect(new Set(rules.BADGES.map((b) => b.id)).size).toBe(rules.BADGES.length)
  })
})

describe('upgrades', () => {
  it('go one level at a time, cost more each level and are unlocked by rank', () => {
    expect(rules.upgradeBlock(0, 2, 99999)).toBe('order')
    expect(rules.upgradeBlock(3, 4, 99999)).toBe('max')
    expect(rules.upgradeBlock(0, 1, 0)).toBe('ok')
    expect(rules.upgradeBlock(1, 2, 0)).toBe('rank')
    expect(rules.upgradeBlock(1, 2, 200)).toBe('ok')
    expect(rules.upgradeBlock(2, 3, 700)).toBe('rank')
    expect(rules.upgradeBlock(2, 3, 1800)).toBe('ok')
    for (const p of rules.PARTS) {
      const prices = [1, 2, 3].map((l) => rules.upgradePrice(p, l, 5_000_000))
      expect(prices[0]).toBeLessThan(prices[1]!)
      expect(prices[1]).toBeLessThan(prices[2]!)
    }
  })
  it('round-trips the database code and notes the level', () => {
    const up = { engine: 2, tyres: 1, brakes: 0 }
    expect(rules.parseUpgradeCode(rules.upgradeCode(up))).toEqual(up)
    expect(rules.parseUpgradeCode('junk')).toEqual(rules.NO_UPGRADES)
    expect(rules.upgradeNote(up)).toBe('E2 T1 B0')
    expect(rules.upgradeNote(rules.NO_UPGRADES)).toBeNull()
  })
  it('gives a sharper AI a better-upgraded car', () => {
    expect(rules.aiUpgrades(0.95).engine).toBeGreaterThan(rules.aiUpgrades(0.72).engine)
  })
})

describe('upgrades really change how the car drives', () => {
  it('an engine upgrade accelerates harder and tops out higher', () => {
    const stock = run(base, 6)
    const tuned = run(upgradedTune(base, fx({ engine: 3, tyres: 0, brakes: 0 })), 6)
    expect(tuned.v).toBeGreaterThan(stock.v)
    expect(tuned.z).toBeGreaterThan(stock.z)
    const topStock = run(base, 40).v
    const topTuned = run(upgradedTune(base, fx({ engine: 3, tyres: 0, brakes: 0 })), 40).v
    expect(topTuned / topStock).toBeGreaterThan(1.05)
  })
  it('tyres hold more sideways grip at the same speed', () => {
    const lat = (tune: Tune) => {
      const b = newBody(0, 0, 0)
      b.v = 30
      let worst = 0
      for (let t = 0; t < 2; t += 0.02) {
        const s = drive(b, { gas: false, brake: false, steer: 1 }, bodyFor('camry'), tune, 'road', 0.02)
        b.x = s.x
        b.z = s.z
        b.h = s.h
        worst = Math.max(worst, Math.abs(s.aLat))
      }
      return worst
    }
    expect(lat(upgradedTune(base, fx({ engine: 0, tyres: 3, brakes: 0 })))).toBeGreaterThan(lat(base) * 1.05)
  })
  it('brakes stop the car in a shorter distance', () => {
    const stopDist = (tune: Tune) => {
      const b = newBody(0, 0, 0)
      b.v = 50
      while (b.v > 0.3) {
        const s = drive(b, { gas: false, brake: true, steer: 0 }, bodyFor('camry'), tune, 'road', 0.02)
        b.x = s.x
        b.z = s.z
        b.h = s.h
      }
      return b.z
    }
    expect(stopDist(upgradedTune(base, fx({ engine: 0, tyres: 0, brakes: 3 })))).toBeLessThan(stopDist(base) * 0.95)
  })
  it('stock effects change nothing', () => {
    expect(upgradedTune(base, fx(rules.NO_UPGRADES))).toEqual({ ...base, grip: 1 })
  })
})

describe('server copy', () => {
  it('matches the phone rules', () => {
    expect(server.RANKS).toEqual(rules.RANKS)
    expect(server.BADGES).toEqual(rules.BADGES)
    expect(server.PART_DEFS).toEqual(rules.PART_DEFS)
    expect(server.LEVEL_RANK).toEqual(rules.LEVEL_RANK)
    expect(server.EFFECT).toEqual(rules.EFFECT)
    expect(server.XP_CAP).toBe(rules.XP_CAP)
    const e = { mode: 'pvp' as const, place: 1, of: 3, personalBest: true, beatFaster: 2, counted: true }
    expect(server.xpFor(e)).toBe(rules.xpFor(e))
    expect(server.upgradeEffects({ engine: 2, tyres: 1, brakes: 3 })).toEqual(rules.upgradeEffects({ engine: 2, tyres: 1, brakes: 3 }))
  })
})
