import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// Production security headers. CSP is the no-nonce variant from Next's CSP guide
// (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
const apiOrigin = (process.env.NEXT_PUBLIC_API_URL || 'https://api.ekpomalife.app').replace(/\/+$/, '')
const apiWs = apiOrigin.replace(/^http/, 'ws')
const csp = [
  "default-src 'self'",
  // 'unsafe-inline': Next's inline bootstrap scripts (no nonces). 'wasm-unsafe-eval': meshopt/Draco GLB decoders.
  // blob:/data: in connect-src: GLTFLoader fetches embedded textures by blob URL. gstatic: drei's default Draco decoder. Paystack: inline checkout. Cloudflare: auto-injected analytics beacon.
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://www.gstatic.com https://*.paystack.co https://*.paystack.com https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: data:",
  `connect-src 'self' blob: data: ${apiOrigin} ${apiWs} https://*.livekit.cloud wss://*.livekit.cloud https://*.paystack.co https://*.paystack.com https://www.gstatic.com https://cloudflareinsights.com`,
  "frame-src 'self' https://*.paystack.com https://*.paystack.co",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.paystack.com",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Mic for Spaces (LiveKit); payment for Paystack's checkout frame.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), geolocation=(), microphone=(self), payment=(self "https://checkout.paystack.com"), usb=()',
  },
]

// One id per build: baked into the app and served at /version, so an open phone can tell a new
// deploy is out and offer Refresh.
const BUILD_VERSION = process.env.NEXT_PUBLIC_BUILD_VERSION || String(Date.now())

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { NEXT_PUBLIC_BUILD_VERSION: BUILD_VERSION },
  // Phone / other PCs hitting this machine by LAN IP (dev only).
  allowedDevOrigins: [
    '192.168.0.199',
    '192.168.0.200',
    '192.168.0.197',
    '127.0.0.1',
    'localhost',
  ],
  // Dev: /api/* → app/api/[...path] proxy. Prod: browser calls NEXT_PUBLIC_API_URL directly.
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    // These headers are for production CDN caching. In `next dev`, webpack
    // chunk URLs are stable, and `immutable` makes the browser keep a broken
    // PhoneShell bundle (the error overlay then shows "(stale)").
    if (process.env.NODE_ENV !== 'production') {
      // HTML/RSC only — not webpack chunks. Chrome + no-store on /_next/* caused HMR full reload loops.
      return [
        {
          source: '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|glb|woff2?)$).*)',
          headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
        },
      ]
    }
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },
  // Local source archives (vendor/) must not be traced into the Worker bundle.
  outputFileTracingExcludes: {
    '*': ['./vendor/**'],
  },
  // drei/VideoTexture optional peer — pin resolve for webpack/OpenNext.
  webpack: (config, { dev }) => {
    // Production builds: no on-disk webpack cache. Its file-hash step crashed on this machine
    // (WasmHash "reading 'length'" on a file it couldn't read), killing deploys at random.
    if (!dev) config.cache = false
    config.resolve.alias = {
      ...config.resolve.alias,
      'hls.js': require.resolve('hls.js'),
    }
    return config
  },
}

export default nextConfig

// OpenNext Cloudflare — enables bindings during `next dev` when the package is installed.
import('@opennextjs/cloudflare')
  .then((mod) => mod.initOpenNextCloudflareForDev())
  .catch(() => {
    // Optional until first Cloudflare build.
  })
