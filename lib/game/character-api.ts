import { apiUrl } from './api'
import type { DreamId, DreamSnapshot } from './dreams'

export type DreamCheckResult = {
  ok: true
  progress: { current: number; target: number; label: string; complete: boolean }
  completed: boolean
  newlyCompleted: boolean
  reward: { cash?: number; reputation?: number; badge: string } | null
  badges: string[]
}

type Fail = { ok: false; error: string }

export async function saveCharacterDream(dreamId: DreamId): Promise<{ ok: true } | Fail> {
  try {
    const response = await fetch(`${apiUrl()}/character/dream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ dreamId }),
    })
    const data = (await response.json()) as { ok: true } | Fail
    if (!data.ok) return { ok: false, error: data.error || 'Could not save your dream.' }
    return { ok: true }
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
    const data = (await response.json()) as DreamCheckResult | Fail
    if (!data.ok) return { ok: false, error: data.error || 'Could not check dream progress.' }
    return data
  } catch {
    return { ok: false, error: 'Cannot reach the server. Is the backend running?' }
  }
}
