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
