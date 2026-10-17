/**
 * Browser traffic goes same-origin through Next `/api` → backend rewrite.
 * That keeps session cookies working on phone LAN and in production (no cross-origin cookie pain).
 *
 * Set API_PROXY_TARGET (or NEXT_PUBLIC_API_URL) to the real backend for the rewrite.
 * Only set NEXT_PUBLIC_API_DIRECT_URL if you intentionally call the API host from the browser.
 */
export function apiUrl() {
  const direct = process.env.NEXT_PUBLIC_API_DIRECT_URL?.replace(/\/$/, '')
  if (direct) return direct

  if (typeof window !== 'undefined') return '/api'

  return (
    process.env.API_PROXY_TARGET ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://127.0.0.1:4000'
  ).replace(/\/$/, '')
}
