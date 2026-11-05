'use client'

import NumberFlow from '@number-flow/react'
import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { getRideQuote, takeRide } from '@/lib/game/phone-api'
import type { RideMode } from '@/lib/game/phone'
import { hapticTap } from '@/components/hud/haptic'
import styles from '../phone.module.css'
import { RidePicker, rideRows } from './ride-picker'
import pick from './ride-picker.module.css'

export function RideApp({
  cash,
  presetTo,
  onSuccess,
  onFindShift,
  idemKeyFor,
  clearIdem,
}: {
  cash: number
  presetTo?: string | null
  onSuccess: (message: string, nextCash: number) => void
  onFindShift: () => void
  idemKeyFor: (intent: string) => string
  clearIdem: (intent: string) => void
}) {
  const [to, setTo] = useState(presetTo ?? '')
  const [mode, setMode] = useState<RideMode>('keke')
  const [quotes, setQuotes] = useState<Array<{ mode: RideMode; fare: number; minutes: number }> | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const intentRef = useRef<string | null>(null)

  useEffect(() => {
    if (presetTo) setTo(presetTo)
  }, [presetTo])

  useEffect(() => {
    if (!to) {
      setQuotes(null)
      return
    }
    let cancelled = false
    void (async () => {
      const res = await getRideQuote(to)
      if (cancelled) return
      if (!res.ok) {
        setQuotes(null)
        setError(res.error)
        setCode(res.code ?? null)
        return
      }
      setQuotes(res.quotes)
      setError(null)
      setCode(null)
    })()
    return () => {
      cancelled = true
    }
  }, [to])

  const picked = quotes?.find((q) => q.mode === mode)
  const toName = to ? (rideRows(0).find((r) => r.place.id === to)?.name ?? null) : null

  if (picking) {
    return (
      <RidePicker
        value={to}
        onClose={() => setPicking(false)}
        onPick={(id) => {
          setTo(id)
          setPicking(false)
        }}
      />
    )
  }

  return (
    <div>
      <p className={styles.sectionTitle}>Where are you going?</p>
      <button type="button" className={pick.whereBtn} onClick={() => setPicking(true)} aria-haspopup="dialog">
        <span className={pick.whereDot} aria-hidden="true" />
        <span className={toName ? pick.whereName : pick.wherePlaceholder}>{toName ?? 'Where to?'}</span>
        <Search size={18} aria-hidden="true" className={pick.whereIcon} />
      </button>

      {quotes ? (
        <div className={styles.rideCards} role="radiogroup" aria-label="Ride mode">
          {quotes.map((q) => (
            <button
              key={q.mode}
              type="button"
              role="radio"
              aria-checked={mode === q.mode}
              className={`${styles.rideCard} ${mode === q.mode ? styles.rideCardActive : ''}`}
              onClick={() => setMode(q.mode)}
            >
              <div>
                <p className={styles.promoTitle} style={{ color: '#111', margin: 0 }}>
                  {q.mode === 'keke' ? '🛺 Keke' : '🏍️ Okada'}
                </p>
                <p className={styles.listMeta}>{q.minutes} min</p>
              </div>
              <span style={{ fontWeight: 800 }}>₦{q.fare}</span>
            </button>
          ))}
        </div>
      ) : null}

      <p className={styles.listMeta} style={{ marginTop: 12 }}>
        Cash <NumberFlow value={cash} prefix="₦" format={{ maximumFractionDigits: 0 }} />
      </p>

      {error ? <p className={styles.offlineBanner}>{error}</p> : null}

      {code === 'INSUFFICIENT_FUNDS' ? (
        <button type="button" className={styles.primaryPill} onClick={onFindShift}>
          Find a shift
        </button>
      ) : null}

      <button
        type="button"
        className={styles.primaryPill}
        style={{ marginTop: 12, width: '100%' }}
        disabled={!picked || busy}
        onClick={() => {
          if (!picked || !to) return
          void (async () => {
            setBusy(true)
            const intent = `ride:${to}:${mode}`
            intentRef.current = intent
            const key = idemKeyFor(intent)
            const res = await takeRide(to, mode, key)
            setBusy(false)
            if (!res.ok) {
              setError(res.error)
              setCode(res.code ?? null)
              return
            }
            clearIdem(intent)
            hapticTap()
            onSuccess(res.message, res.cash)
          })()
        }}
      >
        {picked ? `Ride for ₦${picked.fare}` : 'Pick destination'}
      </button>
    </div>
  )
}
