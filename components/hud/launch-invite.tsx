'use client'

import { motion, useReducedMotion } from 'motion/react'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BodyPortal } from '@/components/ui/body-portal'
import { useGame } from '@/hooks/use-game'
import { playSfx } from '@/lib/audio/sfx'
import { fetchLaunch } from '@/lib/game/hub-api'
import { launchInviteDue, markLaunchInviteShown } from '@/lib/game/launch-invite'
import { useTrip } from '@/lib/game/trip'
import { pushNavigation } from '@/lib/navigation/safe-nav'
import styles from './launch-invite.module.css'

const HUB = 'innovation-hub'

/*
 * Launch invite: a centred card for players who haven't pitched yet, once per login (right after
 * login or signup). Go opens the Innovation Hub on the map (its place sheet, with the ride choices).
 * Cancel hides it until the next login. Never shows at the Hub or during a ride.
 */
export function LaunchInvite() {
  const { state, isGuest, select } = useGame()
  const trip = useTrip()
  const router = useRouter()
  const pathname = usePathname()
  const reduce = useReducedMotion() ?? false
  const [open, setOpen] = useState(false)

  const eligible = !isGuest && Boolean(state) && state?.locationId !== HUB && !trip

  // Ask the server once (logged-in players who have never pitched), then show it
  useEffect(() => {
    if (!eligible || !launchInviteDue()) return
    let cancelled = false
    void fetchLaunch()
      .then((res) => {
        if (cancelled || !res.ok || res.hasPitched) return
        markLaunchInviteShown()
        setOpen(true)
        playSfx('invite')
      })
      .catch(() => {
        /* offline: no invite this time */
      })
    return () => {
      cancelled = true
    }
  }, [eligible])

  const close = () => setOpen(false)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

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
            Pitch your idea at the Innovation Hub
          </h2>
          <p className={styles.why}>Ekpoma&apos;s first Pitch Day is today. Ride over, see the town, and pitch.</p>
          <p className={styles.reward}>Win ₦1M–₦5M if an investor says yes</p>
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
              Go
            </button>
          </div>
        </motion.div>
      </div>
    </BodyPortal>
  )
}
