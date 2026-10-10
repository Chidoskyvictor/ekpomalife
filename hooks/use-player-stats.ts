export type PlayerStats = { online: number; visits: number }

const DEV_STATS: PlayerStats = { online: 0, visits: 0 }

export function usePlayerStats(): PlayerStats {
  return DEV_STATS
}
