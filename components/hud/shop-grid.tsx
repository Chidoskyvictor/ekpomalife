'use client'

import { useState } from 'react'
import { useEconomy } from '@/hooks/use-economy'
import { useGame } from '@/hooks/use-game'
import type { ShopItem } from '@/lib/game/economy-api'
import { formatNaira } from '@/lib/game/live'
import styles from './economy.module.css'

function ShopItemCard({
  item,
  cash,
  onBuy,
  busy,
}: {
  item: ShopItem
  cash: number
  onBuy: (qty: number) => void
  busy: boolean
}) {
  const [qty, setQty] = useState(1)
  const total = item.price * qty
  const canAfford = cash >= total

  return (
    <article className={styles.itemCard}>
      <span className={styles.emoji} aria-hidden="true">
        {item.emoji}
      </span>
      <p className={styles.cardTitle}>{item.name}</p>
      <p className={styles.pay}>{formatNaira(item.price)}</p>
      <div className={styles.stepper}>
        <button
          type="button"
          className={styles.stepBtn}
          aria-label="Less"
          onClick={() => setQty((value) => Math.max(1, value - 1))}
        >
          −
        </button>
        <span aria-live="polite">{qty}</span>
        <button
          type="button"
          className={styles.stepBtn}
          aria-label="More"
          onClick={() => setQty((value) => Math.min(9, value + 1))}
        >
          +
        </button>
      </div>
      <button
        type="button"
        className={styles.btn}
        disabled={!canAfford || busy}
        onClick={() => onBuy(qty)}
        title={canAfford ? undefined : 'You no get money reach'}
      >
        {canAfford ? 'Buy' : 'You no get money reach'}
      </button>
    </article>
  )
}

export function ShopGrid({ items, onBought }: { items: ShopItem[]; onBought?: () => void }) {
  const { state, notifyToast } = useGame()
  const { buy, busy } = useEconomy()
  const cash = state?.cash ?? 0

  if (items.length === 0) {
    return <p className={styles.cardMeta}>Nothing for sale here right now.</p>
  }

  return (
    <div className={styles.grid}>
      {items.map((item) => (
        <ShopItemCard
          key={item.id}
          item={item}
          cash={cash}
          busy={busy}
          onBuy={(qty) => {
            void (async () => {
              const result = await buy(item.id, qty)
              onBought?.()
            })()
          }}
        />
      ))}
    </div>
  )
}
