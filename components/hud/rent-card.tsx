'use client'

import { useEconomy } from '@/hooks/use-economy'
import { formatNaira } from '@/lib/game/live'
import styles from './economy.module.css'

export function RentCard({ compact = false }: { compact?: boolean }) {
  const { rent, pay, busy } = useEconomy()
  if (!rent || rent.status === 'ok') return null

  const late = rent.status === 'late'
  const dueLabel = new Date(rent.dueAt).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  return (
    <article className={`${styles.rentCard} ${late ? styles.rentLate : ''}`}>
      <div className={styles.cardRow}>
        <div>
          <p className={styles.cardTitle}>
            <span aria-hidden="true">🏠 </span>
            {rent.label ?? 'Baba Landlord'}
          </p>
          <p className={styles.cardMeta}>
            {late
              ? `Rent is a bit late · due ${dueLabel}. No wahala, pay when you can.`
              : `Rent due ${dueLabel}`}
          </p>
        </div>
        <span className={styles.pay}>{formatNaira(rent.amount)}</span>
      </div>
      {!compact ? (
        <button type="button" className={styles.btn} disabled={busy} onClick={() => void pay()}>
          Pay rent
        </button>
      ) : null}
    </article>
  )
}
