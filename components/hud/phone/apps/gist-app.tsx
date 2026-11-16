'use client'

import { useGame } from '@/hooks/use-game'
import styles from '../phone.module.css'
import { AppEmpty } from '../app-state'

const TONE = {
  good: styles.toneGood,
  bad: styles.toneBad,
  neutral: styles.toneNeutral,
}

export function GistApp() {
  const { state } = useGame()
  const feed = state?.feed ?? []

  if (!feed.length) {
    return <AppEmpty>No news yet. Campus will get busy soon.</AppEmpty>
  }

  return (
    <ol className={styles.list}>
      {feed.map((entry) => (
        <li key={entry.id} className={styles.feedItem}>
          <span className={`${styles.toneDot} ${TONE[entry.tone]}`} aria-hidden="true" />
          <div>
            <p className={styles.promoTitle} style={{ color: '#111' }}>
              {entry.text}
            </p>
            <p className={styles.listMeta}>
              Day {entry.day} · {entry.period}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
