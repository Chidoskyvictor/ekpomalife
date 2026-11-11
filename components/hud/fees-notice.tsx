'use client'

import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { BodyPortal } from '@/components/ui/body-portal'
import { useGame } from '@/hooks/use-game'
import { playSfx } from '@/lib/audio/sfx'
import { useTrip } from '@/lib/game/trip'
import styles from './launch-invite.module.css'

/** Shown once per device. Bump the version for a later fees announcement. */
export const FEES_NOTICE_KEY = 'ekpoma-fees-portal-v1'
const PORTAL = 'https://eportal.aauekpoma.edu.ng/'
const WHATSAPP = `https://wa.me/2348136652445?text=${encodeURIComponent('hello francis im from ekpomalife app i want to pay my school fees')}`

function seen(): boolean {
  try {
    return window.localStorage.getItem(FEES_NOTICE_KEY) === '1'
  } catch {
    return false
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(FEES_NOTICE_KEY, '1')
  } catch {
    /* storage blocked: it can show again next visit */
  }
}

function openLink(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

/*
 * Admin Block notice: the school fees portal is open for newly admitted students.
 * Pay on the university portal, or WhatsApp Prodigy with the message already written.
 * Once per device. Hidden for guests and during a ride.
 */
export function FeesNotice() {
  const { state, isGuest } = useGame()
  const trip = useTrip()
  const reduce = useReducedMotion() ?? false
  const [open, setOpen] = useState(false)

  const eligible = !isGuest && Boolean(state) && !trip

  useEffect(() => {
    if (!eligible || open || seen()) return
    const timer = window.setInterval(() => {
      if (document.getElementById('checkin-title') || document.getElementById('story-title')) return
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
          aria-labelledby="fees-notice-title"
          className={styles.card}
          onClick={(event) => event.stopPropagation()}
          initial={reduce ? false : { opacity: 0, y: 14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
        >
          <span className={styles.emoji} aria-hidden="true">
            🎓
          </span>
          <p className={styles.place}>Admin Block</p>
          <h2 id="fees-notice-title" className={styles.title}>
            School fees portal is open
          </h2>
          <p className={styles.why}>
            AAU has activated the school fees portal for newly admitted students, 2026/2027. Log in and pay.
          </p>
          <div className={`${styles.actions} ${styles.stack}`}>
            <button
              type="button"
              className={styles.go}
              onClick={() => {
                openLink(PORTAL)
                close()
              }}
            >
              Pay in school portal
            </button>
            <button
              type="button"
              className={styles.go}
              onClick={() => {
                openLink(WHATSAPP)
                close()
              }}
            >
              Pay with Prodigy
            </button>
            <button type="button" className={styles.cancel} onClick={close}>
              Cancel
            </button>
          </div>
        </motion.div>
      </div>
    </BodyPortal>
  )
}
