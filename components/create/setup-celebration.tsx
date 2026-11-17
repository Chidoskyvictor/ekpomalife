'use client'

import { useLowPerf } from '@/hooks/use-low-perf'
import styles from './setup-celebration.module.css'

const COLORS = ['#fbbf24', '#f472b6', '#34d399', '#60a5fa', '#ffffff']

/** How long the moment stays up before entering the game (static, so short, when motion is off). */
export function celebrationMs(lowPerf: boolean) {
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return reduce || lowPerf ? 900 : 1700
}

export function SetupCelebration({ name }: { name: string }) {
  const lowPerf = useLowPerf()
  return (
    <div className={styles.overlay} role="status" aria-live="polite">
      {lowPerf
        ? null
        : Array.from({ length: 24 }, (_, i) => (
            <span
              key={i}
              className={styles.confetti}
              aria-hidden="true"
              style={{
                left: `${(i * 37) % 100}%`,
                background: COLORS[i % COLORS.length],
                animationDelay: `${(i % 8) * 0.09}s`,
              }}
            />
          ))}
      <p className={`${styles.title} ${styles.pop}`}>You&apos;re in{name ? `, ${name}` : ''}!</p>
      <p className={styles.sub}>Welcome to Ekpoma Life</p>
    </div>
  )
}
