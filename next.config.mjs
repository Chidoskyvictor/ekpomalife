/** @type {import('next').NextConfig} */
const nextConfig = {
  // Phone / other PCs hitting this machine by LAN IP (dev only).
  allowedDevOrigins: [
    '192.168.0.199',
    '192.168.0.200',
    '192.168.0.197',
    '127.0.0.1',
    'localhost',
  ], // FE LAN + backend host (200) for phone/dev access
  // /api/* is handled by app/api/[...path]/route.ts (forwards Cookie/Set-Cookie,
  // strips Domain so el_session sticks to the frontend origin — not the API IP).
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
