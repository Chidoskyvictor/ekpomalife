'use client'

import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { BodyPortal } from '@/components/ui/body-portal'
import { hapticTap } from './haptic'
import styles from './item-menu.module.css'

/**
 * Small card that pops up when you tap something (a sofa, the bed, the cooker): its name, a fun
 * line and what you can do with it as action cards. Medium-sized in the lower middle so the room
 * stays visible around it; tap outside or ✕ to close.
 */
export function ItemMenu({
  open,
  icon,
  title,
  blurb,
  onClose,
  children,
}: {
  open: boolean
  icon: ReactNode
  title: string
  blurb?: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    hapticTap()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <BodyPortal>
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <section className={styles.card} role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className={styles.head}>
          <span className={styles.icon} aria-hidden="true">
            {icon}
          </span>
          <span className={styles.titles}>
            <strong>{title}</strong>
            {blurb ? <span>{blurb}</span> : null}
          </span>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </section>
    </div>
    </BodyPortal>
  )
}
