import { apiUrl } from './api'
import type { DreamId, DreamSnapshot } from './dreams'
import type { Appearance } from './look'
import type { CharacterRecord, OnboardingStep } from './onboarding'
import type { TraitId } from './traits'

export type DreamCheckResult = {
  ok: true
  progress: { current: number; target: number; label: string; complete: boolean }
  completed: boolean
  newlyCompleted: boolean
  reward: { cash?: number; reputation?: number; badge: string } | null
  badges: string[]
}

type Fail = { ok: false; error: string; step?: OnboardingStep }

export type CharacterOk = { ok: true } & CharacterRecord

const FETCH_MS = 6000

async function apiFetch(path: string, init?: RequestInit) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_MS)
  try {
    return await fetch(`${apiUrl()}${path}`, {
      ...init,
      credentials: 'include',
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

async function readJson<T>(response: Response): Promise<T | Fail> {
  const data = (await response.json()) as T | Fail
  if (!response.ok || (typeof data === 'object' && data && 'ok' in data && data.ok === false)) {
    const fail = data as Fail
    return { ok: false, error: fail.error || 'Request failed.', step: fail.step }
  }
  return data as T
}

export async function loadCharacter(): Promise<CharacterOk | Fail> {
  try {
    const response = await apiFetch('/character')
    return await readJson<CharacterOk>(response)
  } catch {
    return { ok: false, error: 'Cannot reach the server. Is the backend running?' }
  }
}

export async function saveCharacterLook(appearance: Appearance): Promise<CharacterOk | Fail> {
  try {
    const response = await apiFetch('/character/look', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appearance }),
    })
    return await readJson<CharacterOk>(response)
  } catch {
    return { ok: false, error: 'Cannot reach the server. Is the backend running?' }
  }
}

export async function saveCharacterTraits(traits: TraitId[]): Promise<CharacterOk | Fail> {
  try {
    const response = await apiFetch('/character/traits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ traits }),
    })
    return await readJson<CharacterOk>(response)
  } catch {
    return { ok: false, error: 'Cannot reach the server. Is the backend running?' }
  }
}

/** Save look, traits, and dream in one pass. Call from the last creation page, not from Next. */
export async function commitCharacter(input: {
  appearance: Appearance
  traits: TraitId[]
  dreamId: DreamId
}): Promise<CharacterOk | Fail> {
  const look = await saveCharacterLook(input.appearance)
  if (!look.ok) return look
  const traits = await saveCharacterTraits(input.traits)
  if (!traits.ok) return traits
  return saveCharacterDream(input.dreamId)
}

export async function saveCharacterDream(dreamId: DreamId): Promise<CharacterOk | Fail> {
  try {
    const response = await apiFetch('/character/dream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dreamId }),
    })
    return await readJson<CharacterOk>(response)
  } catch {
    return { ok: false, error: 'Cannot reach the server. Is the backend running?' }
  }
}

export type StartingMoneyResult = {
  ok: true
  amount: number
  tier: string
  range: { min: number; max: number }
  message: string
}

export async function rollStartingMoney(): Promise<StartingMoneyResult | Fail> {
  try {
    const response = await apiFetch('/character/starting-money', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    return await readJson<StartingMoneyResult>(response)
  } catch {
    return { ok: false, error: 'Cannot reach the server. Is the backend running?' }
  }
}

/** Server computes progress from its own snapshot + cash — no client numbers. */
export async function checkDreamProgress(_snapshot?: DreamSnapshot): Promise<DreamCheckResult | Fail> {
  try {
    const response = await apiFetch('/character/dream/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    return await readJson<DreamCheckResult>(response)
  } catch {
    return { ok: false, error: 'Cannot reach the server. Is the backend running?' }
  }
}

export async function saveCharacterSetup(input: {
  characterType: string
  lodgingId: string
  courseId?: string | null
}): Promise<CharacterOk | Fail> {
  try {
    const response = await apiFetch('/character/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return await readJson<CharacterOk>(response)
  } catch {
    return { ok: false, error: 'Cannot reach the server. Is the backend running?' }
  }
}
