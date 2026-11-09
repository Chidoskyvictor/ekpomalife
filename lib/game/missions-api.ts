'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { apiGet, apiPost } from '@/lib/api/client'
import type { MissionRole } from './missions-rules'

export type MissionView = {
  id: string
  role: MissionRole
  emoji: string
  title: string
  blurb: string
  places: string[]
  seconds: number
  reward: number
  done: boolean
  auto: 'lecture' | 'bond' | 'eat' | 'ride' | 'text' | null
  hours: string | null
  risky: boolean
  progress: { now: number; goal: number } | null
  startedAt: number | null
}

export type MissionsView = {
  day: number
  missions: MissionView[]
  doneCount: number
  swapped: boolean
  bonus: number
  bonusPaid: boolean
  resetsAt: number
  locationId: string | null
  serverNowMs: number
}

// One shared copy for the HUD counter and the missions sheet
let missions: MissionsView | null = null
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

export function refreshMissions(): Promise<void> {
  if (!loading) {
    loading = apiGet<{ ok: true; missions: MissionsView }>('/missions')
      .then((res) => {
        if (res.ok) {
          missions = res.missions
          emit()
        }
      })
      .finally(() => {
        loading = null
      })
  }
  return loading
}

export async function missionAction(
  action: 'start' | 'finish' | 'swap',
  missionId: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const res = await apiPost<{ ok: true; missions: MissionsView; message: string }>('/missions/action', { action, missionId })
  if (!res.ok) {
    void refreshMissions()
    return { ok: false, error: res.error ?? 'Could not update your missions.' }
  }
  missions = res.missions
  emit()
  return { ok: true, message: res.message }
}

const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Today's missions (loads once, then every 2 minutes so auto missions tick over). */
export function useMissions(enabled = true) {
  const view = useSyncExternalStore(subscribe, () => missions, () => null)
  useEffect(() => {
    if (!enabled) return
    void refreshMissions()
    const id = window.setInterval(() => void refreshMissions(), 120_000)
    return () => window.clearInterval(id)
  }, [enabled])
  return enabled ? view : null
}

export const ROLE_TAG: Record<MissionRole, string> = {
  student: 'STUDENT',
  graduate: 'GRADUATE',
  lecturer: 'LECTURER',
  indigene: 'INDIGENE',
  general: 'GENERAL',
  tutorial: 'START HERE',
}
