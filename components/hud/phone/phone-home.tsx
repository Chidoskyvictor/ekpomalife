'use client'

import NumberFlow from '@number-flow/react'
import { useEffect, useState } from 'react'
import type { PhoneGetResponse } from '@/lib/game/phone-api'
import { PHONE_MODE_KEY, type PhoneAppId, type PhonePromo, type PhoneState } from '@/lib/game/phone'
import { AppGrid } from './app-grid'
import { PromoBanner } from './promo-banner'
import styles from './phone.module.css'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function PhoneHome({
  phone,
  clock,
  location,
  promos,
  cash,
  lowPerf,
  onOpenApp,
  onPromo,
}: {
  phone: PhoneState
  clock: PhoneGetResponse['clock'] | null
  location: PhoneGetResponse['location'] | null
  promos: PhonePromo[]
  cash: number
  lowPerf?: boolean
  onOpenApp: (id: PhoneAppId) => void
  onPromo: (promo: PhonePromo) => void
}) {
  const [mode, setMode] = useState<'day' | 'night'>('day')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PHONE_MODE_KEY)
      if (saved === 'day' || saved === 'night') setMode(saved)
      else if (clock && (clock.hour < 6 || clock.hour >= 19)) setMode('night')
    } catch {
      /* ignore */
    }
  }, [clock])

  const setModePersist = (next: 'day' | 'night') => {
    setMode(next)
    try {
      localStorage.setItem(PHONE_MODE_KEY, next)
    } catch {
      /* ignore */
    }
  }

  const weekday = clock ? WEEKDAYS[(clock.day - 1) % 7]! : ''

  return (
    <div className={styles.home}>
      <p className={styles.clock} aria-label={clock?.label}>
        {clock?.label?.replace(/\s?(AM|PM)$/i, '') ?? '--:--'}
      </p>
      <p className={styles.dateLine}>
        {clock ? `Day ${clock.day} · ${weekday}` : '—'}
      </p>
      <p className={styles.locLine}>
        📍 {location?.label ?? 'Ekpoma'} · {location?.town ?? 'Ekpoma, Edo'}
      </p>

      <div className={styles.modeRow}>
        <div className={styles.modePill} role="group" aria-label="Day or night look">
          <button
            type="button"
            className={`${styles.modeBtn} ${mode === 'day' ? styles.modeBtnActive : ''}`}
            aria-pressed={mode === 'day'}
            onClick={() => setModePersist('day')}
          >
            ☀️
          </button>
          <button
            type="button"
            className={`${styles.modeBtn} ${mode === 'night' ? styles.modeBtnActive : ''}`}
            aria-pressed={mode === 'night'}
            onClick={() => setModePersist('night')}
          >
            🌙
          </button>
        </div>
        <div className={styles.miniStats}>
          <span aria-label={`Data ${phone.dataMb} megabytes`}>📶 {phone.dataMb}MB</span>
          <NumberFlow value={cash} prefix="₦" format={{ maximumFractionDigits: 0 }} />
        </div>
      </div>

      <PromoBanner promos={promos} onAction={onPromo} lowPerf={lowPerf} />

      <AppGrid phone={phone} onOpen={onOpenApp} />
      <div style={{ height: 12 }} />
      <AppGrid phone={phone} onOpen={onOpenApp} dock />
    </div>
  )
}

export function phoneModeFromStorage(): 'day' | 'night' {
  try {
    const saved = localStorage.getItem(PHONE_MODE_KEY)
    if (saved === 'day' || saved === 'night') return saved
  } catch {
    /* ignore */
  }
  return 'day'
}
