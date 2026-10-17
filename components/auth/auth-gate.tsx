'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { TextShimmer } from '@/components/arc/text-shimmer/text-shimmer'
import { fetchAuthMe } from '@/lib/auth/fetch-auth-me'
import {
  getPostAuthRoute,
  resolveGate,
  type AuthGateMode,
} from '@/lib/auth/post-auth-redirect'
import { rememberProfile, setSession } from '@/lib/game/accounts'
import styles from '@/components/game-loader.module.css'

/**
 * Route guard: never flash home HUD or setup UI until /auth/me decides the route.
 * - home: incomplete → setup; logged out → login
 * - setup: complete → home; logged out → login
 * - public: already logged in → getPostAuthRoute
 */
export function AuthGate({ mode, children }: { mode: AuthGateMode; children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const me = await fetchAuthMe()
      if (cancelled) return

      const dest = resolveGate(mode, pathname, me)
      if (dest && dest !== pathname) {
        router.replace(dest)
        return
      }
      setAllowed(true)
    })()
    return () => {
      cancelled = true
    }
  }, [mode, pathname, router])

  if (!allowed) {
    return (
      <div className={styles.loading} aria-busy="true" aria-live="polite">
        <img src="/logo.png" alt="" className={styles.crest} width={88} height={88} />
        <h1 className={styles.mark}>
          <TextShimmer>Ekpoma Life</TextShimmer>
        </h1>
      </div>
    )
  }

  return children
}

/** After login/signup: persist username then hard-nav via getPostAuthRoute. */
export async function redirectAfterAuth(account: { name: string; username: string }) {
  rememberProfile(account)
  setSession(account.username)
  const me = await fetchAuthMe()
  window.location.assign(getPostAuthRoute(me))
}
