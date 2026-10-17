'use client'

import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import styles from './auth.module.css'

export function LobbyCheckbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  children: ReactNode
}) {
  const reduce = useReducedMotion() ?? false

  return (
    <label className={styles.checkRow}>
      <input
        type="checkbox"
        className={styles.checkNative}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <motion.span
        className={styles.checkBox}
        aria-hidden="true"
        animate={checked && !reduce ? { scale: [0.7, 1.12, 1] } : { scale: 1 }}
        transition={{ duration: 0.22 }}
        data-on={checked ? '' : undefined}
      >
        {checked ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2.5 7.2 5.4 10l6.1-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </motion.span>
      <span className={styles.checkCopy}>{children}</span>
    </label>
  )
}
