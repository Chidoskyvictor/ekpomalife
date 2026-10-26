'use client'

import { useSyncExternalStore } from 'react'
import type { HomeItem } from './home-buy-api'
import type { HomeRotation, HomeSpot } from './home-buy-rules'

/*
 * Buy mode's shared state. The room screen says whether it is available (your own home, inside),
 * the HUD's Buy tab turns it on, and the panel and the 3D ghost read what is being placed.
 */

export type BuyUi = {
  /** Your own home, inside: the nav's Buy tab opens Buy mode instead of the town shop. */
  available: boolean
  active: boolean
  /** The catalogue item being placed (or the owned piece being moved). */
  item: HomeItem | null
  spot: HomeSpot | null
  /** Owned piece being moved (hidden while its ghost shows). */
  movingId: string | null
  /** Owned piece tapped for Move / Sell. */
  pickedId: string | null
  /** Quarter-turn steps of the camera ("Turn room"). */
  turn: number
}

const IDLE: BuyUi = { available: false, active: false, item: null, spot: null, movingId: null, pickedId: null, turn: 0 }

let ui = IDLE
const listeners = new Set<() => void>()

function set(next: Partial<BuyUi>) {
  ui = { ...ui, ...next }
  listeners.forEach((fn) => fn())
}

export const buyUi = () => ui

export const setBuyAvailable = (available: boolean) => {
  if (ui.available === available) return
  set(available ? { available } : { ...IDLE })
}
export const enterBuyMode = () => ui.available && set({ active: true })
export const exitBuyMode = () => set({ active: false, item: null, spot: null, movingId: null, pickedId: null, turn: 0 })
export const startPlacing = (item: HomeItem, spot: HomeSpot, movingId: string | null = null) =>
  set({ item, spot, movingId, pickedId: null })
export const stopPlacing = () => set({ item: null, spot: null, movingId: null })
export const setBuySpot = (spot: HomeSpot) => set({ spot })
export const turnBuyItem = () => {
  if (!ui.spot || !ui.item || ui.item.wall) return
  set({ spot: { ...ui.spot, rot: (((ui.spot.rot + 90) % 360) as HomeRotation) } })
}
export const pickPlaced = (id: string | null) => {
  set({ pickedId: id })
}
export const turnBuyCamera = () => set({ turn: (ui.turn + 1) % 3 })

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

export function useBuyUi(): BuyUi {
  return useSyncExternalStore(subscribe, buyUi, () => IDLE)
}
