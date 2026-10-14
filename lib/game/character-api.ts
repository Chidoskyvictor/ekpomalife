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
    const response = await fetch(`${apiUrl()}/character`, { credentials: 'include' })
    return await readJson<CharacterOk>(response)
  } catch {
    return { ok: false, error: 'Cannot reach the server. Is the backend running?' }
  }
}

export async function saveCharacterLook(appearance: Appearance): Promise<CharacterOk | Fail> {
  try {
    const response = await fetch(`${apiUrl()}/character/look`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ appearance }),
    })
    return await readJson<CharacterOk>(response)
  } catch {
    return { ok: false, error: 'Cannot reach the server. Is the backend running?' }
  }
}

export async function saveCharacterTraits(traits: TraitId[]): Promise<CharacterOk | Fail> {
  try {
    const response = await fetch(`${apiUrl()}/character/traits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ traits }),
    })
    return await readJson<CharacterOk>(response)
  } catch {
    return { ok: false, error: 'Cannot reach the server. Is the backend running?' }
  }
}

export async function saveCharacterDream(dreamId: DreamId): Promise<CharacterOk | Fail> {
  try {
    const response = await fetch(`${apiUrl()}/character/dream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ dreamId }),
    })
    return await readJson<CharacterOk>(response)
  } catch {
    return { ok: false, error: 'Cannot reach the server. Is the backend running?' }
  }
}

export async function checkDreamProgress(snapshot: DreamSnapshot): Promise<DreamCheckResult | Fail> {
  try {
    const response = await fetch(`${apiUrl()}/character/dream/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ snapshot }),
    })
    return await readJson<DreamCheckResult>(response)
  } catch {
    return { ok: false, error: 'Cannot reach the server. Is the backend running?' }
  }
}
