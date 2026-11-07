'use client'

import { X } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import { pushNavigation } from '@/lib/navigation/safe-nav'
import styles from './pitch-day-pill.module.css'

const HUB = 'innovation-hub'
const KEY = 'ekpoma-pitch-pill-hidden'
const today = () => new Date().toISOString().slice(0, 10)

/** "Pitch Day" under the status bar: Go opens Innovation Hub's sheet on the map to pick a ride. ✕ hides it for today. */
export function PitchDayPill() {
  const { state, isGuest, select } = useGame()
  const router = useRouter()
  const pathname = usePathname()
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(KEY) === today())
    } catch {
      setHidden(false)
    }
  }, [])

  if (hidden || isGuest || !state || state.locationId === HUB) return null

  const hide = () => {
    setHidden(true)
    try {
      localStorage.setItem(KEY, today())
    } catch {
      /* storage blocked: hidden until reload */
    }
  }

  return (
    <div className={styles.pill} role="status">
      <span className={styles.icon} aria-hidden="true">
        🚀
      </span>
      <span className={styles.text}>
        <strong>Pitch Day</strong>
        <span>Innovation Hub · pitch your tech to an investor</span>
      </span>
      <button
        type="button"
        className={styles.go}
        onClick={() => {
          select(HUB)
          if (pathname !== '/') pushNavigation(router, '/', pathname)
        }}
      >
        Go
      </button>
      <button type="button" className={styles.close} aria-label="Hide Pitch Day for today" onClick={hide}>
        <X size={14} />
      </button>
    </div>
  )
}
