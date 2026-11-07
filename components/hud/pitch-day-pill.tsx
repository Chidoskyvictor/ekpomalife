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
/** How long the notice stays up before it slides away. */
const SHOW_MS = 9000
const today = () => new Date().toISOString().slice(0, 10)

/** "Pitch Day" pop-up notice, once a day: Go opens Innovation Hub on the map to pick a ride; it slides away by itself after a few seconds. */
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
      localStorage.setItem(KEY, today())
    } catch {
      /* storage blocked: show this once per load */
    }
    const show = window.setTimeout(() => setHidden(false), 1500)
    const away = window.setTimeout(() => setHidden(true), 1500 + SHOW_MS)
    return () => {
      window.clearTimeout(show)
      window.clearTimeout(away)
    }
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
        <span>Innovation Hub · pitch your tech to an investor</span>
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
        <X size={14} />
      </button>
    </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
