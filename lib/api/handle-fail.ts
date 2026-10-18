import { fetchAuthMe } from '@/lib/auth/fetch-auth-me'
import { getPostAuthRoute } from '@/lib/auth/post-auth-redirect'
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

  if (code === 'UNAUTHORIZED' || fail.status === 401) {
    if (typeof window !== 'undefined') window.location.assign('/login')
    return true
  }

  if (code === 'SETUP_INCOMPLETE') {
    if (typeof window !== 'undefined') {
      const me = await fetchAuthMe()
      window.location.assign(getPostAuthRoute(me))
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
