import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/** @type {import('next').NextConfig} */
const nextConfig = {
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
  webpack: (config) => {
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
