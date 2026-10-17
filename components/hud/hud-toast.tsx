'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { Toast } from '@/hooks/use-game'
import styles from './life-hud.module.css'

const spring = { type: 'spring' as const, stiffness: 400, damping: 32 }

export function HudToast({ toast }: { toast: Toast | null }) {
  const reduced = useReducedMotion() ?? false

  return (
    <div className={styles.toastSlot} aria-live="polite">
      <AnimatePresence mode="popLayout">
        {toast ? (
          <motion.p
            key={toast.id}
            className={`${styles.panel} ${styles.toast} ${toast.ok ? styles.toastOk : styles.toastBad}`}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={reduced ? { duration: 0 } : spring}
          >
            {toast.text}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
