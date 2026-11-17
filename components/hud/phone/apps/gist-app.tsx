'use client'

import { useGame } from '@/hooks/use-game'
import phoneStyles from '../phone.module.css'
import styles from './gist-app.module.css'
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
    <ol className={phoneStyles.list}>
      {feed.map((entry) => (
        <li key={entry.id} className={styles.feedItem}>
          <span className={`${styles.toneDot} ${TONE[entry.tone]}`} aria-hidden="true" />
          <div>
            <p className={phoneStyles.promoTitle} style={{ color: '#111' }}>
              {entry.text}
            </p>
            <p className={phoneStyles.listMeta}>
              Day {entry.day} · {entry.period}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
