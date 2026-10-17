import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Home — Ekpoma Life',
}

export default function LiveLayout({ children }: { children: React.ReactNode }) {
  return children
}
