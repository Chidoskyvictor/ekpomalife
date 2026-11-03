'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { apiGet, apiPost } from '@/lib/api/client'

export type HouseView = {
  plot: number
  userId: string
  username: string
  /** "Single room", "Self-con"… */
  kind: string
  area: string
  /** Signed in lately and at their house right now. */
  home: boolean
  items: number
}

/*
 * Everyone's house on the map, shared by the 3D tap targets and the house sheet. Loaded once
 * the map opens for a signed-in player (which also gives them their own plot) and refreshed
 * every minute while the map is up.
 */
let houses: HouseView[] = []
let myPlot: number | null = null
let users = 0
let timer: number | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

async function refresh() {
  const res = await apiGet<{ ok: true; houses: HouseView[] }>('/houses')
  if (res.ok) {
    houses = res.houses
    emit()
  }
}

async function start() {
  const mine = await apiPost<{ ok: true; plot: number }>('/houses/me', {})
  if (mine.ok) myPlot = mine.plot
  await refresh()
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Everyone's houses (and which one is yours). Pass `active: false` for guests. */
export function useHouses(active: boolean) {
  useEffect(() => {
    if (!active) return
    users += 1
    if (users === 1) {
      void start()
      timer = window.setInterval(() => void refresh(), 60_000)
    }
    return () => {
      users -= 1
      if (users === 0) window.clearInterval(timer)
    }
  }, [active])
  const list = useSyncExternalStore(subscribe, () => houses, () => houses)
  const mine = useSyncExternalStore(subscribe, () => myPlot, () => myPlot)
  return { houses: list, myPlot: mine }
}
