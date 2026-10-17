export type PlayerStats = { online: number; visits: number }

/** Placeholder until the live player counter ships. */
const DEV_STATS: PlayerStats = { online: 34_000, visits: 44_400 }

export function usePlayerStats(): PlayerStats {
  return DEV_STATS
}
