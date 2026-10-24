'use client'

import { useEffect, useState } from 'react'
import { RATE_LIMIT_EVENT, RATE_LIMIT_MESSAGE } from '@/lib/api/rate-limit'
import styles from './rate-limit-toast.module.css'

const SHOW_MS = 3000

/** App-wide soft notice for API 429s (lib/api/rate-limit). */
export function RateLimitToast() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const show = () => {
      setVisible(true)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setVisible(false), SHOW_MS)
    }
    window.addEventListener(RATE_LIMIT_EVENT, show)
    return () => {
      window.removeEventListener(RATE_LIMIT_EVENT, show)
      if (timer) clearTimeout(timer)
    }
  }, [])

  return (
    <div className={styles.root} aria-live="polite">
      {visible ? (
        <p className={styles.toast} role="status">
          {RATE_LIMIT_MESSAGE}
        </p>
      ) : null}
    </div>
  )
}
