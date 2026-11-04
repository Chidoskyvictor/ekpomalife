export const CANONICAL_HOST = 'ekpomalife.app'

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$|\.localhost(:\d+)?$|\.test(:\d+)?$/i

/** The scheme the visitor used. Cloudflare passes it in cf-visitor / x-forwarded-proto; the URL is the fallback. */
export function requestScheme(url: URL, headers: Headers): 'http' | 'https' {
  const visitor = headers.get('cf-visitor')
  if (visitor) {
    try {
      const scheme = (JSON.parse(visitor) as { scheme?: string }).scheme
      if (scheme === 'http' || scheme === 'https') return scheme
    } catch {
      /* malformed: fall through */
    }
  }
  const proto = headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
  if (proto === 'http' || proto === 'https') return proto
  return url.protocol === 'http:' ? 'http' : 'https'
}

/**
 * Where to 301 this request, or null to serve it. Plain HTTP and www. both go to
 * https://ekpomalife.app with the same path and query. Local dev hosts are left alone.
 */
export function canonicalRedirect(url: URL, headers: Headers): string | null {
  const host = (headers.get('host') ?? url.host).toLowerCase()
  if (LOCAL.test(host)) return null
  const www = host.startsWith('www.')
  const http = requestScheme(url, headers) === 'http'
  if (!www && !http) return null
  const bare = (www ? host.slice(4) : host).replace(/:\d+$/, '')
  return `https://${bare}${url.pathname}${url.search}`
}
