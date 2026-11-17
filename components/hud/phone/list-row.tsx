import type { ReactNode } from 'react'
import styles from './list-row.module.css'

/**
 * One list row for phone apps. Renders a button when `onClick` is given, otherwise a plain div.
 * Pass `className` to keep an app's own card look (background, border, radius).
 */
export function ListRow({
  lead,
  title,
  subtitle,
  trailing,
  onClick,
  className = '',
  ariaLabel,
}: {
  lead?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
  className?: string
  ariaLabel?: string
}) {
  const inner = (
    <>
      {lead ? <span className={styles.lead}>{lead}</span> : null}
      <span className={styles.body}>
        <span className={styles.title}>{title}</span>
        {subtitle ? <span className={styles.sub}>{subtitle}</span> : null}
      </span>
      {trailing ? <span className={styles.trail}>{trailing}</span> : null}
    </>
  )
  const cls = `${styles.row} ${className}`
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} aria-label={ariaLabel}>
      {inner}
    </button>
  ) : (
    <div className={cls} aria-label={ariaLabel}>
      {inner}
    </div>
  )
}
