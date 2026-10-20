import type { ReactNode } from 'react'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata = pageMetadata({
  title: 'Where you live — Ekpoma Life',
  description: 'Finish setup: lodging, course, and starting money before you play.',
  path: '/live',
  index: false,
})

export default function LiveLayout({ children }: { children: ReactNode }) {
  return children
}
