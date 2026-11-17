'use client'

import { useSyncExternalStore } from 'react'
import { apiGet, apiPost } from '@/lib/api/client'

/**
 * Nearby voice state, shared by the always-mounted host (which holds the LiveKit room) and the mic
 * button on the place sheet (which can re-render or remount freely without dropping the call).
 */
export type Seat = { url: string; token: string; place: string }
type State = {
  seat: Seat | null
  busy: boolean
  available: boolean
  /** On the mic here before you join (from the server) */
  count: number
  micOn: boolean
  /** Others in the room once you're in */
  others: number
  talking: string | null
  /** Place sheets showing the mic right now */
  shown: number
}

let state: State = { seat: null, busy: false, available: true, count: 0, micOn: false, others: 0, talking: null, shown: 0 }
const listeners = new Set<() => void>()
let toggleImpl: (() => Promise<void>) | null = null
let leaveTimer: number | null = null

function set(patch: Partial<State>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export const nearbyVoice = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  report(patch: Pick<Partial<State>, 'micOn' | 'others' | 'talking'>) {
    if (patch.micOn === state.micOn && patch.others === state.others && patch.talking === state.talking) return
    set(patch)
  },
  setToggle(fn: (() => Promise<void>) | null) {
    toggleImpl = fn
  },
  async refreshCount() {
    if (state.seat) return
    const res = await apiGet<{ ok: true; available: boolean; count: number }>('/nearby/voice')
    if (res.ok) set({ available: res.available, count: res.count })
  },
  async join(onError: (text: string) => void) {
    if (state.seat || state.busy) return
    set({ busy: true })
    const res = await apiPost<{ ok: true; url: string; token: string; place: string }>('/nearby/voice', {})
    if (res.ok) set({ busy: false, seat: { url: res.url, token: res.token, place: res.place } })
    else {
      set({ busy: false })
      onError(res.error ?? 'Couldn’t join the voice here.')
    }
  },
  async tap(onError: (text: string) => void) {
    if (!state.seat) return nearbyVoice.join(onError)
    if (toggleImpl) await toggleImpl()
  },
  leave() {
    set({ seat: null, micOn: false, others: 0, talking: null })
  },
  /** A place sheet's mic appeared / went away; no sheet for a moment = you left the place. */
  shownChange(delta: 1 | -1) {
    set({ shown: Math.max(0, state.shown + delta) })
    if (leaveTimer) window.clearTimeout(leaveTimer)
    leaveTimer = null
    if (state.shown === 0 && state.seat) {
      leaveTimer = window.setTimeout(() => {
        if (state.shown === 0) nearbyVoice.leave()
      }, 2000)
    }
  },
}

export function useNearbyVoice() {
  return useSyncExternalStore(nearbyVoice.subscribe, nearbyVoice.get, nearbyVoice.get)
}
