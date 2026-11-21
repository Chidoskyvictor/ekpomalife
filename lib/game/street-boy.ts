'use client'

import { useSyncExternalStore } from 'react'
import { apiPost } from '@/lib/api/client'
import type { ApiFail } from '@/lib/api/errors'
import type { ServerGameState } from './game-api'

/** Shared between the 3D street boy and the Tip button/sheet in the HUD. */
export type BoyReaction = { id: number; big: boolean } | null
type Snap = { near: boolean; open: boolean; reaction: BoyReaction }

let snap: Snap = { near: false, open: false, reaction: null }
const listeners = new Set<() => void>()
const set = (next: Partial<Snap>) => {
  snap = { ...snap, ...next }
  listeners.forEach((fn) => fn())
}
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const server: Snap = { near: false, open: false, reaction: null }

export const useStreetBoy = () => useSyncExternalStore(subscribe, () => snap, () => server)
export const setBoyNear = (near: boolean) => {
  if (snap.near !== near) set(near ? { near } : { near, open: false })
}
export const openTipSheet = () => set({ open: true })
export const closeTipSheet = () => set({ open: false })
export const reactToTip = (big: boolean) => set({ reaction: { id: Date.now(), big } })
export const readBoyReaction = () => snap.reaction

export const TIP_AMOUNTS = [200, 500, 1000] as const
export const BIG_TIP = 1000

type TipOk = { ok: true; state: ServerGameState; big: boolean; amount: number }
export const tipBoy = (amount: number): Promise<TipOk | ApiFail> => apiPost<TipOk>('/street/tip', { amount })
