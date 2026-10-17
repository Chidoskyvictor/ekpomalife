import { pathForStep, type OnboardingStep } from '@/lib/game/onboarding'

export type SetupStep = 'look' | 'traits' | 'dream' | null

/** Session user shape from GET /auth/me (or a local stand-in for tests). */
export type AuthUser = {
  setupComplete: boolean
  /** First unfinished look/traits/dream step; null if those are done but play setup may remain. */
  setupStep: SetupStep
} | null

export type AuthGateMode = 'home' | 'setup' | 'public'

/**
 * Single redirect helper for every post-auth entry point.
 * - not logged in → /login
 * - setup incomplete → Look / Traits / Dream (or /live when character is done but no game_state)
 * - setup complete → home /
 */
export function getPostAuthRoute(user: AuthUser): string {
  if (!user) return '/login'
  if (user.setupComplete) return '/'
  if (user.setupStep === 'look' || user.setupStep === 'traits' || user.setupStep === 'dream') {
    return pathForStep(user.setupStep as OnboardingStep)
  }
  // look + traits + dream saved, but no game_state yet → finish lodging / starting money
  return '/live'
}

export function isSetupPath(pathname: string) {
  return pathname === '/look' || pathname === '/traits' || pathname === '/dream' || pathname === '/live'
}

export function isHomePath(pathname: string) {
  return pathname === '/' || pathname === ''
}

/**
 * Route-guard destination (or null to stay). Used by AuthGate and tests.
 * - home: incomplete → setup; logged out → login
 * - setup: complete → home; logged out → login; never skip ahead of server step
 * - public: already logged in → getPostAuthRoute
 */
export function resolveGate(mode: AuthGateMode, pathname: string, me: AuthUser): string | null {
  if (mode === 'home') {
    if (!me) return '/login'
    if (!me.setupComplete) return getPostAuthRoute(me)
    return null
  }

  if (mode === 'setup') {
    if (!me) return '/login'
    if (me.setupComplete) return '/'
    const expected = getPostAuthRoute(me)
    if (!isSetupPath(pathname)) return expected
    const order = ['/look', '/traits', '/dream', '/live']
    const here = order.indexOf(pathname)
    const want = order.indexOf(expected)
    if (here >= 0 && want >= 0 && here < want) return expected
    return null
  }

  if (me) return getPostAuthRoute(me)
  return null
}
