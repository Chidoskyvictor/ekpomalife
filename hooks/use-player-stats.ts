'use client'

import { useSyncExternalStore } from 'react'
import { apiUrl } from '@/lib/game/api'

export type PlayerStats = {
  /** Players with setup complete. Null only while unknown (loading or API down). */
  players: number | null
  /** Logged-in players active in the last few minutes. */
  online: number | null
  /** Players active since midnight (Lagos time). Null while unknown or on an older API without it. */
  today: number | null
  /** Total site visits. */
  visits: number | null
}

type StatsResponse =
  | { ok: true; players: number; online: number; today?: number; visits: number }
  | { ok: false; error?: string }

/** One shared poll for every counter on screen, and only while the app is visible (saves backend bandwidth). */
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

const EMPTY: PlayerStats = { players: null, online: null, today: null, visits: null }

let current: PlayerStats = EMPTY
const listeners = new Set<() => void>()
let timer: number | null = null
let started = false

function set(next: PlayerStats) {
  current = next
  listeners.forEach((l) => l())
}

async function load() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  try {
    const response = await fetch(`${apiUrl()}/stats`, { credentials: 'omit' })
    const data = (await response.json()) as StatsResponse
    if (!response.ok || !data.ok) return set(EMPTY)
    set({
      players: data.players ?? 0,
      online: data.online ?? 0,
      today: typeof data.today === 'number' ? data.today : null,
      visits: data.visits ?? 0,
    })
  } catch {
    set(EMPTY)
  }
}

function onVisible() {
  if (document.visibilityState === 'visible') void load()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!started) {
    started = true
    void recordVisit().then(load)
    document.addEventListener('visibilitychange', onVisible)
  }
  if (timer == null) timer = window.setInterval(() => void load(), REFRESH_MS)
  return () => {
    listeners.delete(listener)
    if (!listeners.size && timer != null) {
      window.clearInterval(timer)
      timer = null
    }
  }
}

export function usePlayerStats(): PlayerStats {
  return useSyncExternalStore(subscribe, () => current, () => EMPTY)
}
