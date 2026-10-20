import type { ReactNode } from 'react'
import { pageMetadata } from '@/lib/seo/metadata'

export const metadata = pageMetadata({
  title: 'My room — Ekpoma Life',
  description: 'Your Ekpoma Life hostel room — in-game space, not for search indexing.',
  path: '/room',
  index: false,
})

export default function RoomLayout({ children }: { children: ReactNode }) {
  return children
}
