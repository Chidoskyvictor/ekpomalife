'use client'

import { BATTERY, type PhoneClock, type PhoneState } from '@/lib/game/phone'
import styles from './phone.module.css'

export function PhoneStatusBar({
  clock,
  phone,
  localLabel,
}: {
  clock: PhoneClock | null
  phone: PhoneState
  localLabel?: string
}) {
  const low = phone.battery <= BATTERY.lowAt
  const noData = phone.dataMb <= 0

  return (
    <div className={styles.statusBar} aria-label="Phone status">
      <span>{localLabel ?? clock?.label ?? '—'}</span>
      <div className={styles.statusRight}>
        {noData ? (
          <span className={styles.signalMuted} aria-label="No data">
            E · No data
          </span>
        ) : (
          <span aria-label="4G signal">▮▮▮ 4G</span>
        )}
        <span
          className={low ? styles.batteryLow : undefined}
          aria-label={`Battery ${phone.battery} percent${phone.charging ? ', charging' : ''}`}
        >
          {phone.charging ? '⚡' : '🔋'} {phone.battery}%
        </span>
      </div>
    </div>
  )
}
