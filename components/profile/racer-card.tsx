'use client'

import { useEffect, useState } from 'react'
import { BADGES } from '@/lib/game/race-rewards'
import { loadRacer, type RacerCard as Card } from '@/lib/game/race-trials-api'
import styles from './racer-card.module.css'

/** A player's racing card on their profile: racer rank and XP, record, and the badges earned (locked ones greyed with how to get them). */
export function RacerCard({ userId }: { userId: string }) {
  const [card, setCard] = useState<Card | null>(null)
  useEffect(() => {
    let alive = true
    void loadRacer(userId).then((res) => alive && res.ok && setCard(res))
    return () => {
      alive = false
    }
  }, [userId])

  if (!card) return null
  const owned = new Set(card.badges)
  return (
    <section className={styles.card} aria-label="Racing">
      <div className={styles.head}>
        <span className={styles.emoji} aria-hidden="true">
          {card.rank.emoji}
        </span>
        <div className={styles.rank}>
          <strong>{card.rank.name}</strong>
          <small>{card.next ? `${card.next.toGo} XP to ${card.next.emoji} ${card.next.name}` : 'The top rank'}</small>
          <i className={styles.bar} aria-hidden="true">
            <u style={{ width: `${Math.round(card.fraction * 100)}%` }} />
          </i>
        </div>
        <dl className={styles.record}>
          <div>
            <dt>Wins</dt>
            <dd>{card.wins}</dd>
          </div>
          <div>
            <dt>Races</dt>
            <dd>{card.races}</dd>
          </div>
        </dl>
      </div>
      <ul className={styles.badges} aria-label={`Racing badges: ${card.badges.length} of ${BADGES.length}`}>
        {BADGES.map((b) => (
          <li key={b.id} className={owned.has(b.id) ? styles.got : styles.locked} title={b.blurb}>
            <i aria-hidden="true">{owned.has(b.id) ? b.emoji : '🔒'}</i>
            <span>{b.name}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
