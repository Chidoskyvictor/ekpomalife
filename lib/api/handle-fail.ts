import { fetchAuthMe } from '@/lib/auth/fetch-auth-me'
import { getPostAuthRoute } from '@/lib/auth/post-auth-redirect'
import { clearSession } from '@/lib/game/accounts'
import { pathsEqual } from '@/lib/navigation/safe-nav'
import { asApiErrorCode, friendlyApiMessage, type ApiFail } from './errors'

type Handlers = {
  /** Soft toast for soft failures. */
  toast: (text: string, ok?: boolean) => void
  /** Silent refetch after VERSION_CONFLICT. */
  refreshServer?: () => Promise<void> | void
}

/**
 * Shared economy / game failure routing.
 * Returns true if the caller should stop (redirect or conflict handled).
 */
export async function handleApiFail(fail: ApiFail, handlers: Handlers): Promise<boolean> {
  const code = fail.code ?? asApiErrorCode(fail.error)

  if (fail.network || /can't reach|cannot reach|network wahala|failed to fetch|timeout/i.test(fail.error)) {
    handlers.toast("Can't reach the server, retrying…", false)
    return true
  }

  // 429: RateLimitToast already showed "Slow down a bit…" — no second toast, never reload or redirect.
  if (fail.status === 429) return true

  if (code === 'UNAUTHORIZED' || fail.status === 401) {
    if (typeof window !== 'undefined') {
      void fetchAuthMe({ force: true }).then((me) => {
        if (me) return
        clearSession()
        // Signed out on home: guest map renders already. Never reload '/' (that looped forever).
        const path = window.location.pathname
        if (path === '/' || path === '' || path === '/login') return
        window.location.assign('/login')
      })
    }
    return true
  }

  if (code === 'SETUP_INCOMPLETE') {
    if (typeof window !== 'undefined') {
      const me = await fetchAuthMe()
      const dest = getPostAuthRoute(me)
      if (!pathsEqual(dest, window.location.pathname)) window.location.assign(dest)
    }
    return true
  }

  if (code === 'VERSION_CONFLICT' || fail.conflict) {
    await handlers.refreshServer?.()
    return true
  }

  if (code === 'INSUFFICIENT_FUNDS' || code === 'NO_ENERGY' || code === 'NOT_ELIGIBLE') {
    handlers.toast(friendlyApiMessage({ ...fail, code }), false)
    return true
  }

  handlers.toast(friendlyApiMessage(fail), false)
  return true
}
