'use client'

import { useRouter } from 'next/navigation'
import styles from './room.module.css'

/** "You're at @name's place" pill with a Leave button, shown while visiting someone's room. */
export function VisitBanner({ username, displayName, place, hostHome }: { username: string; displayName: string | null; place?: string; hostHome?: boolean }) {
  const router = useRouter()
  return (
    <div className={styles.visitBanner} role="status">
      <span className={styles.visitIcon} aria-hidden="true">
        🏠
      </span>
      <span className={styles.visitText}>
        <strong>@{username}&rsquo;s place</strong>
        <span>
          {[place, hostHome === undefined ? null : hostHome ? '🟢 Home' : 'Not home', displayName ? `Visiting ${displayName}` : null].filter(Boolean).join(' · ') || 'Visiting'}
        </span>
      </span>
      <button type="button" className={styles.visitLeave} onClick={() => router.push('/room')}>
        Leave
      </button>
    </div>
  )
}
