'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { hasHorizontalOverflow } from '@/lib/responsive/assert-no-hscroll'

/**
 * Dev-only: logs (and optionally throws) when the document is wider than the viewport.
 * Mounted from the root layout when NODE_ENV === 'development'.
 */
export function NoHScrollGuard() {
  const pathname = usePathname()

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return

    const check = () => {
      const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
      const innerWidth = window.innerWidth
      if (!hasHorizontalOverflow(scrollWidth, innerWidth)) return
      const message = `[no-hscroll] ${pathname} overflow: scrollWidth=${scrollWidth} > innerWidth=${innerWidth}`
      console.error(message)
      if (process.env.NEXT_PUBLIC_STRICT_HSCROLL === '1') {
        throw new Error(message)
      }
    }

    const id = window.setTimeout(check, 500)
    window.addEventListener('resize', check)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('resize', check)
    }
  }, [pathname])

  return null
}
