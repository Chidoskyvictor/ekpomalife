import { apiUrl } from '@/lib/game/api'
import { clearSession, rememberProfile, setSession } from '@/lib/game/accounts'
import type { AuthUser, SetupStep } from './post-auth-redirect'

export type AuthMeOk = {
  ok: true
  account: { name: string; username: string }
  setupComplete: boolean
  setupStep: SetupStep
}

export type AuthMeFail = { ok: false; error: string }

const FETCH_MS = 8000

/** fetch without AbortSignal — jsdom's signal breaks MSW/Node fetch interceptors. */
async function fetchMe(): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      fetch(`${apiUrl()}/auth/me`, { credentials: 'include' }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), FETCH_MS)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Probe the server session. Returns null user when 401 / unreachable. */
export async function fetchAuthMe(): Promise<AuthUser> {
  try {
    const response = await fetchMe()
    if (response.status === 401) {
      clearSession()
      return null
    }
    const data = (await response.json()) as AuthMeOk | AuthMeFail
    if (!response.ok || !data.ok) return null
    rememberProfile(data.account)
    setSession(data.account.username)
    return {
      setupComplete: Boolean(data.setupComplete),
      setupStep: data.setupStep ?? null,
    }
  } catch {
    return null
  }
}
