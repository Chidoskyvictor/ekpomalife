'use client'

import { useSyncExternalStore } from 'react'
import { apiGet, apiPost } from '@/lib/api/client'
import type { ApiFail } from '@/lib/api/errors'
import type { ServerGameState } from './game-api'

/*
 * Drag races (point to point, with an optional stake). One small store holds the race you are in
 * and the open ones you could join; the driving HUD polls it while you are at the wheel. The
 * server holds the stakes and decides who won.
 */

export type Race = {
  id: string
  dest: { id: string; label: string; x: number; z: number }
  stake: number
  status: 'open' | 'running' | 'done' | 'cancelled'
  start: { x: number; z: number; h: number }
  /** Server clock (ms) when the lights go green. */
  startsAt: number | null
  host: string
  racers: { name: string; slot: number; you: boolean; host: boolean }[]
  winner: string | null
  youWon: boolean
  prize: number | null
  mine: boolean
  youHost: boolean
}

type Races = { mine: Race | null; open: Race[]; /** server clock minus this phone's clock (ms) */ skew: number }
type OkRaces = { ok: true; now: number; mine: Race | null; open: Race[] }
type OkWrite = OkRaces & { message: string; state: ServerGameState }

let races: Races = { mine: null, open: [], skew: 0 }
const listeners = new Set<() => void>()
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function take(res: OkRaces) {
  races = { mine: res.mine, open: res.open, skew: res.now - Date.now() }
  listeners.forEach((fn) => fn())
}

/** The races as last heard, for code that is not a component. */
export const racesNow = () => races

export function useRaces() {
  return useSyncExternalStore(subscribe, () => races, () => races)
}

let loading = false
export async function loadRaces() {
  if (loading) return
  loading = true
  const res = await apiGet<OkRaces>('/cars/races')
  loading = false
  if (res.ok) take(res)
}

async function write(path: string, body: Record<string, unknown>, key?: string): Promise<OkWrite | ApiFail> {
  const res = await apiPost<OkWrite>(path, body, key ? { 'Idempotency-Key': key } : undefined)
  if (res.ok) take(res)
  return res
}

const round = (n: number) => Math.round(n * 100) / 100

/** Host a race from where your car is to a place. One key per tap; reuse it when retrying. */
export const hostRace = (input: { destId: string; stake: number; x: number; z: number; h: number; destX: number; destZ: number }, key: string) =>
  write('/cars/races', { ...input, x: round(input.x), z: round(input.z), h: round(input.h), destX: round(input.destX), destZ: round(input.destZ) }, key)
export const joinRace = (raceId: string, key: string) => write('/cars/races/join', { raceId }, key)
export const startRace = (raceId: string) => write('/cars/races/start', { raceId })
export const finishRace = (raceId: string, x: number, z: number) => write('/cars/races/finish', { raceId, x: round(x), z: round(z) })
export const leaveRace = (raceId: string) => write('/cars/races/leave', { raceId })
