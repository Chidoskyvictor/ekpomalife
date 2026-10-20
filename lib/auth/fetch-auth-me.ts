import { apiUrl } from '@/lib/game/api'
import { clearSession, rememberProfile, setSession } from '@/lib/game/accounts'
import {
  invalidateAuthMeSession,
  peekAuthMeSession,
  writeAuthMeSession,
} from '@/lib/auth/auth-me-cache'
import type { AuthUser, SetupStep } from './post-auth-redirect'

export type AuthMeOk = {
  ok: true
  account: { name: string; username: string }
  setupComplete: boolean
  setupStep: SetupStep
}

export type AuthMeFail = { ok: false; error: string }

const FETCH_MS = 8000

let inflight: Promise<AuthUser> | null = null

export type FetchAuthMeOptions = {
  /** Reuse the last result for this browser tab (public auth pages). */
  useSessionCache?: boolean
  /** Always hit the network (after login, etc.). */
  force?: boolean
}

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

async function fetchAuthMeOnce(): Promise<AuthUser> {
  try {
    const response = await fetchMe()
    if (response.status === 401) {
      clearSession()
      invalidateAuthMeSession()
      return null
    }
    const data = (await response.json()) as AuthMeOk | AuthMeFail
    if (!response.ok || !data.ok) {
      writeAuthMeSession(null)
      return null
    }
    rememberProfile(data.account)
    setSession(data.account.username)
    const user: AuthUser = {
      setupComplete: Boolean(data.setupComplete),
      setupStep: data.setupStep ?? null,
    }
    writeAuthMeSession(user)
    return user
  } catch {
    const cached = peekAuthMeSession()
    if (cached !== undefined) return cached
    writeAuthMeSession(null)
    return null
  }
}

/** Probe the server session. Returns null user when 401 / unreachable. */
export async function fetchAuthMe(options?: FetchAuthMeOptions): Promise<AuthUser> {
  if (options?.useSessionCache && !options.force) {
    const cached = peekAuthMeSession()
    if (cached !== undefined) return cached
  }

  if (!options?.force && inflight) return inflight

  const run = fetchAuthMeOnce()
  inflight = run
  try {
    return await run
  } finally {
    if (inflight === run) inflight = null
  }
}
