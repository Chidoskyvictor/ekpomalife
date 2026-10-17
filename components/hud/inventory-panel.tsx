'use client'

import { useEconomy } from '@/hooks/use-economy'
import { useGame } from '@/hooks/use-game'
import type { GameActionId } from '@/lib/game/places'
import styles from './economy.module.css'

export function InventoryPanel() {
  const { inventory, loadInventory } = useEconomy()
  const { act, notifyToast } = useGame()

  if (inventory.length === 0) {
    return <p className={styles.cardMeta}>Your bag is empty. Buy something first.</p>
  }

  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Inventory</p>
      <div className={styles.grid}>
        {inventory.map((item) => (
          <button
            key={item.id}
            type="button"
            className={styles.itemCard}
            style={{ minHeight: 44 }}
            onClick={() => {
              if (!item.useActionId) {
                notifyToast('You cannot use that here.', false)
                return
              }
              act(item.useActionId as GameActionId)
              notifyToast(`Used ${item.name}.`, true)
              void loadInventory()
            }}
          >
            <span className={styles.emoji} aria-hidden="true">
              {item.emoji}
            </span>
            <p className={styles.cardTitle}>{item.name}</p>
            <p className={styles.cardMeta}>×{item.qty}</p>
            <span className={styles.cardMeta}>{item.useActionId ? 'Tap to use' : 'Keep'}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
