'use client'

import { AnimatePresence } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { calendarForDay } from '@/lib/game/needs'
import type { GameState } from '@/lib/game/types'
import { NoticeCard } from './hud-toast'
import styles from './life-hud.module.css'

/** Game notices (rent day) as a pop-up notification card. */
export function IslandToast({ state }: { state: GameState }) {
  const cal = calendarForDay(state.day)
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
      const timer = window.setTimeout(() => setVisible(null), 4000)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [cal.rentDay, state.day])

  return (
    <div className={styles.toastSlot} aria-live="polite">
      <AnimatePresence>
        {visible ? (
          <NoticeCard
            key={visible.id}
            id={visible.id}
            icon={<img src={visible.emoji} alt="" width={22} height={22} />}
            onDismiss={() => setVisible(null)}
          >
            {visible.title}
          </NoticeCard>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
