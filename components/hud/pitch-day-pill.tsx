'use client'

import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import { pushNavigation } from '@/lib/navigation/safe-nav'
import styles from './pitch-day-pill.module.css'

const HUB = 'innovation-hub'
const KEY = 'ekpoma-pitch-pill-shown'
const today = () => new Date().toISOString().slice(0, 10)

/** "Pitch Day" pop-up notice, once a day: Go opens Innovation Hub on the map to pick a ride; it stays until you tap Go or close it. */
export function PitchDayPill() {
  const { state, isGuest, select } = useGame()
  const router = useRouter()
  const pathname = usePathname()
  const [hidden, setHidden] = useState(true)

  const eligible = !isGuest && Boolean(state) && state?.locationId !== HUB

  // Pop up once a day (a short moment after you land), then slide away on its own
  useEffect(() => {
    if (!eligible) return
    try {
      if (localStorage.getItem(KEY) === today()) return
    } catch {
      /* storage blocked: show this once per load */
    }
    // Stays up until you tap Go or close it. Only counts as shown once it's actually on screen.
    const show = window.setTimeout(() => {
      setHidden(false)
      try {
        localStorage.setItem(KEY, today())
      } catch {
        /* ignore */
      }
    }, 1500)
    return () => window.clearTimeout(show)
  }, [eligible])

  const hide = () => setHidden(true)

  return (
    <AnimatePresence>
      {!hidden && eligible ? (
    <motion.div
      key="pitch-day"
      className={styles.pill}
      role="status"
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.25 }}
    >
      <span className={styles.icon} aria-hidden="true">
        🚀
      </span>
      <span className={styles.text}>
        <strong>Pitch Day</strong>
        <span>Innovation Hub</span>
      </span>
      <button
        type="button"
        className={styles.go}
        onClick={() => {
          hide()
          select(HUB)
          if (pathname !== '/') pushNavigation(router, '/', pathname)
        }}
      >
        Go
      </button>
      <button type="button" className={styles.close} aria-label="Close" onClick={hide}>
        <X size={12} />
      </button>
    </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
