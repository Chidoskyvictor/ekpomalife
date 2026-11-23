import { apiGet, apiPost } from '@/lib/api/client'

/* Time trials: the server opens a run when you set off and checks the time you hand in (see backend/src/game/race-trials.ts). */

export type BoardRow = { rank: number; handle: string; car: string; /** "E2 T1 B0", or null for a stock car. */ upgrades: string | null; racerRank: { name: string; emoji: string }; ms: number; you: boolean }

export type Reward = { xp: number; totalXp: number; rank: { id: string; name: string; emoji: string }; rankedUp: boolean; badges: string[] }

/** Facts only the phone can see about a run: they unlock badges, never XP. */
export type RunMeta = { mode: 'trial' | 'ai'; place: number; of: number; beatFaster: number; beatAiSkill: number | null; crashed: boolean; night: boolean; comeback: boolean }

export type RacerCard = { ok: true; xp: number; wins: number; races: number; rank: { id: string; name: string; emoji: string }; next: { name: string; emoji: string; toGo: number } | null; fraction: number; badges: string[] }

/** A player's racing card (rank, record, badges): yours, or another player's by user id. */
export const loadRacer = (userId?: string) => apiGet<RacerCard>(userId ? `/cars/racer?userId=${encodeURIComponent(userId)}` : '/cars/racer')
export type Board = { courseId: string; board: BoardRow[]; mine: { ms: number; rank: number } | null }

export const loadBoard = (courseId: string) => apiGet<{ ok: true } & Board>(`/cars/trials/${encodeURIComponent(courseId)}`)

export const openTrial = (courseId: string) => apiPost<{ ok: true; trialId: string; car: string }>('/cars/trials/start', { courseId })

export const closeTrial = (trialId: string, ms: number, splits: number[], meta?: RunMeta) =>
  apiPost<{ ok: true; ms: number; personalBest: boolean; previousBest: number | null; board: BoardRow[]; mine: { ms: number; rank: number } | null; reward: Reward }>('/cars/trials/finish', {
    trialId,
    ms: Math.round(ms),
    splits: splits.map((s) => Math.round(s)),
    ...(meta ? { meta } : {}),
  })
