/** Fired on window when the API answers 429 — RateLimitToast shows the soft message. */
export const RATE_LIMIT_EVENT = 'el:rate-limited'
export const RATE_LIMIT_MESSAGE = 'Slow down a bit…'

const DEFAULT_WAIT_S = 2
const MAX_WAIT_S = 60

/** Retry-After as seconds or an HTTP date; capped so a bad header cannot stall the UI. */
export function retryAfterMs(response: Response): number {
  const raw = response.headers.get('Retry-After')
  let seconds = DEFAULT_WAIT_S
  if (raw) {
    const parsed = Number.parseInt(raw, 10)
    if (Number.isFinite(parsed) && parsed >= 0) seconds = parsed
    else {
      const date = Date.parse(raw)
      if (Number.isFinite(date)) seconds = Math.max(0, Math.ceil((date - Date.now()) / 1000))
    }
  }
  return Math.min(seconds, MAX_WAIT_S) * 1000
}

export function notifyRateLimited() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(RATE_LIMIT_EVENT))
}

/**
 * On 429: soft toast, wait for Retry-After, try once more. The second response is returned as-is.
 * Never reloads or redirects.
 */
export async function withRateLimitRetry(run: () => Promise<Response>): Promise<Response> {
  const first = await run()
  if (first.status !== 429) return first
  notifyRateLimited()
  await new Promise((resolve) => setTimeout(resolve, retryAfterMs(first)))
  return run()
}
