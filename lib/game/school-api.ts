'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { apiGet, apiPost } from '@/lib/api/client'
import type { GameActionId } from './places'
import {
  examLock,
  feesLock,
  lectureLock,
  nextStep,
  schoolNowAt,
  tutorialLock,
  type SchoolRecord,
  type SemesterResult,
} from './school-rules'

export type SchoolView = {
  record: SchoolRecord
  courseName: string | null
  fees: { acceptance: number; installment1: number; installment2: number }
  cgpa: number | null
  classOfDegree: string | null
  finalLevel: number
  locationId: string | null
  cash: number
  serverNowMs: number
}

type SchoolAction = 'acceptance' | 'installment-1' | 'installment-2' | 'full-session' | 'lecture' | 'tutorial' | 'exam'

/** Building cards that run on the school API instead of /game/action. */
export const SCHOOL_CARD_ACTIONS: Partial<Record<GameActionId, SchoolAction>> = {
  'pay-acceptance': 'acceptance',
  'pay-installment-1': 'installment-1',
  'pay-installment-2': 'installment-2',
  'pay-full-session': 'full-session',
  'attend-lecture': 'lecture',
  'evening-tutorial': 'tutorial',
  'write-exam': 'exam',
}

export const isSchoolCard = (id: string) => id in SCHOOL_CARD_ACTIONS || id === 'student-portal'

// One shared copy for the school card, the place sheet and the portal
let school: SchoolView | null = null
/** Server clock minus ours, so cooldowns and hours match the server. */
let skewMs = 0
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

function set(next: SchoolView) {
  school = next
  skewMs = next.serverNowMs - Date.now()
  emit()
}

export function refreshSchool(): Promise<void> {
  if (!loading) {
    loading = apiGet<{ ok: true; school: SchoolView }>('/school')
      .then((res) => {
        if (res.ok) set(res.school)
      })
      .finally(() => {
        loading = null
      })
  }
  return loading
}

export async function runSchoolAction(
  id: GameActionId,
): Promise<{ ok: true; message: string; result: SemesterResult | null } | { ok: false; error: string }> {
  const action = SCHOOL_CARD_ACTIONS[id]
  if (!action) return { ok: false, error: 'Unknown school action.' }
  const res = await apiPost<{ ok: true; school: SchoolView; message: string; result: SemesterResult | null }>(
    '/school/action',
    { action },
  )
  if (!res.ok) {
    void refreshSchool()
    return { ok: false, error: res.error ?? 'Could not reach the school office.' }
  }
  set(res.school)
  return { ok: true, message: res.message, result: res.result }
}

const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Your school record (loads once, refreshes on demand). `enabled: false` for guests. */
export function useSchool(enabled = true) {
  const view = useSyncExternalStore(subscribe, () => school, () => null)
  useEffect(() => {
    if (enabled && !school) void refreshSchool()
  }, [enabled])
  const now = useCallback(() => schoolNowAt(Date.now() + skewMs), [])
  return { school: enabled ? view : null, now, refresh: refreshSchool }
}

/** Why a school card is locked right now (null = can run). `placeId` is where you are. */
export function schoolCardLock(view: SchoolView | null, id: GameActionId, placeId: string, nowMs: number): string | null {
  if (id === 'student-portal') return null
  if (!view) return 'Loading your school record…'
  const r = view.record
  const now = schoolNowAt(nowMs + skewMs)
  if (!r.isStudent || !r.courseId) return 'Only students do this.'
  switch (id) {
    case 'attend-lecture':
      return lectureLock(r, placeId, now)
    case 'evening-tutorial':
      return tutorialLock(r, placeId, now)
    case 'write-exam':
      return examLock(r, placeId, now)
    case 'pay-acceptance':
      return r.acceptancePaid ? 'Acceptance fee paid ✅' : null
    case 'pay-installment-1':
      if (r.graduated) return 'Graduated 🎓'
      if (r.paid1) return `1st installment paid ✅`
      return r.acceptancePaid ? null : 'Pay your acceptance fee first.'
    case 'pay-installment-2':
      if (r.graduated) return 'Graduated 🎓'
      if (r.paid2) return '2nd installment paid ✅'
      if (!r.acceptancePaid) return 'Pay your acceptance fee first.'
      return r.paid1 ? null : 'Pay your 1st installment first.'
    case 'pay-full-session':
      if (r.graduated) return 'Graduated 🎓'
      if (r.paid1 && r.paid2) return 'This session is fully paid ✅'
      return r.acceptancePaid ? null : 'Pay your acceptance fee first.'
    default:
      return null
  }
}

/** The amount a fee card charges, for its price line. */
export function schoolCardPrice(view: SchoolView | null, id: GameActionId): number | null {
  if (!view) return null
  const { acceptance, installment1, installment2 } = view.fees
  const r = view.record
  switch (id) {
    case 'pay-acceptance':
      return acceptance
    case 'pay-installment-1':
      return installment1
    case 'pay-installment-2':
      return installment2
    case 'pay-full-session':
      return (r.paid1 ? 0 : installment1) + (r.paid2 ? 0 : installment2)
    default:
      return null
  }
}

export { feesLock, nextStep }
