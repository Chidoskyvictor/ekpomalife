/*
 * Racing rewards that are not money: racer rank (XP), badges and car upgrades. Pure rules, no React.
 * Copy of lib/game/race-rewards.ts for the server (lib/game/race-rewards.test.ts fails if they drift).
 */

/* —— Rank —— */

export type RankDef = { id: string; name: string; emoji: string; xp: number }

export const RANKS: RankDef[] = [
  { id: 'learner', name: 'Learner', emoji: '🔰', xp: 0 },
  { id: 'okada', name: 'Okada Rider', emoji: '🏍️', xp: 200 },
  { id: 'danfo', name: 'Danfo Driver', emoji: '🚌', xp: 700 },
  { id: 'street', name: 'Street Racer', emoji: '🏎️', xp: 1800 },
  { id: 'king', name: 'Expressway King', emoji: '👑', xp: 4000 },
]

export function rankIndex(xp: number) {
  let at = 0
  RANKS.forEach((r, i) => {
    if (xp >= r.xp) at = i
  })
  return at
}
export const rankFor = (xp: number) => RANKS[rankIndex(xp)]!

/** Progress to the next rank: 0..1 and the XP still needed (null at the top). */
export function rankProgress(xp: number) {
  const i = rankIndex(xp)
  const next = RANKS[i + 1]
  if (!next) return { rank: RANKS[i]!, next: null, fraction: 1, toGo: 0 }
  const here = RANKS[i]!.xp
  return { rank: RANKS[i]!, next, fraction: (xp - here) / (next.xp - here), toGo: next.xp - xp }
}

export type RunEvent = {
  /** 'trial' (alone), 'ai' (against AI drivers) or 'pvp' (against players). */
  mode: 'trial' | 'ai' | 'pvp'
  /** Finish place and field size (1 of 1 for a solo trial). */
  place: number
  of: number
  /** A new personal best on a named route (trials and AI races). */
  personalBest: boolean
  /** Opponents you beat who had a faster car or a higher rank. */
  beatFaster: number
  /** Finished on a named route and the server accepted the time. */
  counted: boolean
}

export const XP_CAP = 220

/** XP for one finished run: a base for finishing, more for winning and podiums, for beating faster rivals, for a personal best. */
export function xpFor(e: RunEvent) {
  if (!e.counted) return 0
  let xp = 20
  if (e.of > 1) {
    if (e.place === 1) xp += 60
    else if (e.place === 2) xp += 30
    else if (e.place === 3) xp += 15
    xp += Math.min(3, Math.max(0, e.of - e.place)) * 8 // beaten rivals
    xp += Math.min(3, e.beatFaster) * 20
  }
  if (e.personalBest) xp += 25
  if (e.mode === 'pvp') xp = Math.round(xp * 1.5)
  return Math.min(XP_CAP, xp)
}

/** Repeating the same run for a worse time earns less, so rank cannot be farmed on one short route. */
export const xpForRepeat = (xp: number, personalBest: boolean) => (personalBest ? xp : Math.max(5, Math.round(xp * 0.4)))

/* —— Badges —— */

export type BadgeDef = { id: string; name: string; emoji: string; blurb: string }

export const BADGES: BadgeDef[] = [
  { id: 'first-win', name: 'First win', emoji: '🥇', blurb: 'Win a race.' },
  { id: 'ten-wins', name: '10 wins', emoji: '🏆', blurb: 'Win ten races.' },
  { id: 'top-10', name: 'Top 10', emoji: '🎖️', blurb: 'Get into the top 10 of any route.' },
  { id: 'number-one', name: '#1 on a route', emoji: '👑', blurb: 'Hold the fastest time on a route.' },
  { id: 'ai-pro', name: 'AI pro beaten', emoji: '🤖', blurb: 'Beat the sharpest AI driver in a race.' },
  { id: 'clean-race', name: 'Clean race', emoji: '✨', blurb: 'Finish a race without crashing.' },
  { id: 'night-racer', name: 'Night racer', emoji: '🌙', blurb: 'Win a race at night.' },
  { id: 'comeback', name: 'Comeback win', emoji: '🔥', blurb: 'Win after being last at the halfway checkpoint.' },
]
export const badgeById = (id: string) => BADGES.find((b) => b.id === id) ?? null

export type BadgeFacts = {
  /** Totals after this run. */
  wins: number
  /** Route rank after this run (1 = fastest) for a counted time, else null. */
  routeRank: number | null
  won: boolean
  /** The sharpest AI in the field (skill 0..1) that you beat. */
  beatAiSkill: number | null
  crashed: boolean
  night: boolean
  /** You were last at the halfway checkpoint and still won. */
  comeback: boolean
  /** Finished a real race (not quit). */
  finished: boolean
}

