'use client'

import { useEconomy } from '@/hooks/use-economy'
import { todayInEkpomaFor, type QuestPill } from '@/lib/game/quests'
import type { GameState } from '@/lib/game/types'
import { hapticTap } from './haptic'
import { HudDrawer } from './hud-drawer'
import { RentCard } from './rent-card'
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
  const { rent, currentJobId, jobs, pay } = useEconomy()
  const jobPlaceId = jobs.find((job) => job.id === currentJobId)?.placeId ?? null
  const items = todayInEkpomaFor(state, { rent, currentJobId, jobPlaceId })

  return (
    <HudDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Today in Ekpoma"
      description="Events, rent, and tasks for the day."
    >
      <div className={styles.sheetBody}>
        <RentCard />
        <div className={styles.sheetList}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.sheetRow}
              onClick={() => {
                hapticTap()
                if (item.rentPay) {
                  void pay()
                  return
                }
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
