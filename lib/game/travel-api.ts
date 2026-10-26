import { apiGet, apiPost } from '@/lib/api/client'
import type { ApiFail } from '@/lib/api/errors'
import type { ServerGameState } from './game-api'
import { takeRide } from './phone-api'

/** How you get there: trek is free; keke and okada are charged by the server (POST /ride). */
export type TripMode = 'trek' | 'keke' | 'okada'

export type Uv = { u: number; v: number }

export type TravelOption = {
  id: string
  label: string
  type: string
  hops: number
  uv: Uv
  near: boolean
  home: boolean
  minutes: Record<TripMode, number>
  fares: { keke: number; okada: number }
}

export type TravelOptions = {
  ok: true
  from: string
  fromLabel: string
  fromUv: Uv
  homePlaceId: string
  places: TravelOption[]
}

export function fetchTravelOptions(): Promise<TravelOptions | ApiFail> {
  return apiGet<TravelOptions>('/travel/options')
}

type Moved = { ok: true; message: string }

/** Move on the server. Hops 0 (already on that block) needs no call. */
export async function travel(option: TravelOption, mode: TripMode, idempotencyKey: string): Promise<Moved | ApiFail> {
  if (option.hops === 0) return { ok: true, message: `Back at ${option.label}` }
  if (mode === 'trek') {
    return apiPost<Moved & { state: ServerGameState }>('/travel/trek', { to: option.id })
  }
  return takeRide(option.id, mode, idempotencyKey)
}

/** Fare for a mode ("Free" for trekking or when you're already there). */
export function fareOf(option: TravelOption, mode: TripMode) {
  return mode === 'trek' || option.hops === 0 ? 0 : option.fares[mode]
}
