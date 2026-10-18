'use client'

import { COMING_SOON_COPY, PHONE_APPS, type PhoneAppId } from '@/lib/game/phone'
import styles from '../phone.module.css'

export function ComingSoonApp({ appId, onHome }: { appId: PhoneAppId; onHome: () => void }) {
  const meta = PHONE_APPS.find((a) => a.id === appId)
  return (
    <div className={styles.comingSoon}>
      <span className={styles.comingEmoji} aria-hidden="true">
        {meta?.emoji ?? '📱'}
      </span>
      <h2 className={styles.comingTitle}>{meta?.label ?? 'App'}</h2>
      <p className={styles.comingCopy}>{COMING_SOON_COPY[appId] || 'Coming soon.'}</p>
      <button type="button" className={styles.primaryPill} onClick={onHome}>
        Back home
      </button>
    </div>
  )
}
