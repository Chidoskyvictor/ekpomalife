'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { apiGet, apiPost } from '@/lib/api/client'

export type StreakView = {
  streak: number
  best: number
  cycleDay: number
  checkedInToday: boolean
  nextReward: number
  rewards: number[]
}
export type CheckinResult = StreakView & { granted: number; firstToday: boolean; cash: number | null; version: number | null }

export type StoryView = {
  seq: number
  eventId: string
  emoji: string
  title: string
  text: string
  place: string
  choices: { label: string; hint: string }[]
}
export type StoryChoiceResult = { outcome: string; effects: Record<string, number>; cash: number | null; version: number | null }

// One shared streak for the HUD pill and the missions sheet
let streak: StreakView | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export async function refreshStreak(): Promise<void> {
  const res = await apiGet<{ ok: true; streak: StreakView }>('/streak')
  if (res.ok) {
    streak = res.streak
    emit()
  }
}

/** Check in (once per Lagos day; the server ignores repeats). */
export async function checkInToday(): Promise<CheckinResult | null> {
  const res = await apiPost<{ ok: true; checkin: CheckinResult }>('/streak/checkin', {})
  if (!res.ok) return null
  streak = res.checkin
  emit()
  return res.checkin
}

export async function fetchNextStory(): Promise<StoryView | null> {
  const res = await apiGet<{ ok: true; story: StoryView | null }>('/stories/next')
  return res.ok ? res.story : null
}

export async function chooseStory(seq: number, choice: number): Promise<{ ok: true; result: StoryChoiceResult } | { ok: false; error: string }> {
  const res = await apiPost<{ ok: true; result: StoryChoiceResult }>('/stories/choose', { seq, choice })
  return res.ok ? { ok: true, result: res.result } : { ok: false, error: res.error ?? 'Could not save your choice.' }
}

export function useStreak(enabled = true) {
  const view = useSyncExternalStore(subscribe, () => streak, () => null)
  useEffect(() => {
    if (enabled && !streak) void refreshStreak()
  }, [enabled])
  return enabled ? view : null
}

/** Ordinary day marker so the check-in card is tried once per browser day (the server is still the judge). */
export function checkinTriedToday(): boolean {
  try {
    const key = `ekpoma-checkin-${new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })}`
    if (window.localStorage.getItem(key)) return true
    window.localStorage.setItem(key, '1')
    return false
  } catch {
    return false
  }
}
