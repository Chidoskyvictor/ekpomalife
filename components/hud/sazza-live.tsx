'use client'

import { motion, useReducedMotion } from 'motion/react'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BodyPortal } from '@/components/ui/body-portal'
import { useGame } from '@/hooks/use-game'
import { playSfx } from '@/lib/audio/sfx'
import { useTrip } from '@/lib/game/trip'
import { pushNavigation } from '@/lib/navigation/safe-nav'
import styles from './launch-invite.module.css'

const SAZZA = 'sazza'
/** Shown once per player (per device): bump the version for a future announcement. */
const KEY = 'ekpoma-sazza-live-v1'

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
    /* storage blocked: it can show again next visit, that's fine */
  }
}

/*
 * Launch night: "Sazza is open" once per player, with Go to Sazza (opens Sazza on the map with its
 * ride choices) and Cancel. Waits until the Innovation Hub invite is closed so the two never stack,
 * and never shows to guests, during a ride, or when you're already at Sazza.
 */
export function SazzaLive() {
  const { state, isGuest, select } = useGame()
  const trip = useTrip()
  const router = useRouter()
  const pathname = usePathname()
  const reduce = useReducedMotion() ?? false
  const [open, setOpen] = useState(false)

  const eligible = !isGuest && Boolean(state) && state?.locationId !== SAZZA && !trip && !pathname?.startsWith('/club')

  useEffect(() => {
    if (!eligible || open || seen()) return
    // Give the page a moment, and wait while the Innovation Hub card is up
    const timer = window.setInterval(() => {
      if (document.getElementById('launch-invite-title')) return
      window.clearInterval(timer)
      markSeen()
      setOpen(true)
      playSfx('invite')
    }, 1500)
    return () => window.clearInterval(timer)
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
          aria-labelledby="sazza-live-title"
          className={styles.card}
          onClick={(event) => event.stopPropagation()}
          initial={reduce ? false : { opacity: 0, y: 14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
        >
          <span className={styles.emoji} aria-hidden="true" style={{ background: '#fde7f3' }}>
            🪩
          </span>
          <h2 id="sazza-live-title" className={styles.title}>
            Sazza is open tonight
          </h2>
          <p className={styles.why}>The music is on and the DJ is live. Bring your guys, spray, and get a shout-out.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.go}
              onClick={() => {
                close()
                select(SAZZA)
                if (pathname !== '/') pushNavigation(router, '/', pathname)
              }}
            >
              Go to Sazza
            </button>
          </div>
        </motion.div>
      </div>
    </BodyPortal>
  )
}
