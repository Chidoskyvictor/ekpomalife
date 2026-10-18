'use client'

import NumberFlow from '@number-flow/react'
import { useEffect, useRef, useState } from 'react'
import { getRideQuote, takeRide } from '@/lib/game/phone-api'
import { PLACES } from '@/lib/game/places'
import type { RideMode } from '@/lib/game/phone'
import { hapticTap } from '@/components/hud/haptic'
import styles from '../phone.module.css'

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

  return (
    <div>
      <label className={styles.sectionTitle} htmlFor="ride-to">
        Where you dey go?
      </label>
      <select
        id="ride-to"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        style={{
          width: '100%',
          minHeight: 44,
          borderRadius: 12,
          border: '1px solid rgba(0,0,0,0.1)',
          padding: '0 12px',
          background: '#fff',
        }}
      >
        <option value="">Pick a place</option>
        {PLACES.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>

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
