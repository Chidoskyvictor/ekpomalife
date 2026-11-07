'use client'

import { AnimatePresence } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { calendarForDay } from '@/lib/game/needs'
import type { GameState } from '@/lib/game/types'
import { NoticeCard } from './hud-toast'
import styles from './life-hud.module.css'
import { playSfx } from '@/lib/audio/sfx'

const RENT_SEEN_KEY = 'ekpoma-rent-notice-day'

/** Has this rent day's notice already shown? Kept in storage: the HUD remounts on every page change. */
function rentNoticeSeen(day: number): boolean {
  try {
    if (localStorage.getItem(RENT_SEEN_KEY) === String(day)) return true
    localStorage.setItem(RENT_SEEN_KEY, String(day))
  } catch {
    /* storage blocked: fall back to once per mount */
  }
  return false
}

/** Game notices (rent day) as a pop-up notification card: once per rent day, not on every page. */
export function IslandToast({ state }: { state: GameState }) {
  const cal = calendarForDay(state.day)
  const rentSeen = useRef<number | null>(null)
  const [visible, setVisible] = useState<{ id: string; title: string; emoji: string } | null>(null)

  useEffect(() => {
    if (cal.rentDay && rentSeen.current !== state.day) {
      rentSeen.current = state.day
      if (rentNoticeSeen(state.day)) return undefined
      playSfx('notify')
      setVisible({
        id: `rent-day-${state.day}`,
        title: 'Rent day · Caretaker is coming',
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
