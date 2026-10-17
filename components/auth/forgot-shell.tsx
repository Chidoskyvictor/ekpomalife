'use client'

import Link from 'next/link'
import { motion, useAnimation, useReducedMotion } from 'motion/react'
import { FloatingStickers } from './floating-stickers'
import { ForgotForm } from './forgot-form'
import styles from './auth.module.css'

export function ForgotShell() {
  const reduceMotion = useReducedMotion() ?? false
  const shake = useAnimation()

  const bump = () => {
    if (reduceMotion) return
    void shake.start({ x: [0, -8, 8, -5, 5, 0] }).then(() => shake.set({ x: 0 }))
  }

  return (
    <main className={styles.page}>
      <Link href="/login" className={styles.back}>
        ← Back to log in
      </Link>
      <FloatingStickers />
      <div className={styles.inner}>
        <motion.header
          className={styles.hero}
          initial={reduceMotion ? false : { opacity: 0, y: -24, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={reduceMotion ? { duration: 0 } : { type: 'spring', bounce: 0.55, duration: 0.85 }}
        >
          <img src="/logo.png" alt="" width={64} height={64} className={styles.heroMark} />
          <h1 className={styles.heroTitle}>Ekpoma Life</h1>
        </motion.header>

        <motion.section
          className={styles.card}
          initial={reduceMotion ? false : { opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div animate={shake} transition={{ duration: 0.4 }} className={styles.panel}>
            <ForgotForm onShake={bump} />
          </motion.div>
        </motion.section>
      </div>
    </main>
  )
}
