import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

/** Apex canonical host — www → 301 (also set a matching Cloudflare redirect rule in production). */
export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  if (host.toLowerCase().startsWith('www.')) {
    const url = request.nextUrl.clone()
    url.hostname = host.slice(4)
    url.protocol = 'https:'
    return NextResponse.redirect(url, 301)
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|glb|woff2?)$).*)',
  ],
}
