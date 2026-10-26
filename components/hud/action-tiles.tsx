'use client'

import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cancelActivity, useActivity, useActivityQueue } from '@/lib/game/activity'
import styles from './action-tiles.module.css'

/**
 * Sims-style action queue at the left edge: the running action is a square tile that fills up from
 * the bottom with the seconds left under it; the ones lined up next sit after it, dimmed. The ✕ on
 * a tile cancels it.
 */
export function ActionTiles() {
  const activity = useActivity()
  const queue = useActivityQueue()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!activity) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(id)
  }, [activity])

  if (!activity && !queue.length) return null
  const done = activity ? Math.min(1, (now - activity.startedAt) / (activity.seconds * 1000)) : 0
  const left = activity ? Math.max(0, Math.ceil(activity.seconds - (now - activity.startedAt) / 1000)) : 0

  return (
    <div className={styles.row} role="list" aria-label="What you're doing">
      {activity ? (
        <div className={styles.slot} role="listitem">
          <div className={`${styles.tile} ${styles.running}`} title={activity.title}>
            <span className={styles.fill} style={{ height: `${done * 100}%` }} aria-hidden="true" />
            <span className={styles.emoji} aria-hidden="true">
              {activity.emoji}
            </span>
            <button type="button" className={styles.cancel} onClick={cancelActivity} aria-label={`Stop ${activity.title}`}>
              <X size={11} strokeWidth={3} />
            </button>
          </div>
          <span className={styles.caption} aria-label={`${activity.title}, ${left} seconds left`}>
            {left}s
          </span>
        </div>
      ) : null}
      {queue.map((q) => (
        <div key={q.key} className={styles.slot} role="listitem">
          <div className={`${styles.tile} ${styles.waiting}`} title={`${q.title} (next)`}>
            <span className={styles.emoji} aria-hidden="true">
              {q.emoji}
            </span>
            <button type="button" className={styles.cancel} onClick={q.onRemove} aria-label={`Remove ${q.title}`}>
              <X size={11} strokeWidth={3} />
            </button>
          </div>
          <span className={styles.caption}>next</span>
        </div>
      ))}
    </div>
  )
}
