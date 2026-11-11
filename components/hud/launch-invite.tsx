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

const HUB = 'innovation-hub'
/** Shown once per player (per device): bump the version for a future announcement. */
const KEY = 'ekpoma-hub-live-v1'

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
 * "Innovation Hub is active" once per player, with Go to the Hub (opens it on the map with its
 * ride choices) and Cancel. Same card as the Sazza-open notice. Never shows to guests, during a
 * ride, or when you're already at the Hub.
 */
export function LaunchInvite() {
  const { state, isGuest, select } = useGame()
  const trip = useTrip()
  const router = useRouter()
  const pathname = usePathname()
  const reduce = useReducedMotion() ?? false
  const [open, setOpen] = useState(false)

  const eligible = !isGuest && Boolean(state) && state?.locationId !== HUB && !trip

  useEffect(() => {
    if (!eligible || open || seen()) return
    const timer = window.setTimeout(() => {
      markSeen()
      setOpen(true)
      playSfx('invite')
    }, 1500)
    return () => window.clearTimeout(timer)
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
          aria-labelledby="launch-invite-title"
          className={styles.card}
          onClick={(event) => event.stopPropagation()}
          initial={reduce ? false : { opacity: 0, y: 14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
        >
          <span className={styles.emoji} aria-hidden="true">
            🚀
          </span>
          <h2 id="launch-invite-title" className={styles.title}>
            Innovation Hub is active
          </h2>
          <p className={styles.why}>The desks are open. Ride over and pitch your idea.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.go}
              onClick={() => {
                close()
                select(HUB)
                if (pathname !== '/') pushNavigation(router, '/', pathname)
              }}
            >
              Go to the Hub
            </button>
          </div>
        </motion.div>
      </div>
    </BodyPortal>
  )
}
