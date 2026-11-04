'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

/** Shows its children on the homepage only. Lives outside the sign-in gate so they're in the server HTML. */
export function HomeOnly({ children }: { children: ReactNode }) {
  return usePathname() === '/' ? <>{children}</> : null
}
