import { randomInt } from 'node:crypto'

/**
 * Fictional risky side activities — abstract outcomes only.
 * No real-world instructions in copy.
 */
export type HustleOutcomeKind = 'reward' | 'fine' | 'rep_loss' | 'lockout'

export type HustleDef = {
  id: string
  title: string
  /** Abstract blurb for UI — never operational detail. */
  hint: string
  placeId: string
  energyCost: number
  /** Allowed periods (match clockFromGameTime). Empty = any. */
  periods: Array<'morning' | 'afternoon' | 'evening' | 'night'>
  /** Weight per outcome; server rolls once. */
  weights: Record<HustleOutcomeKind, number>
  rewardMin: number
  rewardMax: number
  fineMin: number
  fineMax: number
  repLoss: number
  /** Game minutes of lockout when that outcome hits. */
  lockoutMinutes: number
}

export const HUSTLES: HustleDef[] = [
  {
    id: 'sort-lecturer',
    title: 'Sort lecturer',
    hint: 'A campus favour gone sideways. Outcome is luck — no tips, no how-to.',
    placeId: 'admin-block',
    energyCost: 15,
    periods: ['morning', 'afternoon', 'evening'],
    weights: { reward: 40, fine: 25, rep_loss: 20, lockout: 15 },
    rewardMin: 800,
    rewardMax: 2500,
    fineMin: 500,
    fineMax: 2000,
    repLoss: 8,
    lockoutMinutes: 180,
  },
  {
    id: 'junction-runs',
    title: 'Runs at the junction',
    hint: 'Something shady by the road. Pure chance — keep it fictional.',
    placeId: 'keke-park',
    energyCost: 20,
    periods: ['afternoon', 'evening', 'night'],
    weights: { reward: 35, fine: 30, rep_loss: 15, lockout: 20 },
    rewardMin: 1000,
    rewardMax: 4000,
    fineMin: 800,
    fineMax: 3500,
    repLoss: 12,
    lockoutMinutes: 240,
  },
]

const BY_ID = new Map(HUSTLES.map((h) => [h.id, h]))

export function getHustle(id: string): HustleDef | null {
  return BY_ID.get(id) ?? null
}

export function listHustleDefs() {
  return HUSTLES.map((h) => ({
    id: h.id,
    title: h.title,
    hint: h.hint,
    placeId: h.placeId,
    energyCost: h.energyCost,
    periods: h.periods,
  }))
}

export type RolledHustle =
  | { kind: 'reward'; amount: number }
  | { kind: 'fine'; amount: number }
  | { kind: 'rep_loss'; amount: number }
  | { kind: 'lockout'; untilGameTime: number; minutes: number }

/** Injectable RNG for tests. */
export function rollHustleOutcome(
  hustle: HustleDef,
  gameTime: number,
  roll: () => number = () => randomInt(0, 100),
): RolledHustle {
  const entries = Object.entries(hustle.weights) as [HustleOutcomeKind, number][]
  const total = entries.reduce((sum, [, w]) => sum + w, 0)
  let pick = roll() % Math.max(1, total)
  let kind: HustleOutcomeKind = 'reward'
  for (const [k, w] of entries) {
    pick -= w
    if (pick < 0) {
      kind = k
      break
    }
  }

  if (kind === 'reward') {
    const span = Math.max(0, hustle.rewardMax - hustle.rewardMin)
    const amount = hustle.rewardMin + (span > 0 ? randomInt(0, span + 1) : 0)
    return { kind, amount }
  }
  if (kind === 'fine') {
    const span = Math.max(0, hustle.fineMax - hustle.fineMin)
    const amount = hustle.fineMin + (span > 0 ? randomInt(0, span + 1) : 0)
    return { kind, amount }
  }
  if (kind === 'rep_loss') {
    return { kind, amount: hustle.repLoss }
  }
  return {
    kind: 'lockout',
    untilGameTime: gameTime + hustle.lockoutMinutes,
    minutes: hustle.lockoutMinutes,
  }
}
