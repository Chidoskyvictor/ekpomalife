import { apiGet, apiPost } from '@/lib/api/client'

/* Time trials: the server opens a run when you set off and checks the time you hand in (see backend/src/game/race-trials.ts). */

export type BoardRow = { rank: number; handle: string; car: string; ms: number; you: boolean }
export type Board = { courseId: string; board: BoardRow[]; mine: { ms: number; rank: number } | null }

export const loadBoard = (courseId: string) => apiGet<{ ok: true } & Board>(`/cars/trials/${encodeURIComponent(courseId)}`)

export const openTrial = (courseId: string) => apiPost<{ ok: true; trialId: string; car: string }>('/cars/trials/start', { courseId })

export const closeTrial = (trialId: string, ms: number, splits: number[]) =>
  apiPost<{ ok: true; ms: number; personalBest: boolean; previousBest: number | null; board: BoardRow[]; mine: { ms: number; rank: number } | null }>('/cars/trials/finish', {
    trialId,
    ms: Math.round(ms),
    splits: splits.map((s) => Math.round(s)),
  })
