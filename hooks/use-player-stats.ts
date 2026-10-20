'use client'

import { useEffect, useState } from 'react'
import { apiUrl } from '@/lib/game/api'

export const MIN_PLAYERS_TO_SHOW = 10

export type PlayerStats = {
  /** Null when unknown or below display threshold. */
  players: number | null
}

type StatsResponse = { ok: true; players: number } | { ok: false; error?: string }

export function usePlayerStats(): PlayerStats {
  const [players, setPlayers] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch(`${apiUrl()}/stats`, { credentials: 'omit' })
        const data = (await response.json()) as StatsResponse
        if (cancelled || !response.ok || !data.ok) {
          setPlayers(null)
          return
        }
        setPlayers(data.players >= MIN_PLAYERS_TO_SHOW ? data.players : null)
      } catch {
        if (!cancelled) setPlayers(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return { players }
}
