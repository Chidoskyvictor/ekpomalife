import { apiUrl } from './api'
import type { GameActionId, Place } from './places'
import type { NeedId } from './needs'

export type ServerNeeds = Record<NeedId, number>

export type ServerGameState = {
  ok: true
  cash: number
  needs: ServerNeeds
  locationId: string
  gameTime: number
  day: number
  period: string
  timeLabel: string
  mood: { emoji: string; label: string; tone: 'good' | 'warn' | 'bad'; score: number }
  dreamProgress: { current: number; target: number; label: string; complete: boolean } | null
  upNext: { actionId: GameActionId; placeId: string; need: NeedId; label: string }
  version: number
  places: Place[]
  message?: string
}

type Fail = { ok: false; error: string; conflict?: boolean }

const FETCH_MS = 8000

async function apiFetch(path: string, init?: RequestInit) {
  // Prefer Promise.race over AbortSignal — jsdom's AbortSignal is rejected by MSW/Node fetch.
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      fetch(`${apiUrl()}${path}`, {
        ...init,
        credentials: 'include',
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), FETCH_MS)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function readJson<T>(response: Response): Promise<T | Fail> {
  const data = (await response.json()) as T | Fail
  if (!response.ok || (typeof data === 'object' && data && 'ok' in data && data.ok === false)) {
    const fail = data as Fail
    return { ok: false, error: fail.error || 'Request failed.', conflict: fail.conflict }
  }
  return data as T
}

export async function fetchGameState(): Promise<ServerGameState | Fail> {
  try {
    const response = await apiFetch('/game/state')
    return await readJson<ServerGameState>(response)
  } catch {
    return { ok: false, error: 'Cannot reach the server. Is the backend running?' }
  }
}

export async function postGameAction(input: {
  actionId: GameActionId
  targetPlaceId?: string | null
  version: number
}): Promise<ServerGameState | Fail> {
  try {
    const response = await apiFetch('/game/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return await readJson<ServerGameState>(response)
  } catch {
    return { ok: false, error: 'Cannot reach the server. Is the backend running?' }
  }
}
