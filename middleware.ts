import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { canonicalRedirect } from '@/lib/seo/canonical-redirect'

/**
 * Canonical URL: plain http:// and www. → 301 to https://ekpomalife.app (same path and query).
 * Cloudflare's "Always Use HTTPS" should also be on, so static files (skipped by the matcher) upgrade too.
 */
export function middleware(request: NextRequest) {
  const to = canonicalRedirect(new URL(request.url), request.headers)
  return to ? NextResponse.redirect(to, 301) : NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|glb|woff2?)$).*)',
  ],
}
