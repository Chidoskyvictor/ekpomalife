'use client'

import { useState } from 'react'
import { useEconomy } from '@/hooks/use-economy'
import { useGame } from '@/hooks/use-game'
import { endActivity, startActivity } from '@/lib/game/activity'
import { EAT_SECONDS, dropFood, useCarried } from '@/lib/game/takeaway'
import styles from './takeaway-pill.module.css'

/** The food in your hand (take-out): follows you everywhere until you tap Eat. */
export function TakeawayPill() {
  const carried = useCarried()
  const { useItem } = useEconomy()
  const { notifyToast, refreshServer } = useGame()
  const [eating, setEating] = useState(false)
  const food = carried[0]
  if (!food) return null

  const eat = () => {
    if (eating) return
    setEating(true)
    let stopped = false
    startActivity({
      emoji: food.emoji,
      title: `Eating ${food.name.toLowerCase()}`,
      seconds: EAT_SECONDS,
      onCancel: () => {
        stopped = true
        setEating(false)
      },
    })
    window.setTimeout(async () => {
      if (stopped) return
      const ok = await useItem(food.itemId)
      endActivity()
      setEating(false)
      if (ok) {
        dropFood(food.itemId)
        notifyToast(`${food.emoji} ${food.name}: enjoy!`, true)
        void refreshServer()
      }
    }, EAT_SECONDS * 1000)
  }

  return (
    <div className={styles.pill} role="status">
      <span aria-hidden="true">🥡</span>
      <span className={styles.text}>
        {food.emoji} {food.name}
        {carried.length > 1 ? <em> +{carried.length - 1}</em> : null}
      </span>
      <button type="button" className={styles.eat} disabled={eating} onClick={eat}>
        {eating ? 'Eating…' : 'Eat'}
      </button>
    </div>
  )
}
