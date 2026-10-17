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

const FETCH_MS = 10000

function failMessage(step: string, status: number, body: string) {
  if (status === 401) {
    return `${step}: not logged in (401). Your session cookie is missing — open /login on this same phone/browser, then come back.`
  }
  // Next /api rewrite returns these when API_PROXY_TARGET is down or unreachable.
  if (status === 502 || status === 503 || status === 504) {
    return `${step}: Bad Gateway (${status}). The Next server cannot reach the backend (API_PROXY_TARGET). Start the API on that host/port, then Try again — you do not need to re-do Look.`
  }
  if (status === 0) return `${step}: cannot reach API at ${apiUrl()}. Is the backend up?`
  const cleaned = body.replace(/^Bad Gateway$/i, 'backend unreachable via /api proxy')
  if (cleaned) return `${step} (${status}): ${cleaned}`
  return `${step} failed (${status}).`
}

async function apiFetch(path: string, init?: RequestInit) {
  // Promise.race timeout — avoid AbortSignal class mismatches on some mobile WebViews.
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      fetch(`${apiUrl()}${path}`, {
        ...init,
        credentials: 'include',
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { name: 'AbortError' })), FETCH_MS)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function readJson<T>(response: Response, step: string): Promise<T | Fail> {
  let raw = ''
  try {
    raw = await response.text()
  } catch {
    return { ok: false, error: failMessage(step, response.status, 'empty response') }
  }

  let data: T | Fail | null = null
  try {
    data = raw ? (JSON.parse(raw) as T | Fail) : null
  } catch {
    const snippet = raw.slice(0, 120).replace(/\s+/g, ' ')
    return {
      ok: false,
      error: failMessage(step, response.status, snippet || 'non-JSON response'),
    }
  }

  if (!response.ok || (typeof data === 'object' && data && 'ok' in data && data.ok === false)) {
    const fail = (data ?? {}) as Fail
    return {
      ok: false,
      error: failMessage(step, response.status, fail.error || raw.slice(0, 120) || 'request failed'),
      step: fail.step,
    }
  }
  return data as T
}

function networkFail(step: string, err: unknown): Fail {
  const name = err instanceof Error ? err.name : ''
  const msg = err instanceof Error ? err.message : String(err)
  if (name === 'AbortError') {
    return { ok: false, error: `${step}: timed out talking to ${apiUrl()}. Backend slow or down.` }
  }
  return { ok: false, error: `${step}: network error (${msg}). API ${apiUrl()}` }
}

export async function loadCharacter(): Promise<CharacterOk | Fail> {
  try {
    const response = await apiFetch('/character')
    return await readJson<CharacterOk>(response, 'Load character')
  } catch (err) {
    return networkFail('Load character', err)
  }
}

export async function saveCharacterLook(appearance: Appearance): Promise<CharacterOk | Fail> {
  try {
    const response = await apiFetch('/character/look', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appearance }),
    })
    return await readJson<CharacterOk>(response, 'Save look')
  } catch (err) {
    return networkFail('Save look', err)
  }
}

export async function saveCharacterTraits(traits: TraitId[]): Promise<CharacterOk | Fail> {
  try {
    const response = await apiFetch('/character/traits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ traits }),
    })
    return await readJson<CharacterOk>(response, 'Save traits')
  } catch (err) {
    return networkFail('Save traits', err)
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
    return await readJson<CharacterOk>(response, 'Save dream')
  } catch (err) {
    return networkFail('Save dream', err)
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
    return await readJson<StartingMoneyResult>(response, 'Starting money')
  } catch (err) {
    return networkFail('Starting money', err)
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
    return await readJson<DreamCheckResult>(response, 'Dream check')
  } catch (err) {
    return networkFail('Dream check', err)
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
    return await readJson<CharacterOk>(response, 'Save lodging')
  } catch (err) {
    return networkFail('Save lodging', err)
  }
}
