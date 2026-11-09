'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { apiGet, apiPost } from '@/lib/api/client'
import type { CoachView, TipId } from './coach-rules'

/*
 * Server-side progress of the first-time tour and the one-time tips (so nothing repeats on another device),
 * plus a tiny signal bus: game code says "the player rode a keke" and the tour moves on.
 */

let coach: CoachView | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

type Res = { ok: true; coach: CoachView }

const take = (res: { ok: boolean } | Res) => {
  if (res.ok && 'coach' in res) {
    coach = res.coach
    emit()
  }
}

export async function refreshCoach(): Promise<void> {
  take(await apiGet<Res>('/coach'))
}

export function useCoach(enabled = true): CoachView | null {
  const view = useSyncExternalStore(subscribe, () => coach, () => null)
  useEffect(() => {
    if (enabled && !coach) void refreshCoach()
  }, [enabled])
  return enabled ? view : null
}

/** Remember locally right away (the screen never waits on the network), then tell the server. */
export async function finishTourStep(step: number): Promise<void> {
  if (coach) {
    const next = Math.max(coach.step, step + 1)
    coach = { ...coach, step: next }
    emit()
  }
  take(await apiPost<Res>('/coach/tour', { op: 'done', step }))
}

/** Skip (or finish) the whole tour: it is done for good. */
export async function skipTour(): Promise<void> {
  if (coach) {
    coach = { ...coach, tour: false }
    emit()
  }
  take(await apiPost<Res>('/coach/tour', { op: 'skip' }))
}

/** Settings → Replay tutorial */
export async function replayTour(): Promise<boolean> {
  const res = await apiPost<Res>('/coach/tour', { op: 'replay' })
  take(res)
  return res.ok
}

export async function markTipSeen(tip: TipId): Promise<void> {
  if (coach && !coach.tipsSeen.includes(tip)) {
    coach = { ...coach, tipsSeen: [...coach.tipsSeen, tip] }
    emit()
  }
  take(await apiPost<Res>('/coach/tip', { tip }))
}

/* —— Signals: things the player did, that the tour listens for —— */

export type CoachSignal = 'ride' | 'phone-open' | 'missions-open'
const signalListeners = new Set<(signal: CoachSignal) => void>()

export function coachSignal(signal: CoachSignal) {
  signalListeners.forEach((fn) => fn(signal))
}

export function onCoachSignal(fn: (signal: CoachSignal) => void) {
  signalListeners.add(fn)
  return () => {
    signalListeners.delete(fn)
  }
}

/* —— Tips: any screen can ask for one; the first one asked is shown, each only once —— */

let tipNow: TipId | null = null
const tipListeners = new Set<() => void>()
const emitTip = () => tipListeners.forEach((fn) => fn())

/** Ask for a one-time tip. Nothing happens if it was already seen, or the tour is running. */
export function requestTip(id: TipId) {
  if (!coach || coach.tour || coach.tipsSeen.includes(id) || tipNow) return
  tipNow = id
  emitTip()
}

export function dismissTip() {
  const id = tipNow
  if (!id) return
  tipNow = null
  emitTip()
  void markTipSeen(id)
}

export function useTip(): TipId | null {
  return useSyncExternalStore(
    (fn) => {
      tipListeners.add(fn)
      return () => tipListeners.delete(fn)
    },
    () => tipNow,
    () => null,
  )
}
