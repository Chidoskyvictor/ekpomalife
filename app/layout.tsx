import { PlayShell } from '@/components/play-shell'
import type { Viewport } from 'next'
import localFont from 'next/font/local'
import { NoHScrollGuard } from '@/components/dev/no-hscroll-guard'
import { RateLimitToast } from '@/components/ui/rate-limit-toast'
import { TripLayer } from '@/components/travel/trip-layer'
import { MusicPlayer } from '@/components/audio/music-player'
import '@/components/arc/foundation.css'
import './globals.css'
import { rootMetadata } from '@/lib/seo/metadata'

export const metadata = rootMetadata

// Fonts are bundled in app/fonts (Latin, variable weight) instead of downloaded from Google on
// every build: a dropped connection used to fail the whole build.
const geist = localFont({
  src: './fonts/geist-latin.woff2',
  variable: '--font-geist',
  weight: '100 900',
  display: 'swap',
})

const inter = localFont({
  src: './fonts/inter-latin.woff2',
  variable: '--font-inter',
  weight: '100 900',
  display: 'swap',
})

const fredoka = localFont({
  src: './fonts/fredoka-latin.woff2',
  variable: '--font-fredoka',
  weight: '300 700',
  display: 'swap',
})

const jakarta = localFont({
  src: './fonts/jakarta-latin.woff2',
  variable: '--font-jakarta',
  weight: '200 800',
  display: 'swap',
})

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${geist.variable} ${inter.variable} ${fredoka.variable} ${jakarta.variable}`}
    >
      {/* Extensions (Grammarly…) add attributes to <body> before React hydrates */}
      <body className="font-sans antialiased" style={{ colorScheme: 'light' }} suppressHydrationWarning>
        {process.env.NODE_ENV === 'development' ? <NoHScrollGuard /> : null}
        <PlayShell>{children}</PlayShell>
        <TripLayer />
        <MusicPlayer />
        <RateLimitToast />
      </body>
    </html>
  )
}
