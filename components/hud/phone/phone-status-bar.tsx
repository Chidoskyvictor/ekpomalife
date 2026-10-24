'use client'

import type { CSSProperties } from 'react'
import type { PhoneClock, PhoneState } from '@/lib/game/phone'
import styles from './phone.module.css'

/** Four rising signal bars, iOS style. */
function SignalBars({ off }: { off?: boolean }) {
  return (
    <span className={`${styles.signalBars} ${off ? styles.signalOff : ''}`} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}

/** iPhone battery: rounded outline, fill to the level, small cap on the right. */
function BatteryIcon({ level, charging }: { level: number; charging: boolean }) {
  const fill = Math.max(0, Math.min(100, level))
  return (
    <span className={styles.battery} aria-hidden="true">
      <span className={styles.batteryBody}>
        <span className={styles.batteryFill} style={{ '--level': `${fill}%` } as CSSProperties} />
        {charging ? <span className={styles.batteryBolt}>⚡</span> : null}
      </span>
      <span className={styles.batteryCap} />
    </span>
  )
}

export function PhoneStatusBar({
  clock,
  phone,
  onApp = false,
}: {
  clock: PhoneClock | null
  phone: PhoneState
  /** An app is open: dark text on the app's light background (stays visible, like iOS). */
  onApp?: boolean
}) {
  const noData = phone.dataMb <= 0
  const time = (clock?.label ?? '').replace(/\s?(AM|PM)$/i, '')

  return (
    <div className={`${styles.statusBar} ${onApp ? styles.statusBarOnApp : ''}`} aria-label="Phone status">
      <span className={styles.statusTime}>{time || '—'}</span>
      <div className={styles.statusRight}>
        <SignalBars off={noData} />
        <span className={noData ? styles.signalMuted : undefined} aria-label={noData ? 'No data' : '4G'}>
          {noData ? 'E' : '4G'}
        </span>
        <BatteryIcon level={phone.battery} charging={phone.charging} />
        <span className="sr-only">
          Battery {phone.battery} percent{phone.charging ? ', charging' : ''}
        </span>
      </div>
    </div>
  )
}
