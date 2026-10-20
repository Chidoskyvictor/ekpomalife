import type { ReactNode } from 'react'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata = pageMetadata({
  title: 'Choose traits — Ekpoma Life',
  description: 'Pick two personality traits that shape your campus story.',
  path: '/traits',
  index: false,
})

export default function TraitsLayout({ children }: { children: ReactNode }) {
  return children
}
