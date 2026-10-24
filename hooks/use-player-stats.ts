'use client'

import { useEffect, useState } from 'react'
import { apiUrl } from '@/lib/game/api'

export type PlayerStats = {
  /** Players with setup complete. Null only while unknown (loading or API down). */
  players: number | null
  /** Logged-in players active in the last few minutes. */
  online: number | null
  /** Total site visits. */
  visits: number | null
}

type StatsResponse =
  | { ok: true; players: number; online: number; visits: number }
  | { ok: false; error?: string }

const REFRESH_MS = 60_000
const VISIT_KEY = 'ekpoma-life-visit-counted'

/** Count this browser visit once (per tab session), then forget about it. */
async function recordVisit() {
  try {
    if (window.sessionStorage.getItem(VISIT_KEY) === '1') return
    window.sessionStorage.setItem(VISIT_KEY, '1')
  } catch {
    return
  }
  try {
    await fetch(`${apiUrl()}/stats/visit`, { method: 'POST', credentials: 'omit' })
  } catch {
    /* counting is best-effort */
  }
}

const EMPTY: PlayerStats = { players: null, online: null, visits: null }

export function usePlayerStats(): PlayerStats {
  const [stats, setStats] = useState<PlayerStats>(EMPTY)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const response = await fetch(`${apiUrl()}/stats`, { credentials: 'omit' })
        const data = (await response.json()) as StatsResponse
        if (cancelled) return
        if (!response.ok || !data.ok) {
          setStats(EMPTY)
          return
        }
        setStats({ players: data.players ?? 0, online: data.online ?? 0, visits: data.visits ?? 0 })
      } catch {
        if (!cancelled) setStats(EMPTY)
      }
    }

    void recordVisit().then(load)
    const timer = window.setInterval(() => void load(), REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  return stats
}
