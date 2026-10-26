'use client'

import { useEffect, useState } from 'react'
import { fetchSpaces, type SpaceCard } from '@/lib/game/spaces-api'

const POLL_MS = 20_000

/** Public rooms that are live right now, busiest first. Polls only while `enabled`. */
export function useLiveSpaces(enabled: boolean): SpaceCard[] {
  const [spaces, setSpaces] = useState<SpaceCard[]>([])

  useEffect(() => {
    if (!enabled) {
      setSpaces([])
      return
    }
    let cancelled = false
    const load = async (first = false) => {
      if (!first && document.hidden) return
      const res = await fetchSpaces('live')
      if (!cancelled && res.ok) setSpaces([...res.spaces].sort((a, b) => b.present - a.present))
    }
    void load(true)
    const id = window.setInterval(() => void load(), POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [enabled])

  return spaces
}
