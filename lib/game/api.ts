/**
 * Browser traffic goes same-origin through Next `/api/*` → `app/api/[...path]` proxy → backend.
 * That keeps `el_session` on the frontend origin (phone LAN + production).
 *
 * Set API_PROXY_TARGET (or NEXT_PUBLIC_API_URL) for the server-side proxy target.
 * Do not set NEXT_PUBLIC_API_DIRECT_URL on phone LAN — it bypasses the proxy and breaks cookies.
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
