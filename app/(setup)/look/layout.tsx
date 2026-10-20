import type { ReactNode } from 'react'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata = pageMetadata({
  title: 'Create your look — Ekpoma Life',
  description: 'Character creation step: pick your look before traits and dreams.',
  path: '/look',
  index: false,
})

export default function LookLayout({ children }: { children: ReactNode }) {
  return children
}
