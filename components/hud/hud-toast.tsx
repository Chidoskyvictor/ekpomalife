'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { usePathname, useRouter } from 'next/navigation'
import type { Toast } from '@/hooks/use-game'
import { pushNavigation } from '@/lib/navigation/safe-nav'
import styles from './life-hud.module.css'

const spring = { type: 'spring' as const, stiffness: 400, damping: 32 }

export function HudToast({ toast }: { toast: Toast | null }) {
  const reduced = useReducedMotion() ?? false
  const router = useRouter()
  const pathname = usePathname()

  return (
    <div className={styles.toastSlot} aria-live="polite">
      <AnimatePresence mode="popLayout">
        {toast ? (
          <motion.div
            key={toast.id}
            className={`${styles.panel} ${styles.toast} ${toast.ok ? styles.toastOk : styles.toastBad} ${toast.action ? styles.toastWithAction : ''}`}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={reduced ? { duration: 0 } : spring}
          >
            <span>{toast.text}</span>
            {toast.action ? (
              <button
                type="button"
                className={styles.toastAction}
                onClick={() => pushNavigation(router, toast.action!.href, pathname)}
              >
                {toast.action.label}
              </button>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
