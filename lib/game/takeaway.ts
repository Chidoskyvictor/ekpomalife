import { useSyncExternalStore } from 'react'

/*
 * Food you're carrying: a take-out from Spot Rite / Wise Gourmet (or a plate you got up from before
 * finishing). It's bought on the server and sits in your inventory; this just remembers it's "in your
 * hand" so a small pill follows you everywhere until you eat it.
 */

export type Carried = { itemId: string; name: string; emoji: string }

const KEY = 'ekpoma-takeaway'
const listeners = new Set<() => void>()
let cache: Carried[] | null = null

function read(): Carried[] {
  if (cache) return cache
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Carried[]
  } catch {
    cache = []
  }
  return cache
}

function write(next: Carried[]) {
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage blocked: kept for this visit only */
  }
  listeners.forEach((fn) => fn())
}

export function carryFood(food: Carried) {
  write([...read(), food].slice(-3))
}

/** Remove one carried portion of this item (after eating it). */
export function dropFood(itemId: string) {
  const list = read()
  const i = list.findIndex((f) => f.itemId === itemId)
  if (i >= 0) write([...list.slice(0, i), ...list.slice(i + 1)])
}

const EMPTY: Carried[] = []
export function useCarried(): Carried[] {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => (typeof window === 'undefined' ? EMPTY : read()),
    () => EMPTY,
  )
}

/** Places you can take food away from (the others are sit-down only). */
export const TAKEAWAY_PLACES = new Set(['spot-rite', 'wise-gourmet'])

/** How long eating a plate takes (seconds). */
export const EAT_SECONDS = 20
