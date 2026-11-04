import type { Metadata } from 'next'
import type { ReactNode } from 'react'

/** Admin pages: never indexed or linked. Access is checked on the server (ADMIN_USERNAMES). */
export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children
}
