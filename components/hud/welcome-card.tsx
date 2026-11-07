'use client'

import { motion, useReducedMotion } from 'motion/react'
import { AuthLinks } from '@/components/hud/auth-links'
import { motionTokens } from '@/components/arc/lib/motion-tokens'
import { usePlayerStats } from '@/hooks/use-player-stats'
import { LoginExplore } from '@/components/auth/login-explore'
import { SocialRow } from '@/components/seo/social-row'
import styles from './welcome-card.module.css'

/** Below this many players today, the count reads as an empty game: show the plain tagline instead. */
const MIN_SOCIAL_PROOF = 5

/** Decorative faces for the social-proof row (emoji, so nothing extra downloads). */
const FACES = ['👩🏾‍🎓', '🧑🏿‍💻', '👨🏾‍🎤']

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
      <LoginExplore />
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
      <SocialRow />
    </motion.section>
  )
}