/** An AI at or above this skill counts as a "pro". */
export const AI_PRO_SKILL = 0.9

/** Badges this run earns (the caller drops the ones already owned). */
export function badgesEarned(f: BadgeFacts): string[] {
  const out: string[] = []
  if (f.won && f.wins >= 1) out.push('first-win')
  if (f.wins >= 10) out.push('ten-wins')
  if (f.routeRank !== null && f.routeRank <= 10) out.push('top-10')
  if (f.routeRank === 1) out.push('number-one')
  if (f.beatAiSkill !== null && f.beatAiSkill >= AI_PRO_SKILL) out.push('ai-pro')
  if (f.finished && !f.crashed) out.push('clean-race')
  if (f.won && f.night) out.push('night-racer')
  if (f.won && f.comeback) out.push('comeback')
  return out
}

/* —— Upgrades —— */

export type Part = 'engine' | 'tyres' | 'brakes'
export const PARTS: Part[] = ['engine', 'tyres', 'brakes']
export const MAX_LEVEL = 3
export type Upgrades = Record<Part, number>
export const NO_UPGRADES: Upgrades = { engine: 0, tyres: 0, brakes: 0 }

export type PartDef = { id: Part; name: string; emoji: string; blurb: string; /** Price per level as a share of the car's price. */ price: [number, number, number] }

export const PART_DEFS: PartDef[] = [
  { id: 'engine', name: 'Engine', emoji: '🔧', blurb: 'More pull and a higher top speed.', price: [0.05, 0.12, 0.25] },
  { id: 'tyres', name: 'Tyres', emoji: '🛞', blurb: 'More grip in the corners.', price: [0.03, 0.08, 0.16] },
  { id: 'brakes', name: 'Brakes', emoji: '🛑', blurb: 'Stop later, brake deeper into a hairpin.', price: [0.02, 0.05, 0.1] },
]

/** Rank (index into RANKS) you need before you may buy level 1, 2, 3. */
export const LEVEL_RANK = [0, 1, 3] as const

/** What each level adds: engine top speed and pull, tyre grip, braking power. */
export const EFFECT = {
  engineTop: 0.03,
  engineGas: 0.08,
  tyreGrip: 0.05,
  brake: 0.1,
}

export const upgradePrice = (part: Part, level: number, carPrice: number) => {
  const def = PART_DEFS.find((p) => p.id === part)!
  return Math.round((carPrice * def.price[level - 1]!) / 1000) * 1000
}

/** Can you buy `level` of a part at this XP? (Levels go one at a time.) */
export function upgradeBlock(have: number, level: number, xp: number): 'ok' | 'order' | 'max' | 'rank' {
  if (level > MAX_LEVEL || have >= MAX_LEVEL) return 'max'
  if (level !== have + 1) return 'order'
  if (rankIndex(xp) < LEVEL_RANK[level - 1]!) return 'rank'
  return 'ok'
}

/** The multipliers a set of upgrades gives. 1 = stock. */
export function upgradeEffects(up: Upgrades) {
  return {
    top: 1 + EFFECT.engineTop * up.engine,
    gas: 1 + EFFECT.engineGas * up.engine,
    grip: 1 + EFFECT.tyreGrip * up.tyres,
    brake: 1 + EFFECT.brake * up.brakes,
  }
}

/** "E2 T1 B0" for a board or a grid. Null when stock. */
export function upgradeNote(up: Upgrades) {
  if (!up.engine && !up.tyres && !up.brakes) return null
  return `E${up.engine} T${up.tyres} B${up.brakes}`
}

/** A compact code for the database: "e2t1b0". */
export const upgradeCode = (up: Upgrades) => `e${up.engine}t${up.tyres}b${up.brakes}`
export function parseUpgradeCode(code: string | null | undefined): Upgrades {
  const m = /^e([0-3])t([0-3])b([0-3])$/.exec(code ?? '')
  return m ? { engine: Number(m[1]), tyres: Number(m[2]), brakes: Number(m[3]) } : { ...NO_UPGRADES }
}

/** AI drivers get upgrades to match their skill, so a sharp one is a faster car as well as a better driver. */
export function aiUpgrades(skill: number): Upgrades {
  const level = skill >= 0.93 ? 3 : skill >= 0.86 ? 2 : skill >= 0.78 ? 1 : 0
  return { engine: level, tyres: Math.max(0, level - 1), brakes: level > 0 ? 1 : 0 }
}

/** A rank to show on an AI's name tag from its skill. */
export function aiRankXp(skill: number) {
  return skill >= 0.93 ? 4200 : skill >= 0.86 ? 1900 : skill >= 0.78 ? 800 : 250
}
