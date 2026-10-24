import { apiUrl } from '@/lib/game/api'
import { clearSession, getSession, rememberProfile, setSession } from '@/lib/game/accounts'
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
/** Minimum gap between network probes (stops reload storms from hammering /auth/me). */
const MIN_FETCH_GAP_MS = 3000

let inflight: Promise<AuthUser> | null = null
let lastNetworkFetchAt = 0
let rateLimitedUntil = 0

export type FetchAuthMeOptions = {
  /** Reuse the last result for this browser tab (public auth pages). */
  useSessionCache?: boolean
  /** Always hit the network (after login, etc.). */
  force?: boolean
}

function cachedOrNull(): AuthUser {
  const cached = peekAuthMeSession()
  return cached !== undefined ? cached : null
}

function parseRetryAfterSeconds(response: Response) {
  const raw = response.headers.get('Retry-After')
  if (!raw) return 12
  const seconds = Number.parseInt(raw, 10)
  if (Number.isFinite(seconds) && seconds > 0) return seconds
  const date = Date.parse(raw)
  if (Number.isFinite(date)) {
    return Math.max(1, Math.ceil((date - Date.now()) / 1000))
  }
  return 12
}

function markRateLimited(seconds: number) {
  rateLimitedUntil = Date.now() + seconds * 1000
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[auth/me] rate limited — backing off ${seconds}s (no page reload)`)
  }
}

function shouldSkipNetwork(force?: boolean) {
  const now = Date.now()
  if (now < rateLimitedUntil) return true
  if (!force && now - lastNetworkFetchAt < MIN_FETCH_GAP_MS) return true
  return false
}

/** fetch without AbortSignal — jsdom's signal breaks MSW/Node fetch interceptors. */
async function fetchMe(): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    lastNetworkFetchAt = Date.now()
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

async function fetchAuthMeOnce(options?: FetchAuthMeOptions): Promise<AuthUser> {
  if (shouldSkipNetwork(options?.force)) {
    return cachedOrNull()
  }

  try {
    const response = await fetchMe()
    if (response.status === 401) {
      clearSession()
      invalidateAuthMeSession()
      return null
    }
    if (response.status === 429) {
      markRateLimited(parseRetryAfterSeconds(response))
      return cachedOrNull()
    }
    // Next /api proxy returns 502 when API_PROXY_TARGET (backend) is down — guest map, no reload.
    if (response.status === 502 || response.status === 503 || response.status === 504) {
      return cachedOrNull()
    }
    const data = (await response.json()) as AuthMeOk | AuthMeFail
    if (!response.ok || !data.ok) {
      if (response.status >= 500) return cachedOrNull()
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
    return cachedOrNull()
  }
}

const BOOT_RETRY_MS = 700
const BOOT_RETRY_MAX = 4

/** Probe the server session. Returns null user when 401 / unreachable. */
export async function fetchAuthMe(options?: FetchAuthMeOptions): Promise<AuthUser> {
  if (options?.useSessionCache && !options.force) {
    const cached = peekAuthMeSession()
    if (cached !== undefined) return cached
  }

  if (shouldSkipNetwork(options?.force)) {
    return cachedOrNull()
  }

  if (!options?.force && inflight) return inflight

  const run = fetchAuthMeOnce(options)
  inflight = run
  try {
    let me = await run
    const localUser = getSession()
    if (
      !me &&
      localUser &&
      localUser !== 'guest' &&
      !options?.force &&
      process.env.NODE_ENV !== 'test'
    ) {
      for (let attempt = 0; attempt < BOOT_RETRY_MAX; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, BOOT_RETRY_MS))
        me = await fetchAuthMeOnce({ force: true })
        if (me) break
      }
    }
    return me
  } finally {
    if (inflight === run) inflight = null
  }
}

/** Vitest only — clears throttle / rate-limit memory between cases. */
export function resetAuthMeFetchStateForTests() {
  inflight = null
  lastNetworkFetchAt = 0
  rateLimitedUntil = 0
}
