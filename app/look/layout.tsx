import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Look — Ekpoma Life',
}

export default function LookLayout({ children }: { children: React.ReactNode }) {
  return children
}
