'use client'

import { useSyncExternalStore } from 'react'
import type { DecorZone, HomeDecor } from './home-decor'

/*
 * The Design tab's shared state: what the home has now (from the server) and what you're trying
 * on (shown in the 3D room before you pay). The room screen fills `owned`; the panel sets `trying`.
 */

export type DecorUi = { owned: HomeDecor; zones: DecorZone[]; trying: { zone: DecorZone; value: string } | null; style: HomeDecor | null }

let ui: DecorUi = { owned: {}, zones: [], trying: null, style: null }
const listeners = new Set<() => void>()
const set = (next: Partial<DecorUi>) => {
  ui = { ...ui, ...next }
  listeners.forEach((l) => l())
}

export const setOwnedDecor = (owned: HomeDecor, zones?: DecorZone[]) => set(zones ? { owned, zones } : { owned })
export const tryDecor = (zone: DecorZone, value: string) => set({ trying: { zone, value } })
/** A style being tried on: its wall and floor show in the room. */
export const tryStyleDecor = (style: HomeDecor | null) => set({ style })
export const stopTrying = () => set({ trying: null })

/** What to draw: the owned look with the try-on on top. */
export const shownDecor = (state: DecorUi): HomeDecor => ({ ...state.owned, ...(state.style ?? {}), ...(state.trying ? { [state.trying.zone]: state.trying.value } : {}) })

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
