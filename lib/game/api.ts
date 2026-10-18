/**
 * API base URL for browser + server fetches.
 *
 * - Production: browser calls https://api.ekpomalife.app directly
 *   (cookies use Domain=.ekpomalife.app). The Next /api proxy is not used.
 * - Local / LAN: browser uses same-origin `/api` → app/api/[...path] proxy
 *   so el_session sticks to the frontend host.
 *
 * Set NEXT_PUBLIC_API_URL in every environment.
 * Set API_PROXY_TARGET only for local/LAN (dev proxy target).
 * Do not set NEXT_PUBLIC_API_DIRECT_URL unless you intentionally bypass the proxy.
 */
function isLocalHost(url: string) {
  return /localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\./i.test(url)
}

export function apiUrl() {
  const direct = process.env.NEXT_PUBLIC_API_DIRECT_URL?.replace(/\/$/, '')
  if (direct) return direct

  const publicApi = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '')

  if (typeof window !== 'undefined') {
    // Absolute https API that is not a LAN/dev host → call it directly.
    if (publicApi.startsWith('https://') && !isLocalHost(publicApi)) {
      return publicApi
    }
    return '/api'
  }

  return (
    process.env.API_PROXY_TARGET ||
    publicApi ||
    'http://127.0.0.1:4000'
  ).replace(/\/$/, '')
}
