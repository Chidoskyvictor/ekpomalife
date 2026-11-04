import { randomInt } from 'node:crypto'
import type { DreamId } from './dreams.js'
import type { TraitId } from './traits.js'

/** Starting money spin: ₦1m to ₦5m (by dream and traits). */
export const STARTING_CASH_MIN = 1_000_000
export const STARTING_CASH_MAX = 5_000_000

export const STARTING_RANGES: Record<DreamId, { min: number; max: number }> = {
  'ekpoma-landlord': { min: 1_000_000, max: 2_000_000 },
  'tech-founder': { min: 1_500_000, max: 3_000_000 },
  'edo-star': { min: 1_500_000, max: 3_000_000 },
  'big-boy': { min: 2_000_000, max: 3_500_000 },
  'first-class': { min: 2_000_000, max: 4_000_000 },
  'campus-celeb': { min: 3_000_000, max: 5_000_000 },
  politics: { min: 2_500_000, max: 4_000_000 },
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
  if (amount < 2_000_000) return 'hustle'
  if (amount < 3_000_000) return 'steady'
  if (amount < 4_000_000) return 'big'
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
  // Round to ₦10,000 so the amounts look clean
  const rounded = Math.round(value / 10_000) * 10_000
  return Math.min(STARTING_CASH_MAX, Math.max(STARTING_CASH_MIN, rounded))
}

function pick<T>(items: readonly T[]): T {
  return items[randomInt(0, items.length)] as T
}

export function messageForTier(id: StartingTierId, body: 'man' | 'woman'): string {
  const vibe = body === 'woman' ? 'Big girl' : 'Big boy'
  if (id === 'hustle') {
    return pick([
      'Small money, big hustle. Every Ekpoma legend started here.',
      'Everyone starts small. Your success story will be sweeter for it.',
      "Real G's move in silence. Time to build from scratch.",
    ])
  }
  if (id === 'steady') {
    return pick([
      "Correct start! Enough to settle in and plan your moves.",
      "Balanced life loading. You've got room to grow.",
      'Steady start. Make it count.',
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
    'Rich kid unlocked! Your family is sponsoring this life.',
    "LAPO? Never heard. You're starting on top.",
    'Money is not your problem. Now go build your name.',
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
