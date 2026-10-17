'use client'

import { todayInEkpomaFor, type QuestPill } from '@/lib/game/quests'
import type { GameState } from '@/lib/game/types'
import { hapticTap } from './haptic'
import { HudDrawer } from './hud-drawer'
import styles from './life-hud.module.css'

export function TodaySheet({
  open,
  onOpenChange,
  state,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  state: GameState
  onSelect: (pill: QuestPill) => void
}) {
  const items = todayInEkpomaFor(state)

  return (
    <HudDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Today in Ekpoma"
      description="Events, coins, and tasks for the day."
    >
      <div className={styles.sheetBody}>
        <div className={styles.sheetList}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.sheetRow}
              onClick={() => {
                hapticTap()
                onSelect(item)
                onOpenChange(false)
              }}
            >
              <span className={styles.sheetRowIcon}>
                <img src={item.emoji} alt="" width={18} height={18} />
              </span>
              <span className={styles.sheetRowCopy}>
                <span className={styles.title}>{item.title}</span>
                <span className={styles.secondary}>{item.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </HudDrawer>
  )
}
