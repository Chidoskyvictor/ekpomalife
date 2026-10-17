import type { Metadata, Viewport } from 'next'
import { Fredoka, Geist, Inter, Plus_Jakarta_Sans } from 'next/font/google'
import { NoHScrollGuard } from '@/components/dev/no-hscroll-guard'
import '@/components/arc/foundation.css'
import './globals.css'

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

export const metadata: Metadata = {
  title: 'Ekpoma Life — live your AAU story',
  description:
    'A browser life-simulation game set in Ekpoma, Edo State. Study at Ambrose Alli University, hustle, eat at the bukka and build your reputation.',
  generator: 'v0.app',
  icons: {
    icon: [
      { url: '/logo.png', type: 'image/png' },
      { url: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#3d9ad6',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${geist.variable} ${inter.variable} ${fredoka.variable} ${jakarta.variable}`}>
      <body className="font-sans antialiased">
        {process.env.NODE_ENV === 'development' ? <NoHScrollGuard /> : null}
        {children}
      </body>
    </html>
  )
}
