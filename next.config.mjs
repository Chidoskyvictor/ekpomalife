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
}

export default nextConfig

// OpenNext Cloudflare — enables bindings during `next dev` when the package is installed.
import('@opennextjs/cloudflare')
  .then((mod) => mod.initOpenNextCloudflareForDev())
  .catch(() => {
    // Optional until first Cloudflare build.
  })
