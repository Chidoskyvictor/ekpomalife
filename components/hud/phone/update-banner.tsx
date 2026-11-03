'use client'

import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import styles from './phone.module.css'

const MY_VERSION = process.env.NEXT_PUBLIC_BUILD_VERSION ?? 'dev'

/**
 * Ekpoma Life update notice on the phone's home screen: "New update" and a Refresh button. Turns
 * green when a newer version has been deployed since this page loaded.
 */
export function UpdateBanner() {
  const [newer, setNewer] = useState(false)

  useEffect(() => {
    let stop = false
    const check = async () => {
      try {
        const res = await fetch('/version', { cache: 'no-store' })
        const data = (await res.json()) as { version?: string }
        if (!stop && data.version && data.version !== MY_VERSION) setNewer(true)
      } catch {
        /* offline: try again later */
      }
    }
    void check()
    const id = window.setInterval(() => void check(), 120_000)
    return () => {
      stop = true
      window.clearInterval(id)
    }
  }, [])

  return (
    <section className={`${styles.updateCard} ${newer ? styles.updateCardNew : ''}`} aria-live="polite">
      <span className={styles.updateIcon} aria-hidden="true">
        ✨
      </span>
      <div className={styles.updateText}>
        <strong>New update</strong>
      </div>
      <button type="button" className={styles.updateBtn} onClick={() => window.location.reload()}>
        <RefreshCw size={14} aria-hidden="true" />
        Refresh
      </button>
    </section>
  )
}
