'use client'

import { useEconomy } from '@/hooks/use-economy'
import { formatNaira } from '@/lib/game/live'
import styles from './economy.module.css'

export function RentCard({ compact = false }: { compact?: boolean }) {
  const { rent, pay, busy } = useEconomy()
  if (!rent || rent.status === 'ok') return null

  const late = rent.status === 'late' || rent.status === 'evicted'
  const dueLabel = new Date(rent.dueAt).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const meta =
    rent.message ||
    (rent.status === 'evicted'
      ? `Evicted · settle ${dueLabel}`
      : late
        ? `Rent is a bit late · due ${dueLabel}. No stress, pay when you can.`
        : `Rent due ${dueLabel}`)

  return (
    <article className={`${styles.rentCard} ${late ? styles.rentLate : ''}`}>
      <div className={styles.cardRow}>
        <div>
          <p className={styles.cardTitle}>
            <span aria-hidden="true">🏠 </span>
            {rent.label ?? 'Baba Landlord'}
          </p>
          <p className={styles.cardMeta}>{meta}</p>
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
