'use client'

import { useEffect } from 'react'
import NumberFlow from '@number-flow/react'
import { useEconomy } from '@/hooks/use-economy'
import { useGame } from '@/hooks/use-game'
import styles from './economy.module.css'

function timeLabel(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function BankScreen() {
  const { state } = useGame()
  const { ledger, ledgerCash, loading, loadLedger } = useEconomy()

  useEffect(() => {
    void loadLedger()
  }, [loadLedger])

  const balance = ledgerCash ?? state?.cash ?? 0

  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Bank</p>
      <div className={styles.card}>
        <p className={styles.cardMeta}>Balance</p>
        <p className={styles.cardTitle} style={{ fontSize: '1.4rem' }}>
          <NumberFlow
            value={balance}
            prefix="₦"
            format={{ maximumFractionDigits: 0 }}
            locales="en-NG"
          />
        </p>
      </div>
      <p className={styles.sectionTitle}>Recent</p>
      {loading && ledger.length === 0 ? (
        <>
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
        </>
      ) : (
        <div className={styles.ledgerList}>
          {ledger.map((entry) => (
            <div key={entry.id} className={styles.ledgerRow}>
              <div>
                <p className={styles.cardTitle}>{entry.reason}</p>
                <p className={styles.cardMeta}>{timeLabel(entry.createdAt)}</p>
              </div>
              <span className={entry.amount >= 0 ? styles.ledgerUp : styles.ledgerDown}>
                {entry.amount >= 0 ? '+' : '−'}₦{Math.abs(entry.amount).toLocaleString()}
              </span>
            </div>
          ))}
          {ledger.length === 0 ? <p className={styles.cardMeta}>No transactions yet.</p> : null}
        </div>
      )}
    </div>
  )
}
