'use client'

import { motion, useReducedMotion } from 'motion/react'
import { useRef, type ReactNode } from 'react'
import { PHONE_APPS, type PhoneAppId } from '@/lib/game/phone'
import styles from './phone.module.css'

export function AppFrame({
  appId,
  offline,
  onHome,
  children,
}: {
  appId: PhoneAppId
  offline?: boolean
  onHome: () => void
  children: ReactNode
}) {
  const meta = PHONE_APPS.find((a) => a.id === appId)
  const reduced = useReducedMotion() ?? false
  const startY = useRef(0)

  return (
    <motion.div
      layoutId={reduced ? undefined : `app-${appId}`}
      className={styles.appFrame}
      role="region"
      aria-label={meta?.label ?? 'App'}
    >
      <header className={styles.appHeader}>
        <button type="button" className={styles.backBtn} aria-label="Back home" onClick={onHome}>
          ‹
        </button>
        <h2 className={styles.appTitle}>
          <span aria-hidden="true">{meta?.emoji} </span>
          {meta?.label}
        </h2>
      </header>
      <div className={styles.appBody}>
        {offline ? (
          <p className={styles.offlineBanner} role="status">
            You&apos;re offline — buy small data in Settings
          </p>
        ) : null}
        {children}
      </div>
      <div
        className={styles.homeIndicator}
        aria-label="Swipe up for home"
        onPointerDown={(e) => {
          startY.current = e.clientY
        }}
        onPointerUp={(e) => {
          const dy = startY.current - e.clientY
          if (dy > 80) onHome()
        }}
      />
    </motion.div>
  )
}
