import { getSession } from '@/lib/game/accounts'
import type { AuthUser } from './post-auth-redirect'

const STORAGE_KEY = 'ekpoma-auth-me-v1'

let loaded = false
let cached: AuthUser = null

function readStored(): AuthUser | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const username = getSession()
    if (!username || username === 'guest') return undefined
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { username: string; user: AuthUser }
    if (parsed.username !== username) return undefined
    return parsed.user
  } catch {
    return undefined
  }
}

function writeStored(username: string, user: AuthUser) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ username, user }))
  } catch {
    /* ignore quota */
  }
}

function clearStored() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** Last /auth/me result this tab session (undefined until first fetch completes). */
export function peekAuthMeSession(): AuthUser | undefined {
  if (loaded) return cached
  const stored = readStored()
  if (stored !== undefined) {
    loaded = true
    cached = stored
    return stored
  }
  return undefined
}

export function readAuthMeSession(): AuthUser {
  return cached
}

export function writeAuthMeSession(user: AuthUser) {
  loaded = true
  cached = user
  const username = getSession()
  if (username && user) writeStored(username, user)
  if (!user) clearStored()
}

export function invalidateAuthMeSession() {
  loaded = false
  cached = null
  clearStored()
}
