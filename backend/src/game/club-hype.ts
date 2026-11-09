/*
 * Club hype rules (pure data): pay to hype another player (DJ shout-out, bigger tiers add
 * fireworks) or to buy the club a round / shut it down. The paying + checks live in venues.ts
 * (hypeAtVenue); the app mirrors the labels in lib/game/venues-api.ts.
 */
export const HYPE_TIERS = {
  hype: { price: 5_000_000, target: true, label: 'Hype', cooldownMs: 20_000, reward: { social: 8, fun: 4 } },
  mega: { price: 15_000_000, target: true, label: 'Mega hype', cooldownMs: 20_000, reward: { social: 15, fun: 6 } },
  round: { price: 100_000_000, target: false, label: 'Buy the club a round', cooldownMs: 120_000, reward: null },
  shutdown: { price: 1_000_000_000, target: false, label: 'Shut down the club', cooldownMs: 120_000, reward: null },
} as const
export type HypeTier = keyof typeof HYPE_TIERS

/** The same pair can't be hyped again for this long (stops two accounts farming each other). */
export const HYPE_PAIR_COOLDOWN_MS = 5 * 60_000
