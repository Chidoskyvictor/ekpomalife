'use client'

import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import styles from './auth.module.css'

type Props = {
  label: string
  icon: string
  error?: string | null
  hint?: ReactNode
  trailing?: ReactNode
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & { id?: string }

export function LobbyField({ label, icon, error, hint, trailing, id, className, ...props }: Props) {
  const generated = useId()
  const controlId = id ?? generated
  const errorId = error ? `${controlId}-error` : undefined
  const invalid = Boolean(error)

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={controlId}>
        {label}
      </label>
      <div className={styles.inputShell} data-invalid={invalid ? '' : undefined}>
        <span className={styles.inputIcon} aria-hidden="true">
          {icon}
        </span>
        <input
          {...props}
          id={controlId}
          className={[styles.input, trailing ? styles.inputPad : '', className].filter(Boolean).join(' ')}
          aria-invalid={invalid}
          aria-describedby={errorId}
        />
        {trailing}
      </div>
      {hint}
      {error ? (
        <p id={errorId} className={styles.fieldError} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
