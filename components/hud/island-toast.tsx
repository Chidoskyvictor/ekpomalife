'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { calendarForDay } from '@/lib/game/needs'
import { cityEventFor } from '@/lib/game/quests'
import type { GameState } from '@/lib/game/types'
import styles from './life-hud.module.css'

const spring = { type: 'spring' as const, stiffness: 400, damping: 32 }

export function IslandToast({ state }: { state: GameState }) {
  const reduced = useReducedMotion() ?? false
  const event = cityEventFor(state)
  const cal = calendarForDay(state.day)
  const seen = useRef<string | null>(null)
  const rentSeen = useRef<number | null>(null)
  const [visible, setVisible] = useState<{ id: string; title: string; emoji: string } | null>(null)

  useEffect(() => {
    if (cal.rentDay && rentSeen.current !== state.day) {
      rentSeen.current = state.day
      setVisible({
        id: `rent-day-${state.day}`,
        title: 'Rent day · Baba Landlord is coming',
        emoji: '/emoji/house.png',
      })
      const timer = window.setTimeout(() => setVisible(null), 3200)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [cal.rentDay, state.day])

  useEffect(() => {
    if (seen.current === null) {
      seen.current = event.id
      return
    }
    if (seen.current === event.id) return
    seen.current = event.id
    setVisible({ id: event.id, title: event.title, emoji: event.emoji })
    const timer = window.setTimeout(() => setVisible(null), 3000)
    return () => window.clearTimeout(timer)
  }, [event.id, event.title, event.emoji])

  return (
    <div className={styles.islandWrap} aria-live="polite">
      <AnimatePresence>
        {visible ? (
          <motion.div
            key={visible.id}
            className={styles.island}
            initial={reduced ? { opacity: 0 } : { opacity: 0, scaleX: 0.35, scaleY: 0.55 }}
            animate={{ opacity: 1, scaleX: 1, scaleY: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scaleX: 0.4, scaleY: 0.6 }}
            transition={reduced ? { duration: 0 } : spring}
          >
            <img src={visible.emoji} alt="" width={18} height={18} />
            <p className={styles.islandText}>{visible.title}</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
