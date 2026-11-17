import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import styles from './app-header.module.css'

/** The 44px back chevron on its own, for apps whose header holds custom content (avatar, actions). */
export function BackButton({ onBack, label = 'Back', accent }: { onBack: () => void; label?: string; accent?: string }) {
  return (
    <button type="button" className={styles.back} onClick={onBack} aria-label={label} style={accent ? { color: accent } : undefined}>
      <ChevronLeft size={24} aria-hidden="true" />
    </button>
  )
}

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
  accent,
}: {
  title: ReactNode
  subtitle?: ReactNode
  onBack: () => void
  backLabel?: string
  right?: ReactNode
  bar?: boolean
  /** Colour of the back button when it differs from the text (e.g. iOS blue in Messages). */
  accent?: string
}) {
  return (
    <header className={`${styles.header} ${bar ? styles.bar : ''}`}>
      <BackButton onBack={onBack} label={backLabel} accent={accent} />
      <div className={styles.text}>
        <h2 className={styles.title}>{title}</h2>
        {subtitle ? <p className={styles.sub}>{subtitle}</p> : null}
      </div>
      {right ? <div className={styles.right}>{right}</div> : null}
    </header>
  )
}
