'use client'

import { motion, useReducedMotion } from 'motion/react'
import { AuthLinks } from '@/components/hud/auth-links'
import { motionTokens } from '@/components/arc/lib/motion-tokens'
import { usePlayerStats } from '@/hooks/use-player-stats'
import styles from './welcome-card.module.css'

export function WelcomeCard() {
  const { players } = usePlayerStats()
  const reduceMotion = useReducedMotion() ?? false

  return (
    <motion.section
      aria-label="Join Ekpoma Life"
      className={styles.card}
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : motionTokens.spring.smooth}
    >
      <p className={styles.status}>
        {players != null ? (
          <>
            <span className={styles.dot} aria-hidden="true">
              <span className={styles.pulse} />
              <span className={styles.live} />
            </span>
            <span className={styles.label}>
              <span className={styles.count}>{players.toLocaleString()}</span> players on campus
            </span>
          </>
        ) : (
          <span className={styles.label}>Be one of the first on campus</span>
        )}
      </p>
      <AuthLinks size="lg" signupFirst variant="lobby" />
    </motion.section>
  )
}
