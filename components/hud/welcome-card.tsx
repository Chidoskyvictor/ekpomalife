'use client'

import { motion, useReducedMotion } from 'motion/react'
import { AuthLinks } from '@/components/hud/auth-links'
import { motionTokens } from '@/components/arc/lib/motion-tokens'
import { usePlayerStats } from '@/hooks/use-player-stats'
import styles from './welcome-card.module.css'

/** Below this many players today, the count reads as an empty game: show the plain tagline instead. */
const MIN_SOCIAL_PROOF = 5

/** Decorative faces for the social-proof row (emoji, so nothing extra downloads). */
const FACES = ['👩🏾‍🎓', '🧑🏿‍💻', '👨🏾‍🎤']

const X_URL = 'https://x.com/EkpomaLifeApp'

export function WelcomeCard() {
  const { today } = usePlayerStats()
  const reduceMotion = useReducedMotion() ?? false
  const showProof = today != null && today >= MIN_SOCIAL_PROOF

  return (
    <motion.section
      aria-label="Join Ekpoma Life"
      className={styles.card}
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : motionTokens.spring.smooth}
    >
      <p className={styles.proof}>
        {showProof ? (
          <>
            <span className={styles.faces} aria-hidden="true">
              {FACES.map((face) => (
                <span key={face} className={styles.face}>
                  {face}
                </span>
              ))}
            </span>
            <span className={styles.proofText}>
              <strong className={styles.count}>{today.toLocaleString()}</strong> students played today · free
            </span>
          </>
        ) : (
          <span className={styles.proofText}>Free · Made for AAU</span>
        )}
      </p>
      <AuthLinks size="lg" signupFirst variant="lobby" signupLabel="Sign up free" />
      <a className={styles.social} href={X_URL} target="_blank" rel="noopener noreferrer">
        <svg className={styles.socialIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            fill="currentColor"
            d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
          />
        </svg>
        Follow @EkpomaLifeApp
      </a>
    </motion.section>
  )
}
