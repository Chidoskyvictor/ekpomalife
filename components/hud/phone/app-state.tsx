import type { ReactNode } from 'react'
import styles from './app-state.module.css'

/** One loading look for every phone app: a few shimmering rows, with the words for screen readers. */
export function AppLoading({ label = 'Loading…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className={styles.loading} role="status" aria-live="polite">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className={styles.bone} aria-hidden="true" />
      ))}
      <span className={styles.label}>{label}</span>
    </div>
  )
}

/** Nothing to show yet: one calm line (and an optional sticker above it). */
export function AppEmpty({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.empty}>
      {icon ? (
        <span className={styles.emptyIcon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <p>{children}</p>
    </div>
  )
}

/** Something failed: what happened and one way out. */
export function AppError({ children = "Couldn't load this.", onRetry }: { children?: ReactNode; onRetry?: () => void }) {
  return (
    <div className={styles.empty} role="alert">
      <p>{children}</p>
      {onRetry ? (
        <button type="button" className={styles.retry} onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  )
}
