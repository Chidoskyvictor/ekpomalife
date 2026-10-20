import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/seo/site'

const PUBLIC_PATHS = ['/', '/signup', '/login', '/terms', '/privacy'] as const

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  return PUBLIC_PATHS.map((path) => ({
    url: absoluteUrl(path === '/' ? '/' : path),
    lastModified,
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : 0.6,
  }))
}
