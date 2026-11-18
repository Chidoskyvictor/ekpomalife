'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BodyPortal } from '@/components/ui/body-portal'
import { useGame } from '@/hooks/use-game'
import { playSfx } from '@/lib/audio/sfx'
import { useTrip } from '@/lib/game/trip'
import { watMinuteOfDay } from '@/lib/game/wat-clock'
import { pushNavigation } from '@/lib/navigation/safe-nav'
import { hapticTap } from './haptic'
import styles from './sazza-live.module.css'

const SAZZA = 'sazza'
const KEY = 'ekpoma-sazza-night'
/** The notification goes out at 10:00pm WAT and stays valid until the club closes at 5:00am. */
const SHOW_MIN = 22 * 60
const CLOSE_MIN = 5 * 60
/** Club hours, WAT: 8:00pm until 5:00am. */
const OPEN_MIN = 20 * 60
/** It slides away on its own after this long if you don't tap it. */
const AUTO_HIDE_MS = 14000

/** True from 8:00pm through 4:59am WAT, when Sazza is open. */
export function sazzaNight(now = Date.now()): boolean {
  const minutes = watMinuteOfDay(now)
  return minutes >= OPEN_MIN || minutes < CLOSE_MIN
}

/** 10:00pm–4:59am WAT: the window for tonight's notification. */
function notifyWindow(now = Date.now()) {
  const minutes = watMinuteOfDay(now)
  return minutes >= SHOW_MIN || minutes < CLOSE_MIN
}

/** Which night this is (the WAT date the night started on), so it shows once per night. */
function nightId(now = Date.now()) {
  const wat = new Date(now + 60 * 60 * 1000) // WAT is UTC+1, no daylight saving
  if (watMinuteOfDay(now) < CLOSE_MIN) wat.setUTCDate(wat.getUTCDate() - 1)
  return wat.toISOString().slice(0, 10)
}

function shownTonight(): boolean {
  try {
    return window.localStorage.getItem(KEY) === nightId()
  } catch {
    return false
  }
}

function markShown() {
  try {
    window.localStorage.setItem(KEY, nightId())
  } catch {
    /* storage blocked: it may show again on the next visit, that's fine */
  }
}

/*
 * "Sazza is live" drops in from the top at 10pm WAT, once a night (also if you open the game later
 * that night, until 5am). Go takes you to Sazza with the ride choices. Not for guests, during a
 * ride, or when you're already at Sazza.
 */
export function SazzaLive() {
  const { state, isGuest, select } = useGame()
  const trip = useTrip()
  const router = useRouter()
  const pathname = usePathname()
  const reduce = useReducedMotion() ?? false
  const [open, setOpen] = useState(false)
  const [tick, setTick] = useState(0)

  const eligible = !isGuest && Boolean(state) && state?.locationId !== SAZZA && !trip && !pathname?.startsWith('/club')

  // Check every 30s, so players already in the game get it right at 10pm
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 30000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    if (!eligible || open || !notifyWindow() || shownTonight()) return
    const timer = window.setTimeout(() => {
      markShown()
      setOpen(true)
      playSfx('invite')
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [eligible, open, tick])

  useEffect(() => {
    if (!open) return
    const hide = window.setTimeout(() => setOpen(false), AUTO_HIDE_MS)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(hide)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const go = () => {
    hapticTap()
    setOpen(false)
    select(SAZZA)
    if (pathname !== '/') pushNavigation(router, '/', pathname)
  }

  return (
    <BodyPortal>
      <AnimatePresence>
        {open && eligible ? (
          <motion.div
            key="sazza-live"
            role="status"
            aria-live="polite"
            className={styles.wrap}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -90 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -90 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            drag={reduce ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.6, bottom: 0.1 }}
            onDragEnd={(_, info) => {
              if (info.offset.y < -30) setOpen(false)
            }}
          >
            <div className={styles.card}>
              <span className={styles.lights} aria-hidden="true" />
              <span className={styles.icon} aria-hidden="true">
                🪩
              </span>
              <span className={styles.text}>
                <span className={styles.kicker}>
                  <span className={styles.liveDot} /> Live now · 10 PM
                </span>
                <strong>Sazza is live</strong>
                <span className={styles.sub}>DJ on deck. Come spray and get a shout-out.</span>
              </span>
              <button type="button" className={styles.go} onClick={go}>
                Go
              </button>
              <button type="button" className={styles.close} aria-label="Dismiss" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </BodyPortal>
  )
}
