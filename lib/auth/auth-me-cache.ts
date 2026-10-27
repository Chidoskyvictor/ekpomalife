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

const SETUP_ORDER = ['look', 'traits', 'dream'] as const

/**
 * A setup step was saved: move the cached /auth/me answer on to the next one. Without this the next
 * page's gate still reads "you are on look" from the cache and sends you straight back.
 */
export function markSetupStepDone(step: (typeof SETUP_ORDER)[number]) {
  const current = peekAuthMeSession()
  if (!current || current.setupComplete) return
  const at = current.setupStep ? SETUP_ORDER.indexOf(current.setupStep) : SETUP_ORDER.length
  const done = SETUP_ORDER.indexOf(step)
  if (at > done) return
  writeAuthMeSession({ setupComplete: false, setupStep: SETUP_ORDER[done + 1] ?? null })
}

export function invalidateAuthMeSession() {
  loaded = false
  cached = null
  clearStored()
}
