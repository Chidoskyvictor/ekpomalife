'use client'

import { useRouter } from 'next/navigation'
import styles from './room.module.css'

/** "You're at @name's place" pill with a Leave button, shown while visiting someone's room. */
export function VisitBanner({ username, displayName }: { username: string; displayName: string | null }) {
  const router = useRouter()
  return (
    <div className={styles.visitBanner} role="status">
      <span className={styles.visitIcon} aria-hidden="true">
        🏠
      </span>
      <span className={styles.visitText}>
        <strong>@{username}&rsquo;s place</strong>
        <span>{displayName ? `Visiting ${displayName}` : 'Visiting'}</span>
      </span>
      <button type="button" className={styles.visitLeave} onClick={() => router.push('/room')}>
        Leave
      </button>
    </div>
  )
}
