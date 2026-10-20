'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { TextShimmer } from '@/components/arc/text-shimmer/text-shimmer'
import { AuthGateProvider } from '@/lib/auth/auth-gate-context'
import { fetchAuthMe } from '@/lib/auth/fetch-auth-me'
import {
  getPostAuthRoute,
  resolveGate,
  type AuthGateMode,
  type AuthUser,
} from '@/lib/auth/post-auth-redirect'
import { rememberProfile, setSession } from '@/lib/game/accounts'
import styles from '@/components/game-loader.module.css'

/**
 * Route guard: never flash home HUD until /auth/me decides the route.
 * Once allowed, keep children visible while re-checking on pathname changes
 * (avoids unmounting the 3D preview mid-setup).
 */
export function AuthGate({ mode, children }: { mode: AuthGateMode; children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)
  const [me, setMe] = useState<AuthUser | null>(null)

  useEffect(() => {
    let cancelled = false
    setReady(false)
    void (async () => {
      const session = await fetchAuthMe()
      if (cancelled) return

      const dest = resolveGate(mode, pathname, session)
      if (dest && dest !== pathname) {
        router.replace(dest)
        return
      }
      setMe(session)
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [mode, pathname, router])

  if (!ready) {
    return (
      <div className={styles.loading} data-theme="light" aria-busy="true" aria-live="polite">
        <img src="/logo.png" alt="Ekpoma Life logo" className={styles.crest} width={88} height={88} />
        <h1 className={styles.mark}>
          <TextShimmer>Ekpoma Life</TextShimmer>
        </h1>
      </div>
    )
  }

  return <AuthGateProvider me={me}>{children}</AuthGateProvider>
}

/** After login/signup: persist username then hard-nav via getPostAuthRoute. */
export async function redirectAfterAuth(account: { name: string; username: string }) {
  rememberProfile(account)
  setSession(account.username)
  const me = await fetchAuthMe()
  window.location.assign(getPostAuthRoute(me))
}
