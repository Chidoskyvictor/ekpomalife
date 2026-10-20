import type { ReactNode } from 'react'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata = pageMetadata({
  title: 'Pick your dream — Ekpoma Life',
  description: 'Choose the long-term dream your Ekpoma Life character will chase on campus.',
  path: '/dream',
  index: false,
})

export default function DreamLayout({ children }: { children: ReactNode }) {
  return children
}
