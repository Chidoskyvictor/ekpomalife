'use client'

import { motion, useReducedMotion } from 'motion/react'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BodyPortal } from '@/components/ui/body-portal'
import { useGame } from '@/hooks/use-game'
import { playSfx } from '@/lib/audio/sfx'
import { openCarLot, useGarage } from '@/lib/game/cars-api'
import { useDrive } from '@/lib/game/drive'
import { useTrip } from '@/lib/game/trip'
import { pushNavigation } from '@/lib/navigation/safe-nav'
import styles from './launch-invite.module.css'

const LOT = 'magmus-autos'
/** Each tip shows again at most this often. */
const AGAIN_MS = 2 * 24 * 60 * 60 * 1000
const KEYS = { buy: 'ekpoma-tip-buy-car-v1', race: 'ekpoma-tip-race-v1' } as const
/** Let the player settle in first. */
const DELAY_MS = 40_000

function due(key: string) {
  try {
    return Date.now() - Number(window.localStorage.getItem(key) || 0) > AGAIN_MS
  } catch {
    return false
  }
}

function mark(key: string) {
  try {
    window.localStorage.setItem(key, String(Date.now()))
  } catch {
    /* storage blocked */
  }
}

/*
 * Car tips: no car yet → "Buy a car at Magmus Autos" (Go there); own a car → "Race a friend"
 * (how to host a race, with Drive my car). Every couple of days at most, never while driving or
 * riding, and it waits while another card is open.
 */
export function CarTips() {
  const { state, isGuest, select } = useGame()
  const garage = useGarage(!isGuest && Boolean(state))
  const drive = useDrive()
  const trip = useTrip()
  const router = useRouter()
  const pathname = usePathname()
  const reduce = useReducedMotion() ?? false
  const [open, setOpen] = useState<'buy' | 'race' | null>(null)

  const kind: 'buy' | 'race' | null = !garage ? null : garage.cars.length === 0 ? 'buy' : 'race'
  const eligible = !isGuest && Boolean(state) && !drive && !trip && kind !== null

  useEffect(() => {
    if (!eligible || open || !kind || !due(KEYS[kind])) return
    const timer = window.setInterval(() => {
      if (document.querySelector('[role="dialog"]') || document.querySelector('[aria-label="Driving"]')) return
      window.clearInterval(timer)
      mark(KEYS[kind])
      setOpen(kind)
      playSfx('invite')
    }, DELAY_MS)
    return () => window.clearInterval(timer)
  }, [eligible, open, kind])

  if (!open || !eligible) return null
  const close = () => setOpen(null)
  const buy = open === 'buy'

  return (
    <BodyPortal>
      <div className={styles.backdrop} onClick={close}>
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="car-tip-title"
          className={styles.card}
          onClick={(e) => e.stopPropagation()}
          initial={reduce ? false : { opacity: 0, y: 14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
        >
          <span className={styles.emoji} aria-hidden="true">
            {buy ? '🚗' : '🏁'}
          </span>
          <h2 id="car-tip-title" className={styles.title}>
            {buy ? 'Get your own car' : 'Race a friend'}
          </h2>
          {buy ? (
            <p className={styles.why}>
              Magmus Autos is open day and night. Pick a car from Corolla to GT3, then drive anywhere in Ekpoma, race and ride in convoys.
            </p>
          ) : (
            <p className={styles.why}>
              Tap <strong>Drive my car</strong>, then <strong>🏁 Race</strong> at the top. Choose <strong>Host a race</strong>, pick where to finish
              and a stake, invite your friend by name, and tap <strong>Start race</strong> once they join.
            </p>
          )}
          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={close}>
              Not now
            </button>
            <button
              type="button"
              className={styles.go}
              onClick={() => {
                close()
                if (buy) {
                  select(LOT)
                  if (pathname !== '/') pushNavigation(router, '/', pathname)
                } else {
                  openCarLot('garage')
                }
              }}
            >
              {buy ? 'Go to Magmus Autos' : 'Drive my car'}
            </button>
          </div>
        </motion.div>
      </div>
    </BodyPortal>
  )
}
