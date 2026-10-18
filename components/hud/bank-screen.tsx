'use client'

import { useEffect, useRef } from 'react'
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
  const {
    ledger,
    ledgerCash,
    ledgerNextCursor,
    loading,
    networkDown,
    loadLedger,
    loadMoreLedger,
  } = useEconomy()
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void loadLedger()
  }, [loadLedger])

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !ledgerNextCursor) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMoreLedger()
        }
      },
      { rootMargin: '80px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [ledgerNextCursor, loadMoreLedger])

  const balance = networkDown ? null : (ledgerCash ?? state?.cash ?? null)

  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Bank</p>
      <div className={styles.card}>
        <p className={styles.cardMeta}>Balance</p>
        <p className={styles.cardTitle} style={{ fontSize: '1.4rem' }}>
          {balance == null ? (
            networkDown ? (
              "Can't reach the server, retrying…"
            ) : (
              '—'
            )
          ) : (
            <NumberFlow
              value={balance}
              prefix="₦"
              format={{ maximumFractionDigits: 0 }}
              locales="en-NG"
            />
          )}
        </p>
      </div>
      <p className={styles.sectionTitle}>Recent</p>
      {networkDown && ledger.length === 0 ? (
        <p className={styles.cardMeta}>Can&apos;t reach the server, retrying…</p>
      ) : null}
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
          {ledger.length === 0 && !networkDown ? (
            <p className={styles.cardMeta}>No transactions yet.</p>
          ) : null}
          {ledgerNextCursor ? <div ref={sentinelRef} aria-hidden="true" /> : null}
        </div>
      )}
    </div>
  )
}
