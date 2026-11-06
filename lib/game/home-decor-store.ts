'use client'

import { useSyncExternalStore } from 'react'
import type { DecorZone, HomeDecor } from './home-decor'

/*
 * The Design tab's shared state: what the home has now (from the server) and what you're trying
 * on (shown in the 3D room before you pay). The room screen fills `owned`; the panel sets `trying`.
 */

export type DecorUi = { owned: HomeDecor; zones: DecorZone[]; trying: { zone: DecorZone; value: string } | null }

let ui: DecorUi = { owned: {}, zones: [], trying: null }
const listeners = new Set<() => void>()
const set = (next: Partial<DecorUi>) => {
  ui = { ...ui, ...next }
  listeners.forEach((l) => l())
}

export const setOwnedDecor = (owned: HomeDecor, zones?: DecorZone[]) => set(zones ? { owned, zones } : { owned })
export const tryDecor = (zone: DecorZone, value: string) => set({ trying: { zone, value } })
export const stopTrying = () => set({ trying: null })

/** What to draw: the owned look with the try-on on top. */
export const shownDecor = (state: DecorUi): HomeDecor => (state.trying ? { ...state.owned, [state.trying.zone]: state.trying.value } : state.owned)

export function useDecorUi(): DecorUi {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => ui,
    () => ui,
  )
}
