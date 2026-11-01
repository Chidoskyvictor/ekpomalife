'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { usePathname, useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import type { Toast } from '@/hooks/use-game'
import { pushNavigation } from '@/lib/navigation/safe-nav'
import styles from './life-hud.module.css'

const pop = { type: 'spring' as const, stiffness: 520, damping: 30 }

/**
 * Pop-up notification card: drops in from the top, icon + text (+ optional button), ✕ to dismiss.
 * Used for action results (HudToast) and game notices (IslandToast).
 */
export function NoticeCard({
  id,
  icon,
  tone = 'info',
  children,
  action,
  onDismiss,
}: {
  id: string | number
  icon: ReactNode
  tone?: 'ok' | 'bad' | 'info'
  children: ReactNode
  action?: ReactNode
  onDismiss: () => void
}) {
  const reduced = useReducedMotion() ?? false
  return (
    <motion.div
      key={id}
      role="status"
      className={`${styles.notice} ${tone === 'ok' ? styles.noticeOk : tone === 'bad' ? styles.noticeBad : ''}`}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: -28, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -20, scale: 0.96 }}
      transition={reduced ? { duration: 0 } : pop}
    >
      <span className={styles.noticeIcon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.noticeText}>{children}</span>
      {action}
      <button type="button" className={styles.noticeClose} aria-label="Dismiss" onClick={onDismiss}>
        ✕
      </button>
    </motion.div>
  )
}

export function HudToast({ toast }: { toast: Toast | null }) {
  const router = useRouter()
  const pathname = usePathname()
  // ✕ hides this toast; a new toast (new id) shows again
  const [dismissed, setDismissed] = useState<number | null>(null)
  const shown = toast && toast.id !== dismissed ? toast : null

  return (
    <div className={styles.toastSlot} aria-live="polite">
      <AnimatePresence mode="popLayout">
        {shown ? (
          <NoticeCard
            key={shown.id}
            id={shown.id}
            tone={shown.ok ? 'ok' : 'bad'}
            icon={shown.ok ? '✅' : '⚠️'}
            onDismiss={() => setDismissed(shown.id)}
            action={
              shown.action ? (
                <button
                  type="button"
                  className={styles.toastAction}
                  onClick={() => pushNavigation(router, shown.action!.href, pathname)}
                >
                  {shown.action.label}
                </button>
              ) : null
            }
          >
            {shown.text}
          </NoticeCard>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
