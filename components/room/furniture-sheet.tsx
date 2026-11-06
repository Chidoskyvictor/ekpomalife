'use client'

import { Clock } from 'lucide-react'
import { ItemMenu } from '@/components/hud/item-menu'
import { FURNITURE, type FurnitureAction, type FurnitureId } from '@/lib/game/room-furniture'
import styles from './furniture-sheet.module.css'

/** One colour per need, so the gains read at a glance. */
const NEED_TONE: Record<string, string> = {
  Energy: styles.energy!,
  Fun: styles.fun!,
  Social: styles.social!,
  Hunger: styles.hunger!,
  Food: styles.hunger!,
  Hygiene: styles.hygiene!,
  Study: styles.study!,
}

/**
 * Tap a piece of furniture at home: just its action card(s) float above the nav (no header).
 * Big white cards: pastel icon, time pill, green price, the action, and coloured gains.
 */
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
    <ItemMenu bare open={!!item?.actions.length} icon={item?.emoji} title={item?.label ?? ''} onClose={onClose}>
      {item ? (
        <div className={styles.cards}>
          {item.actions.map((action) => (
            <button key={action.id + action.title} type="button" className={styles.card} onClick={() => onPick(item.id, action)}>
              <span className={styles.top}>
                <span className={styles.icon} aria-hidden="true">
                  {action.emoji}
                </span>
                <span className={styles.time}>
                  <Clock size={13} aria-hidden="true" />
                  {action.seconds}s
                </span>
              </span>
              <span className={styles.price}>{action.cost ? `₦${action.cost.toLocaleString()}` : 'Free'}</span>
              <span className={styles.title}>{action.title}</span>
              <span className={styles.tags}>
                {action.gains.map((gain) => (
                  <span key={gain} className={`${styles.tag} ${NEED_TONE[gain] ?? styles.energy}`}>
                    +{gain}
                  </span>
                ))}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </ItemMenu>
  )
}
