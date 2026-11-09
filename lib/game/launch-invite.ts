/*
 * The Innovation Hub launch invite shows once per login. The flag lives in sessionStorage:
 * login and signup clear it (so the next landing shows the card), and showing it marks it shown
 * (so a reload or Cancel doesn't bring it back until the next login).
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
