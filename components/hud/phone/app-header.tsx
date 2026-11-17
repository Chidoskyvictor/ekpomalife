import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import styles from './app-header.module.css'

/**
 * One header for every phone app: a 44px back button, the title (one line, ellipsised), an optional
 * subtitle, and an optional slot on the right. Inherits the app's text colour. `bar` adds a hairline underneath.
 */
export function AppHeader({
  title,
  subtitle,
  onBack,
  backLabel = 'Back',
  right,
  bar = false,
}: {
  title: ReactNode
  subtitle?: ReactNode
  onBack: () => void
  backLabel?: string
  right?: ReactNode
  bar?: boolean
}) {
  return (
    <header className={`${styles.header} ${bar ? styles.bar : ''}`}>
      <button type="button" className={styles.back} onClick={onBack} aria-label={backLabel}>
        <ChevronLeft size={24} aria-hidden="true" />
      </button>
      <div className={styles.text}>
        <h2 className={styles.title}>{title}</h2>
        {subtitle ? <p className={styles.sub}>{subtitle}</p> : null}
      </div>
      {right ? <div className={styles.right}>{right}</div> : null}
    </header>
  )
}
