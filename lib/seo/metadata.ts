import type { Metadata } from 'next'
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, SITE_NAME, SITE_URL, absoluteUrl } from './site'

const OG_IMAGES = [
  { url: '/og-map.jpg', width: 1200, height: 630, alt: 'Ekpoma Life campus map around Ambrose Alli University' },
]

const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION

export const rootMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-light-32x32.png', sizes: '32x32', type: 'image/png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', sizes: '32x32', type: 'image/png', media: '(prefers-color-scheme: dark)' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website',
    locale: 'en_NG',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: OG_IMAGES,
  },
  twitter: {
    card: 'summary_large_image',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: OG_IMAGES,
  },
  ...(googleVerification ? { verification: { google: googleVerification } } : {}),
}

export function pageMetadata({
  title,
  description = DEFAULT_DESCRIPTION,
  path,
  index = true,
}: {
  title: string
  description?: string
  path: string
  index?: boolean
}): Metadata {
  const url = absoluteUrl(path)
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      locale: 'en_NG',
      siteName: SITE_NAME,
      title,
      description,
      url,
      images: OG_IMAGES,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: OG_IMAGES,
    },
    robots: index ? { index: true, follow: true } : { index: false, follow: false },
  }
}

