'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { motionTokens } from '@/components/arc/lib/motion-tokens'
import { questStackFor, type QuestPill } from '@/lib/game/quests'
import type { GameState } from '@/lib/game/types'
import styles from './life-hud.module.css'

export function QuestStack({
  state,
  activeId,
  onSelect,
}: {
  state: GameState
  activeId: string | null
  onSelect: (pill: QuestPill) => void
}) {
  const reduced = useReducedMotion() ?? false
  const pills = questStackFor(state)

  return (
    <aside className={styles.questStack} aria-label="Quests">
      <AnimatePresence initial={false}>
        {pills.map((pill) => (
          <motion.button
            key={pill.id}
            type="button"
            layout={!reduced}
            className={`${styles.questPill} ${pill.kind === 'event' ? styles.questEvent : ''}`}
            data-active={activeId === pill.id ? 'true' : 'false'}
            onClick={() => onSelect(pill)}
            initial={reduced ? { opacity: 0 } : { opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, x: -10 }}
            transition={reduced ? { duration: 0 } : motionTokens.spring.smooth}
          >
            <span className={styles.questIcon}>
              <img src={pill.emoji} alt="" width={18} height={18} />
            </span>
            <span className={styles.questCopy}>
              <span className={styles.questTitle}>{pill.title}</span>
              <span className={styles.questHint}>{pill.hint}</span>
            </span>
          </motion.button>
        ))}
      </AnimatePresence>
    </aside>
  )
}
