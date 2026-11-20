'use client'

import { useSyncExternalStore } from 'react'
import { apiGet, apiPost } from '@/lib/api/client'

/**
 * Nearby voice state, shared by the always-mounted host (which holds the LiveKit room) and the pill
 * on the place sheet (which can re-render or remount freely without dropping the call).
 * Being in a place connects you to nobody: nothing is requested from the server until join().
 */
export type Seat = { url: string; token: string; place: string; home?: string }
/** Someone on the voice: id is the user id, color/emoji from their profile when the server sent them */
export type VoiceFace = { id: string; name: string; color?: string; emoji?: string | null }
export type HouseMode = 'open' | 'friends' | 'private'
type State = {
  seat: Seat | null
  busy: boolean
  available: boolean
  /** Live here before you join (from the server) */
  count: number
  people: VoiceFace[]
  allowed: boolean
  reason: string | null
  mode: HouseMode | null
  isOwner: boolean
  /** Everyone connected once you're in (from LiveKit), you included */
  members: VoiceFace[]
  micOn: boolean
  /** Others in the room once you're in */
  others: number
  talking: string | null
  /** Place sheets showing the pill right now */
  shown: number
}

let state: State = {
  seat: null,
  busy: false,
  available: true,
  count: 0,
  people: [],
  allowed: true,
  reason: null,
  mode: null,
  isOwner: false,
  members: [],
  micOn: false,
  others: 0,
  talking: null,
  shown: 0,
}
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
  report(patch: Pick<Partial<State>, 'micOn' | 'others' | 'talking' | 'members'>) {
    const sameMembers = !patch.members || (patch.members.length === state.members.length && patch.members.every((m, i) => m.id === state.members[i]?.id))
    if (patch.micOn === state.micOn && patch.others === state.others && patch.talking === state.talking && sameMembers) return
    set(patch)
  },
  setToggle(fn: (() => Promise<void>) | null) {
    toggleImpl = fn
  },
  async refreshCount(home?: string) {
    if (state.seat) return
    const res = await apiGet<{
      ok: true
      available: boolean
      count: number
      allowed: boolean
      reason?: string
      mode: HouseMode | null
      isOwner?: boolean
      people: { userId: string; username: string; color: string; emoji: string | null }[]
    }>(`/nearby/voice${home ? `?home=${encodeURIComponent(home)}` : ''}`)
    if (res.ok)
      set({
        available: res.available,
        count: res.count,
        allowed: res.allowed,
        reason: res.reason ?? null,
        mode: res.mode,
        isOwner: Boolean(res.isOwner),
        people: res.people.map((p) => ({ id: p.userId, name: p.username, color: p.color, emoji: p.emoji })),
      })
  },
  /** Explicit join only: the server hands out a token on this call and nowhere else. */
  async join(onError: (text: string) => void, home?: string) {
    if (state.seat || state.busy) return
    set({ busy: true })
    const res = await apiPost<{ ok: true; url: string; token: string; place: string }>('/nearby/voice', home ? { home } : {})
    if (res.ok) set({ busy: false, seat: { url: res.url, token: res.token, place: res.place, home } })
    else {
      set({ busy: false })
      onError(res.error ?? 'Couldn’t join the voice here.')
    }
  },
  async toggleMic() {
    if (state.seat && toggleImpl) await toggleImpl()
  },
  leave() {
    set({ seat: null, micOn: false, others: 0, talking: null, members: [] })
  },
  /** A place sheet's pill appeared / went away; no sheet for a moment = you left the place. */
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
