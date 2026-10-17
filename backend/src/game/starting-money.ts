import { randomInt } from 'node:crypto'
import type { DreamId } from './dreams.js'
import type { TraitId } from './traits.js'

export const STARTING_CASH_MIN = 100_000
export const STARTING_CASH_MAX = 1_000_000

export const STARTING_RANGES: Record<DreamId, { min: number; max: number }> = {
  'ekpoma-landlord': { min: 100_000, max: 300_000 },
  'tech-founder': { min: 200_000, max: 450_000 },
  'edo-star': { min: 200_000, max: 450_000 },
  'big-boy': { min: 250_000, max: 500_000 },
  'first-class': { min: 300_000, max: 600_000 },
  'campus-celeb': { min: 500_000, max: 1_000_000 },
  politics: { min: 400_000, max: 700_000 },
}

export type StartingTierId = 'hustle' | 'steady' | 'big' | 'nepo'

export type StartingTierName = 'Hustle Mode' | 'Steady Start' | 'Big Boy' | 'Big Girl' | 'Nepo Baby'

const TIER_NAME: Record<StartingTierId, StartingTierName | 'Big Boy/Big Girl'> = {
  hustle: 'Hustle Mode',
  steady: 'Steady Start',
  big: 'Big Boy/Big Girl',
  nepo: 'Nepo Baby',
}

export function rangeForDream(dreamId: string): { min: number; max: number } | null {
  return STARTING_RANGES[dreamId as DreamId] ?? null
}

export function tierIdForAmount(amount: number): StartingTierId {
  if (amount < 250_000) return 'hustle'
  if (amount < 500_000) return 'steady'
  if (amount < 750_000) return 'big'
  return 'nepo'
}

export function tierNameFor(id: StartingTierId, body: 'man' | 'woman'): StartingTierName {
  if (id === 'big') return body === 'woman' ? 'Big Girl' : 'Big Boy'
  return TIER_NAME[id] as StartingTierName
}

function rollInRange(min: number, max: number) {
  const lo = Math.max(STARTING_CASH_MIN, Math.min(min, max))
  const hi = Math.min(STARTING_CASH_MAX, Math.max(min, max))
  return randomInt(lo, hi + 1)
}

function clipAndRound(value: number) {
  const rounded = Math.round(value / 500) * 500
  const clamped = Math.min(STARTING_CASH_MAX, Math.max(STARTING_CASH_MIN, rounded))
  return Math.round(clamped / 500) * 500
}

function pick<T>(items: readonly T[]): T {
  return items[randomInt(0, items.length)] as T
}

export function messageForTier(id: StartingTierId, body: 'man' | 'woman'): string {
  const vibe = body === 'woman' ? 'Big girl' : 'Big boy'
  if (id === 'hustle') {
    return pick([
      'Small money, big hustle. Every Ekpoma legend started here.',
      'Na from small we dey start. Your grind story go sweet pass.',
      "Real G's move in silence. Time to build from scratch.",
    ])
  }
  if (id === 'steady') {
    return pick([
      "Correct start! Enough to settle in and plan your moves.",
      "Balanced life loading. You've got room to grow.",
      'Steady pikin. Make am count.',
    ])
  }
  if (id === 'big') {
    return pick([
      `${vibe} energy! Ekpoma, make way.`,
      'Pocket full, vibes fuller. Spend wisely, shine loudly.',
      "Graduate, get a good paying job, and you're already halfway there.",
    ])
  }
  return pick([
    'Nepo baby unlocked! Papa don sponsor this life.',
    "LAPO? Never heard. You're starting on top.",
    'Money no be your problem. Now go build your name.',
  ])
}

export function rollStartingMoney(input: {
  dreamId: DreamId
  traits: TraitId[]
  body: 'man' | 'woman'
}) {
  const range = STARTING_RANGES[input.dreamId]
  let amount = rollInRange(range.min, range.max)

  if (input.traits.includes('risk-taker')) {
    amount = rollInRange(Math.round(range.min * 0.8), Math.round(range.max * 1.2))
  }

  if (input.traits.includes('hustler')) amount *= 1.1
  if (input.traits.includes('leader')) amount *= 1.05
  if (input.traits.includes('fashionista')) amount *= 1.05
  if (input.traits.includes('social-butterfly')) amount *= 1.05

  amount = clipAndRound(amount)
  const tierId = tierIdForAmount(amount)
  return {
    amount,
    tierId,
    tier: tierNameFor(tierId, input.body),
    range: { min: range.min, max: range.max },
    message: messageForTier(tierId, input.body),
  }
}
