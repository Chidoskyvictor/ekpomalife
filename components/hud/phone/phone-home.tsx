'use client'

import { useEffect, useState } from 'react'
import type { PhoneGetResponse } from '@/lib/game/phone-api'
import type { SpaceCard } from '@/lib/game/spaces-api'
import { PHONE_MODE_KEY, type PhoneAppId, type PhonePromo, type PhoneState } from '@/lib/game/phone'
import { AppGrid } from './app-grid'
import { PromoBanner } from './promo-banner'
import styles from './phone.module.css'

export function PhoneHome({
  phone,
  clock,
  dateLabel,
  promos,
  lowPerf,
  liveSpaces = [],
  onOpenApp,
  onPromo,
  onOpenSpace,
}: {
  phone: PhoneState
  clock: PhoneGetResponse['clock'] | null
  /** Same calendar as the HUD, e.g. "Thursday 15". */
  dateLabel: string | null
  promos: PhonePromo[]
  lowPerf?: boolean
  /** Public rooms live now (top 3 are shown) */
  liveSpaces?: SpaceCard[]
  onOpenApp: (id: PhoneAppId) => void
  onPromo: (promo: PhonePromo) => void
  onOpenSpace?: (spaceId: string) => void
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

  return (
    <div className={styles.home}>
      <p className={styles.clock} aria-label={clock?.label}>
        {clock?.label?.replace(/\s?(AM|PM)$/i, '') ?? '--:--'}
      </p>
      <p className={styles.dateLine}>{dateLabel ?? '—'}</p>

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
      </div>

      <PromoBanner promos={promos} onAction={onPromo} lowPerf={lowPerf} />

      {liveSpaces.length > 0 ? (
        <section className={styles.liveStrip} aria-label="Live now">
          <p className={styles.liveHead}>
            <span className={styles.liveDot} aria-hidden="true" /> Live now
          </p>
          <ul className={styles.liveRow}>
            {liveSpaces.slice(0, 3).map((space) => (
              <li key={space.id}>
                <button type="button" className={styles.liveCard} onClick={() => onOpenSpace?.(space.id)}>
                  <span className={styles.liveTitle}>{space.title}</span>
                  <span className={styles.liveMeta}>
                    @{space.host.username} · 🎧 {space.present}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
