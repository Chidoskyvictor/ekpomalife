'use client'

import { useEffect, useState } from 'react'
import { HudDrawer } from '@/components/hud/hud-drawer'
import { fetchVenueTab, type VenueTab } from '@/lib/game/venues-api'
import styles from './club-tab.module.css'

const naira = (n: number) => `₦${n.toLocaleString()}`

/**
 * "Your tab": a pill with what you've spent here tonight and a receipt sheet. The total on the pill
 * comes from the server's visit record; the receipt itself is built on the server from the money
 * ledger (GET /venues/:id/tab), so the app never keeps its own total.
 */
export function ClubTab({
  venueId,
  spent,
  refreshKey,
  className,
}: {
  venueId: string
  spent: number
  refreshKey?: unknown
  /** Style for the button (e.g. a spot chip in the club sheet); defaults to the floating pill. */
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<VenueTab | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let stop = false
    setError(null)
    void fetchVenueTab(venueId).then((res) => {
      if (stop) return
      if (res.ok) setTab(res)
      else setError(res.error)
    })
    return () => {
      stop = true
    }
  }, [open, venueId, refreshKey])

  const arrived = tab ? new Date(tab.arrivedAt) : null
  return (
    <>
      <button type="button" className={className ?? styles.pill} aria-label={`Your tab here: ${naira(spent)}. See the receipt`} onClick={() => setOpen(true)}>
        <span aria-hidden="true">🧾</span> {naira(spent)}
      </button>
      <HudDrawer fit desktopCard open={open} onOpenChange={setOpen} title="Your tab" description={`What you've spent at ${tab?.club.name ?? 'the club'} so far`}>
        {error ? <p className={styles.error}>{error}</p> : null}
        {!tab && !error ? <p className={styles.note}>Loading…</p> : null}
        {tab ? (
          <div className={styles.receipt}>
            <div className={styles.head}>
              <strong>
                {tab.club.emoji} {tab.club.name}
              </strong>
              <span>
                {arrived?.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })} ·{' '}
                {arrived?.toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' })} · still here
              </span>
            </div>
            <hr className={styles.dash} />
            {tab.groups.length ? (
              tab.groups.map((g) => (
                <div key={g.type} className={styles.group}>
                  <small>{g.title}</small>
                  {g.lines.map((l) => (
                    <div key={l.label} className={styles.line}>
                      <span className={styles.label}>
                        <span className={styles.qty}>{l.qty}×</span> {l.label}
                      </span>
                      <span className={styles.amount}>{naira(l.amount)}</span>
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <p className={styles.note}>Nothing yet. Your tab starts when you buy something.</p>
            )}
            <hr className={styles.dash} />
            <div className={`${styles.line} ${styles.total}`}>
              <span>Total</span>
              <span className={styles.amount}>{naira(tab.total)}</span>
            </div>
            <p className={styles.fine}>Everything you paid for here counts. Taxi rides there and back don&apos;t.</p>
          </div>
        ) : null}
      </HudDrawer>
    </>
  )
}
