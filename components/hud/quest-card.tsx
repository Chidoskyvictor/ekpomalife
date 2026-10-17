'use client'

import { X } from 'lucide-react'
import { useState } from 'react'
import { dreamProgress, getDream, snapshotFromLife } from '@/lib/game/dreams'
import { compactMoney, PERIOD_CLOCK } from '@/lib/game/needs'
import { currentObjective } from '@/lib/game/rules'
import type { GameState } from '@/lib/game/types'
import styles from './life-hud.module.css'

function suggestAction(state: GameState) {
  const objective = currentObjective(state)
  if (objective) return objective.label
  if (state.hunger < 35) return 'Eat at Mama Amina Bukka'
  if (state.energy < 35) return 'Rest before night class'
  if (state.academic < 55) return `Study around ${PERIOD_CLOCK.afternoon.time}`
  return `Go to work around ${PERIOD_CLOCK.afternoon.time}`
}

export function QuestCard({ state, onSelect }: { state: GameState; onSelect: (locationId: string) => void }) {
  const [hidden, setHidden] = useState(false)
  if (hidden) return null

  const dream = getDream(state.dreamId)
  const progress = dream ? dreamProgress(dream, snapshotFromLife(state.cash, state.dream)) : null
  const ratio = progress ? Math.min(1, progress.current / Math.max(1, progress.target)) : 0
  const objective = currentObjective(state)
  const title = dream
    ? `${dream.emoji} ${dream.title} · ${
        dream.goal.type === 'net-worth' || dream.goal.type === 'revenue'
          ? `${compactMoney(progress!.current)} / ${compactMoney(progress!.target)}`
          : progress!.label.replace(`${dream.title}: `, '')
      }`
    : 'Pick a big dream'

  return (
    <aside className={styles.sideRight}>
      <section className={`${styles.panel} ${styles.quest}`} aria-label="Next up">
        <div className={styles.questHead}>
          <p className={styles.questTitle}>{title}</p>
          <button
            type="button"
            className={styles.questDismiss}
            aria-label="Dismiss quest card"
            onClick={() => setHidden(true)}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        {dream ? (
          <div className={styles.questBar} style={{ ['--progress' as string]: ratio }} aria-hidden="true">
            <div className={styles.questFill} />
          </div>
        ) : null}
        <button
          type="button"
          className={styles.questAction}
          style={{ textAlign: 'left', border: 0, background: 'transparent', cursor: 'pointer', padding: 0 }}
          onClick={() => {
            if (objective) onSelect(objective.locationId)
            else if (state.hunger < 35) onSelect('roadside_bukka')
            else onSelect(state.locationId)
          }}
        >
          {suggestAction(state)}
        </button>
      </section>
    </aside>
  )
}
