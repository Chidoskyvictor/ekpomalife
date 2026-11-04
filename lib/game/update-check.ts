'use client'

import { useSyncExternalStore } from 'react'

/** The build this page is running (baked in at build time). */
export const MY_VERSION = process.env.NEXT_PUBLIC_BUILD_VERSION ?? 'dev'
const APPLIED_KEY = 'ekpoma.update.applied'
const CHECK_MS = 120_000

let available: string | null = null
const listeners = new Set<() => void>()
let timer: number | null = null

function readApplied(): string | null {
  try {
    return localStorage.getItem(APPLIED_KEY)
  } catch {
    return null
  }
}

async function check() {
  try {
    const res = await fetch('/version', { cache: 'no-store' })
    const data = (await res.json()) as { version?: string }
    const next = data.version
    // Newer than what's running, and not the one the player just refreshed into (stale cached HTML)
    const fresh = next && next !== 'dev' && next !== MY_VERSION && next !== readApplied() ? next : null
    if (fresh !== available) {
      available = fresh
      listeners.forEach((l) => l())
    }
  } catch {
    /* offline: try again later */
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (timer == null && typeof window !== 'undefined') {
    void check()
    timer = window.setInterval(() => void check(), CHECK_MS)
    document.addEventListener('visibilitychange', onVisible)
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size && timer != null) {
      window.clearInterval(timer)
      timer = null
      document.removeEventListener('visibilitychange', onVisible)
    }
  }
}

function onVisible() {
  if (document.visibilityState === 'visible') void check()
}

/** The newer deployed build's id, or null when this page is up to date. */
export function useUpdateAvailable(): string | null {
  return useSyncExternalStore(subscribe, () => available, () => null)
}

/** The player tapped Refresh: remember it (so the notice doesn't come back for this build) and reload. */
export function applyUpdate() {
  try {
    if (available) localStorage.setItem(APPLIED_KEY, available)
  } catch {
    /* storage blocked: the reload still picks up the new build */
  }
  available = null
  listeners.forEach((l) => l())
  window.location.reload()
}
