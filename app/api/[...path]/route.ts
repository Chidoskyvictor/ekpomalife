/**
 * Same-origin API proxy so the browser stores el_session on the frontend host
 * (e.g. http://192.168.0.199:3000), not on the backend LAN IP.
 *
 * Forwards Cookie / Set-Cookie unchanged except stripping Domain (and Secure on
 * plain HTTP) so Next/upstream cannot bind the cookie to 192.168.0.200.
 */
import { type NextRequest, NextResponse } from 'next/server'
import { sanitizeSetCookie } from '@/lib/api-proxy-cookie'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function proxyTarget() {
  return (
    process.env.API_PROXY_TARGET ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://127.0.0.1:4000'
  ).replace(/\/$/, '')
}

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
])

async function proxy(request: NextRequest, pathParts: string[]) {
  const targetBase = proxyTarget()
  const path = pathParts.map(encodeURIComponent).join('/')
  const url = `${targetBase}/${path}${request.nextUrl.search}`

  const headers = new Headers()
  request.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return
    headers.set(key, value)
  })

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer()
  }

  let upstream: Response
  try {
    upstream = await fetch(url, init)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'proxy failed'
    return NextResponse.json(
      { ok: false, error: `Cannot reach API at ${targetBase} (${message})` },
      { status: 502 },
    )
  }

  const responseHeaders = new Headers()
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (lower === 'set-cookie') return
    if (HOP_BY_HOP.has(lower)) return
    responseHeaders.set(key, value)
  })

  const rawCookies =
    typeof upstream.headers.getSetCookie === 'function'
      ? upstream.headers.getSetCookie()
      : (() => {
          const single = upstream.headers.get('set-cookie')
          return single ? [single] : []
        })()

  for (const cookie of rawCookies) {
    responseHeaders.append('set-cookie', sanitizeSetCookie(cookie, request.url))
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  })
}

type Ctx = { params: Promise<{ path: string[] }> | { path: string[] } }

async function handle(request: NextRequest, context: Ctx) {
  const params = await context.params
  const path = params.path ?? []
  return proxy(request, path)
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
export const OPTIONS = handle
export const HEAD = handle
