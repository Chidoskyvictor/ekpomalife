import { NextResponse } from 'next/server'

/**
 * Dev helper: confirms the Next → backend rewrite target is reachable.
 * Open /api/health-proxy on the phone; if this fails, starting-money will 502.
 */
export async function GET() {
  const target = (
    process.env.API_PROXY_TARGET ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://127.0.0.1:4000'
  ).replace(/\/$/, '')

  try {
    const response = await fetch(`${target}/health`, { cache: 'no-store' })
    const text = await response.text()
    return NextResponse.json({
      ok: response.ok,
      proxyTarget: target,
      upstreamStatus: response.status,
      upstreamBody: text.slice(0, 200),
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        proxyTarget: target,
        error: error instanceof Error ? error.message : String(error),
        hint: 'Start the Fastify API on that host:port, or fix API_PROXY_TARGET in .env, then restart next dev.',
      },
      { status: 502 },
    )
  }
}
