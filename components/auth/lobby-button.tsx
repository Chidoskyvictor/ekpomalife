'use client'

import type { ButtonHTMLAttributes } from 'react'
import styles from './auth.module.css'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean
}

export function LobbyButton({ loading, children, disabled, className, ...props }: Props) {
  return (
    <button
      {...props}
      className={[styles.play, className].filter(Boolean).join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? (
        <>
          <span className={styles.playSpin} aria-hidden="true" />
          Loading your life...
        </>
      ) : (
        children
      )}
    </button>
  )
}
