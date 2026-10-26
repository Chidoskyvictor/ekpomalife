/*
 * Shared Space links: https://<site>/?space=<id>[&code=ABC123]. Opening one lands the player
 * in the game, opens the phone's Spaces app and goes straight to that room. The link survives
 * a login (kept in sessionStorage) because guests are sent through login to use the phone.
 */

import { SITE_URL } from '@/lib/seo/site'

export const OPEN_SPACES_EVENT = 'ekpoma:open-spaces'

const STORE_KEY = 'ekpoma-space-link'
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const CODE_RE = /^[A-HJ-KM-NP-Z2-9]{6}$/

export type OpenSpace = { spaceId?: string; code?: string }

let pending: OpenSpace | null = null

/**
 * Link to a Space. The host (who knows the join code) gets the short form /s/ABC123, which also
 * opens invite-only rooms; everyone else gets /?space=<id>.
 */
export function spaceLink(spaceId: string, code?: string | null) {
  const origin = shareOrigin()
  if (code && CODE_RE.test(code)) return `${origin}/s/${code}`
  return `${origin}/?space=${encodeURIComponent(spaceId)}`
}

/** Shared links use the real site (ekpomalife.app); while developing on this machine they point back here. */
function shareOrigin() {
  const { hostname, origin } = window.location
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost') ? origin : SITE_URL
}

/** Read ?space= from the address bar into storage and clean the URL. Safe to call many times. */
export function captureSpaceLink() {
  try {
    const url = new URL(window.location.href)
    const id = url.searchParams.get('space')
    const code = (url.searchParams.get('join') ?? url.searchParams.get('code'))?.toUpperCase()
    if (!id && !code) return
    const open: OpenSpace = {
      ...(id && ID_RE.test(id) ? { spaceId: id } : {}),
      ...(code && CODE_RE.test(code) ? { code } : {}),
    }
    if (open.spaceId || open.code) sessionStorage.setItem(STORE_KEY, JSON.stringify(open))
    for (const key of ['space', 'join', 'code']) url.searchParams.delete(key)
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  } catch {
    /* storage or history blocked: the link just won't auto-open */
  }
}

/** A captured link, once (clears it). */
export function takeStoredSpaceLink(): OpenSpace | null {
  try {
    const raw = sessionStorage.getItem(STORE_KEY)
    if (!raw) return null
    sessionStorage.removeItem(STORE_KEY)
    const open = JSON.parse(raw) as OpenSpace
    return (open.spaceId && ID_RE.test(open.spaceId)) || (open.code && CODE_RE.test(open.code)) ? open : null
  } catch {
    return null
  }
}

export function requestOpenSpace(open: OpenSpace) {
  pending = open
  window.dispatchEvent(new CustomEvent(OPEN_SPACES_EVENT))
}

/** Is a link waiting? (The phone may mount after the event fired.) */
export const hasPendingSpace = () => pending !== null

/** What the Spaces app should open when it appears, once. */
export function takePendingSpace(): OpenSpace | null {
  const open = pending
  pending = null
  return open
}
