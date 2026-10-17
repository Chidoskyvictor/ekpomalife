'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Bell } from 'lucide-react'
import { useEffect, useState } from 'react'
import { todayBellCount, upNextQueueFor, type QuestPill } from '@/lib/game/quests'
import type { GameState } from '@/lib/game/types'
import { hapticTap } from './haptic'
import styles from './life-hud.module.css'

const spring = { type: 'spring' as const, stiffness: 400, damping: 32 }

export function UpNext({
  state,
  onSelect,
  onOpenToday,
}: {
  state: GameState
  onSelect: (pill: QuestPill) => void
  onOpenToday: () => void
}) {
  const reduced = useReducedMotion() ?? false
  const queue = upNextQueueFor(state)
  const [index, setIndex] = useState(0)
  const pill = queue[index % Math.max(1, queue.length)] ?? queue[0]!
  const badge = todayBellCount(state)
  const line = pill.hint || pill.title

  useEffect(() => {
    setIndex(0)
  }, [state.day, state.period, queue.length])

  const skip = () => {
    hapticTap()
    setIndex((current) => (current + 1) % Math.max(1, queue.length))
  }

  return (
    <div className={styles.upNextRow}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.button
          key={pill.id}
          type="button"
          className={styles.upNext}
          onClick={() => {
            hapticTap()
            onSelect(pill)
          }}
          onPointerUp={(event) => {
            if (event.pointerType === 'touch') return
          }}
          drag={reduced ? false : 'x'}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={(_, info) => {
            if (info.offset.x < -56 || info.velocity.x < -400) skip()
          }}
          initial={reduced ? { opacity: 0 } : { opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, x: -24 }}
          transition={reduced ? { duration: 0 } : spring}
          aria-label={`Up next: ${line}. Swipe left to skip.`}
        >
          <span className={styles.upNextIcon}>
            <img src={pill.emoji} alt="" width={16} height={16} />
          </span>
          <span className={styles.upNextCopy}>
            <span className={styles.title}>{line}</span>
          </span>
        </motion.button>
      </AnimatePresence>

      <button
        type="button"
        className={styles.bellBtn}
        aria-label={`Today in Ekpoma, ${badge} items`}
        onClick={() => {
          hapticTap()
          onOpenToday()
        }}
      >
        <Bell size={18} aria-hidden="true" />
        {badge > 0 ? <span className={styles.bellBadge}>{badge > 9 ? '9+' : badge}</span> : null}
      </button>
    </div>
  )
}
