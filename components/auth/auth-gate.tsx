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
 * Route guard: never flash home HUD until /auth/me decides the route.
 * Once allowed, keep children visible while re-checking on pathname changes
 * (avoids unmounting the 3D preview mid-setup).
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

  // Never return null — a blank frame under body overflow:hidden reads as a dark flash
  // when the landing/auth gate hands off to home.
  if (!allowed) {
    return (
      <div className={styles.loading} data-theme="light" aria-busy="true" aria-live="polite">
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
