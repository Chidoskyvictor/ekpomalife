/*
 * Older once-per-login flag. The card on screen now is LaunchInvite, once per device
 * (localStorage ekpoma-hub-live-v1). Login and signup still clear this session flag; that does
 * not bring the card back.
 */
const KEY = 'ekpoma-launch-invite'
const SHOWN = 'shown'

function store(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

/** Due unless it was already shown this login. Storage blocked → show (at most once per load). */
export function launchInviteDue(): boolean {
  try {
    return store()?.getItem(KEY) !== SHOWN
  } catch {
    return true
  }
}

export function markLaunchInviteShown(): void {
  try {
    store()?.setItem(KEY, SHOWN)
  } catch {
    /* ignore */
  }
}

/** Called on login and signup so the next landing gets the invite. */
export function resetLaunchInvite(): void {
  try {
    store()?.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
