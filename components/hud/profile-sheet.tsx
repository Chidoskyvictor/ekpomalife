'use client'

import { Button } from '@/components/arc/button/button'
import { dreamProgress, getDream, snapshotFromLife } from '@/lib/game/dreams'
import {
  levelFromXp,
  NEED_GRID,
  NEED_META,
  needTone,
  needValue,
  wellbeingScore,
} from '@/lib/game/needs'
import type { GameState } from '@/lib/game/types'
import { HudDrawer } from './hud-drawer'
import styles from './life-hud.module.css'

const TONE = {
  good: '#22c55e',
  warn: '#eab308',
  bad: '#ef4444',
} as const

export function ProfileSheet({
  open,
  onOpenChange,
  state,
  onChangeDream,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  state: GameState
  onChangeDream: () => void
}) {
  const dream = getDream(state.dreamId)
  const progress = dream ? dreamProgress(dream, snapshotFromLife(state.cash, state.dream)) : null
  const level = levelFromXp(state.xp)
  const well = Math.round(wellbeingScore(state))

  return (
    <HudDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={state.characterName}
      description={`Level ${level.level} · wellbeing ${well}`}
    >
      <div className={styles.sheetBody}>
        <div className={styles.needRows}>
          {NEED_GRID.map((id) => {
            const value = needValue(state, id)
            const meta = NEED_META[id]
            const tone = needTone(value)
            return (
              <div key={id} className={styles.needRow}>
                <img src={meta.emoji} alt="" width={18} height={18} />
                <div>
                  <p className={styles.title}>{meta.label}</p>
                  <div className={styles.needTrack} aria-hidden="true">
                    <div
                      className={styles.needFill}
                      style={{ width: `${value}%`, ['--need' as string]: TONE[tone] }}
                    />
                  </div>
                </div>
                <span className={styles.needVal}>{Math.round(value)}</span>
              </div>
            )
          })}
        </div>

        {dream && progress ? (
          <div>
            <p className={styles.title}>
              {dream.emoji} {dream.title}
            </p>
            <p className={styles.secondary}>{progress.label}</p>
          </div>
        ) : (
          <p className={styles.secondary}>No dream yet. Pick one to unlock quest tips.</p>
        )}

        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            onOpenChange(false)
            onChangeDream()
          }}
        >
          Change dream
        </Button>
      </div>
    </HudDrawer>
  )
}
