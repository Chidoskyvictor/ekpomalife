'use client'

import { RefreshCw, Sparkles } from 'lucide-react'
import { applyUpdate, useUpdateAvailable } from '@/lib/game/update-check'
import styles from './update-banner.module.css'

/** "New update" + Refresh on the phone's home screen, shown only once a newer build is deployed. */
export function UpdateBanner() {
  const newer = useUpdateAvailable()
  if (!newer) return null
  return (
    <section className={`${styles.updateCard} ${styles.updateCardNew}`} aria-live="polite">
      <span className={styles.updateIcon} aria-hidden="true">
        <Sparkles size={16} aria-hidden="true" />
      </span>
      <div className={styles.updateText}>
        <strong>New update</strong>
      </div>
      <button type="button" className={styles.updateBtn} onClick={applyUpdate}>
        <RefreshCw size={14} aria-hidden="true" />
        Refresh
      </button>
    </section>
  )
}
