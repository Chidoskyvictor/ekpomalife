import type { PlayTab } from '@/components/hud/play-nav'

const KEY = 'ekpoma-nav-intent'

export function stashNavIntent(tab: PlayTab) {
  try {
    sessionStorage.setItem(KEY, tab)
  } catch {
    /* ignore */
  }
}

export function takeNavIntent(): PlayTab | null {
  try {
    const value = sessionStorage.getItem(KEY) as PlayTab | null
    sessionStorage.removeItem(KEY)
    if (value === 'home' || value === 'buy' || value === 'map' || value === 'phone') return value
  } catch {
    /* ignore */
  }
  return null
}
