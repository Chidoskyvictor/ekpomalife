'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { TextShimmer } from '@/components/arc/text-shimmer/text-shimmer'
import { AuthGateProvider } from '@/lib/auth/auth-gate-context'
import { peekAuthMeSession } from '@/lib/auth/auth-me-cache'
import { fetchAuthMe } from '@/lib/auth/fetch-auth-me'
import {
  getPostAuthRoute,
  resolveGate,
  type AuthGateMode,
  type AuthUser,
} from '@/lib/auth/post-auth-redirect'
import { assignNavigation, pathsEqual, replaceNavigation } from '@/lib/navigation/safe-nav'
import { getSession, rememberProfile, setSession } from '@/lib/game/accounts'
import styles from '@/components/game-loader.module.css'

/**
 * Route guard: never flash home HUD until /auth/me decides the route.
 * Public auth pages render immediately and probe /auth/me in the background.
 */
export function AuthGate({ mode, children }: { mode: AuthGateMode; children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const instantPublic = mode === 'public'
  // Home/setup gates must SSR the same shell as the first client paint (sessionStorage cache is client-only).
  const [ready, setReady] = useState(() => instantPublic)
  const [me, setMe] = useState<AuthUser | null>(() =>
    instantPublic ? (peekAuthMeSession() ?? null) : null,
  )

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const localUsername = getSession()
        const hasLocalSession = Boolean(localUsername && localUsername !== 'guest')
        const session = await fetchAuthMe({
          useSessionCache: instantPublic || peekAuthMeSession() !== undefined,
          force: hasLocalSession && mode === 'home',
        })
        if (cancelled) return

        const dest = resolveGate(mode, pathname, session)
        if (dest && !pathsEqual(dest, pathname)) {
          replaceNavigation(router, dest, pathname)
          return
        }
        setMe(session)
      } finally {
        if (!cancelled && !instantPublic) setReady(true)
      }
    })()

    return () => {
      cancelled = true
    }
    // `useRouter()` is not stable in dev — omit it or AuthGate re-probes /auth/me every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router.replace is stable enough to call
  }, [instantPublic, mode, pathname])

  // Public auth pages must SSR the same shell as the client (no loading gate → no hydration remount loop).
  if (instantPublic) {
    return <AuthGateProvider me={me}>{children}</AuthGateProvider>
  }

  if (!ready) {
    return <GateSkeleton />
  }

  return <AuthGateProvider me={me}>{children}</AuthGateProvider>
}

/** Branded skeleton in the shape of the game screen (top bar, map, bottom card) while /auth/me decides. */
function GateSkeleton() {
  return (
    <div className={styles.loading} data-theme="light" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading Ekpoma Life…</span>
      <div className={styles.skelTop} aria-hidden="true">
        {/* Logo sits on its own, never inside a box */}
        <img src="/logo.png" alt="" width={36} height={36} className={styles.skelLogo} />
        <span className={`${styles.skelBar} ${styles.skelGrow}`} />
        <span className={`${styles.skelBar} ${styles.skelPill}`} />
      </div>
      <h1 className={styles.mark} aria-hidden="true">
        <TextShimmer>Ekpoma Life</TextShimmer>
      </h1>
      <div className={styles.skelCard} aria-hidden="true">
        <span className={`${styles.skelBar} ${styles.skelLineShort}`} />
        <span className={`${styles.skelBar} ${styles.skelButton}`} />
      </div>
    </div>
  )
}

/** After login/signup: persist username then hard-nav via getPostAuthRoute. */
export async function redirectAfterAuth(account: { name: string; username: string }) {
  rememberProfile(account)
  setSession(account.username)
  const me = await fetchAuthMe({ force: true })
  assignNavigation(getPostAuthRoute(me))
}
