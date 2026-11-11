'use client'

import { motion, useReducedMotion } from 'motion/react'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BodyPortal } from '@/components/ui/body-portal'
import { useGame } from '@/hooks/use-game'
import { playSfx } from '@/lib/audio/sfx'
import { useTrip } from '@/lib/game/trip'
import { pushNavigation } from '@/lib/navigation/safe-nav'
import { FEES_NOTICE_KEY } from './fees-notice'
import styles from './launch-invite.module.css'

const FORBES = 'forbes'
/** Shown once per device. Bump the version for a later night. */
const KEY = 'ekpoma-forbes-live-v1'
/** Lagos minutes: show from 10:00pm until 5:00am. */
const OPEN_MIN = 22 * 60
const CLOSE_MIN = 5 * 60

function seen(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(KEY, '1')
  } catch {
    /* storage blocked: it can show again next visit */
  }
}

function lagosMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  let hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0')
  if (hour === 24) hour = 0
  return hour * 60 + minute
}

/** True from 10:00pm through 4:59am, Africa/Lagos. */
export function forbesNight(now = new Date()): boolean {
  const minutes = lagosMinutes(now)
  return minutes >= OPEN_MIN || minutes < CLOSE_MIN
}

/** Milliseconds until 10:00pm Lagos. 0 when the night window is already open. */
export function msUntilForbesNight(now = new Date()): number {
  const minutes = lagosMinutes(now)
  if (minutes >= OPEN_MIN || minutes < CLOSE_MIN) return 0
  return (OPEN_MIN - minutes) * 60_000
}

/*
 * "Forbes is active" once per device, only from 10pm to 5am Lagos time. Go opens Forbes on the
 * map (the club place sheet, with the ride choices). Waits until the fees notice is closed.
 * Hidden for guests, during a ride, and when you're already at Forbes.
 */
export function ForbesLive() {
  const { state, isGuest, select } = useGame()
  const trip = useTrip()
  const router = useRouter()
  const pathname = usePathname()
  const reduce = useReducedMotion() ?? false
  const [open, setOpen] = useState(false)

  const eligible = !isGuest && Boolean(state) && state?.locationId !== FORBES && !trip && pathname !== '/club/forbes'

  useEffect(() => {
    if (!eligible || open || seen()) return
    let interval = 0
    const feesPending = () => {
      if (document.getElementById('fees-notice-title')) return true
      try {
        return window.localStorage.getItem(FEES_NOTICE_KEY) !== '1'
      } catch {
        return false
      }
    }
    const show = () => {
      if (!forbesNight() || feesPending()) return false
      markSeen()
      setOpen(true)
      playSfx('invite')
      return true
    }
    const timer = window.setTimeout(() => {
      if (show()) return
      interval = window.setInterval(() => {
        if (show()) window.clearInterval(interval)
      }, 1500)
    }, msUntilForbesNight())
    return () => {
      window.clearTimeout(timer)
      window.clearInterval(interval)
    }
  }, [eligible, open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const close = () => setOpen(false)

  if (!open || !eligible) return null
  return (
    <BodyPortal>
      <div className={styles.backdrop} onClick={close}>
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="forbes-live-title"
          className={styles.card}
          onClick={(event) => event.stopPropagation()}
          initial={reduce ? false : { opacity: 0, y: 14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
        >
          <span className={styles.emoji} aria-hidden="true" style={{ background: '#fef3c7' }}>
            💸
          </span>
          <h2 id="forbes-live-title" className={styles.title}>
            Forbes is active
          </h2>
          <p className={styles.why}>The big spenders club is open. Ride over and pull up.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.go}
              onClick={() => {
                close()
                select(FORBES)
                if (pathname !== '/') pushNavigation(router, '/', pathname)
              }}
            >
              Go to Forbes
            </button>
          </div>
        </motion.div>
      </div>
    </BodyPortal>
  )
}
