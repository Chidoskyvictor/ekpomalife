import type { Viewport } from 'next'
import { Fredoka, Geist, Inter, Plus_Jakarta_Sans } from 'next/font/google'
import { NoHScrollGuard } from '@/components/dev/no-hscroll-guard'
import '@/components/arc/foundation.css'
import './globals.css'
import { rootMetadata } from '@/lib/seo/metadata'

export const metadata = rootMetadata

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700', '800'],
})

const fredoka = Fredoka({
  subsets: ['latin'],
  variable: '--font-fredoka',
  weight: ['500', '600', '700'],
})

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  weight: ['400', '500', '600', '700', '800'],
})

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#3d9ad6',
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
      <body className="font-sans antialiased" style={{ colorScheme: 'light' }}>
        {process.env.NODE_ENV === 'development' ? <NoHScrollGuard /> : null}
        {children}
      </body>
    </html>
  )
}
