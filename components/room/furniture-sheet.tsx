'use client'

import { Clock } from 'lucide-react'
import { HudDrawer } from '@/components/hud/hud-drawer'
import { FURNITURE, gameTimeLabel, type FurnitureAction, type FurnitureId } from '@/lib/game/room-furniture'
import styles from './furniture-sheet.module.css'

/** Pops up when you tap furniture in your room: pick what to do with it. */
export function FurnitureSheet({
  furniture,
  onClose,
  onPick,
}: {
  furniture: FurnitureId | null
  onClose: () => void
  onPick: (furniture: FurnitureId, action: FurnitureAction) => void
}) {
  const item = furniture ? FURNITURE[furniture] : null
  return (
    <HudDrawer
      open={!!item}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={item?.label ?? ''}
      description="Your room: use it like your own"
      fit
      leading={item ? <span className={styles.headIcon}>{item.emoji}</span> : undefined}
    >
      {item ? (
        <div className={styles.grid}>
          {item.actions.map((action) => (
            <button
              key={action.id + action.title}
              type="button"
              className={styles.card}
              onClick={() => onPick(item.id, action)}
            >
              <span className={styles.cardTop}>
                <span className={styles.emoji} aria-hidden="true">
                  {action.emoji}
                </span>
                <span className={styles.time}>
                  <Clock size={13} aria-hidden="true" />
                  {gameTimeLabel(action.minutes)}
                </span>
              </span>
              <span className={styles.free}>{action.cost ? `₦${action.cost.toLocaleString()}` : 'Free'}</span>
              <span className={styles.title}>{action.title}</span>
              <span className={styles.chips}>
                {action.gains.map((gain) => (
                  <span key={gain} className={styles.chip}>
                    +{gain}
                  </span>
                ))}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </HudDrawer>
  )
}
