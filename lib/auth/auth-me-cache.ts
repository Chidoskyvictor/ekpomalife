import type { AuthUser } from './post-auth-redirect'

let loaded = false
let cached: AuthUser = null

/** Last /auth/me result this tab session (undefined until first fetch completes). */
export function peekAuthMeSession(): AuthUser | undefined {
  return loaded ? cached : undefined
}

export function readAuthMeSession(): AuthUser {
  return cached
}

export function writeAuthMeSession(user: AuthUser) {
  loaded = true
  cached = user
}

export function invalidateAuthMeSession() {
  loaded = false
  cached = null
}
