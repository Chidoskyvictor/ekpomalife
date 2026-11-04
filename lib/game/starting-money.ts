import type { DreamId } from './dreams'

export type StartingTierName = 'Hustle Mode' | 'Steady Start' | 'Big Boy' | 'Big Girl' | 'Nepo Baby'

/** Display ranges only — actual rolls happen on the server. */
export const STARTING_RANGES: Record<DreamId, { min: number; max: number }> = {
  'ekpoma-landlord': { min: 1_000_000, max: 2_000_000 },
  'tech-founder': { min: 1_500_000, max: 3_000_000 },
  'edo-star': { min: 1_500_000, max: 3_000_000 },
  'big-boy': { min: 2_000_000, max: 3_500_000 },
  'first-class': { min: 2_000_000, max: 4_000_000 },
  'campus-celeb': { min: 3_000_000, max: 5_000_000 },
  politics: { min: 2_500_000, max: 4_000_000 },
}

export const TIER_BADGE: Record<string, { emoji: string; name: string }> = {
  'Hustle Mode': { emoji: '🔥', name: 'Hustle Mode' },
  'Steady Start': { emoji: '📈', name: 'Steady Start' },
  'Big Boy': { emoji: '💼', name: 'Big Boy' },
  'Big Girl': { emoji: '💼', name: 'Big Girl' },
  'Big Boy/Big Girl': { emoji: '💼', name: 'Big Boy / Big Girl' },
  'Nepo Baby': { emoji: '👑', name: 'Nepo Baby' },
}

export function tierBadge(tier: string) {
  return TIER_BADGE[tier] ?? { emoji: '💸', name: tier }
}

export function confettiCount(tier: string) {
  if (tier === 'Nepo Baby') return 240
  if (tier === 'Big Boy' || tier === 'Big Girl' || tier === 'Big Boy/Big Girl') return 150
  if (tier === 'Steady Start') return 90
  return 48
}
