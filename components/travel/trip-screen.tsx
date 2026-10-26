'use client'

import { useEffect, useState } from 'react'
import type { Trip } from '@/lib/game/trip'
import styles from './travel.module.css'

const VEHICLE = { trek: '🚶', keke: '🛺', okada: '🏍️' } as const

/** Campus outline for the little trip map (u, v in 0…1). */
const SPOTS: [number, number][] = [
  [0.085, 0.8], [0.245, 0.28], [0.245, 0.76], [0.32, 0.12], [0.46, 0.2], [0.47, 0.46],
  [0.54, 0.26], [0.54, 0.38], [0.6, 0.46], [0.54, 0.72], [0.7, 0.54], [0.7, 0.7],
  [0.7, 0.38], [0.84, 0.58], [0.975, 0.84], [0.47, 0.74], [0.055, 0.48], [0.5, 0.15],
]

const W = 292
const H = 180
const PAD = 14
const px = (u: number) => PAD + u * (W - PAD * 2)
const py = (v: number) => PAD + v * (H - PAD * 2)

/**
 * "On the way to …": the campus map with your route, the keke / okada / you on foot moving
 * along it, and a progress pill. Holds at 90% until the next scene is ready.
 */
export function TripScreen({ trip }: { trip: Trip }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (trip.done) return
    const id = window.setInterval(() => setNow(Date.now()), 50)
    return () => window.clearInterval(id)
  }, [trip.done])

  const timed = Math.min(1, (now - trip.startedAt) / trip.minMs)
  const progress = trip.done ? 1 : trip.ready ? timed : Math.min(0.9, timed * 0.9)
  const pct = Math.round(progress * 100)
  const [x0, y0, x1, y1] = [px(trip.from.u), py(trip.from.v), px(trip.to.u), py(trip.to.v)]
  // Same spot (you're on your own block): a short hop so the marker still moves
  const [ex, ey] = Math.hypot(x1 - x0, y1 - y0) < 4 ? [x0 + 18, y0] : [x1, y1]
  const mx = x0 + (ex - x0) * progress
  const my = y0 + (ey - y0) * progress

  return (
    <div className={styles.trip} data-done={trip.done} role="status" aria-live="polite">
      <div className={styles.tripCard}>
        <svg className={styles.map} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <rect width={W} height={H} rx="14" fill="#e3f0d8" />
          <path d={`M ${PAD} ${H * 0.62} H ${W - PAD} M ${W * 0.47} ${PAD} V ${H - PAD}`} stroke="#fff" strokeWidth="6" strokeLinecap="round" />
          {SPOTS.map(([u, v]) => (
            <rect key={`${u},${v}`} x={px(u) - 5} y={py(v) - 4} width="10" height="8" rx="2" fill="#c9bfa8" />
          ))}
          <line x1={x0} y1={y0} x2={ex} y2={ey} stroke="#22a35a" strokeWidth="3" strokeDasharray="6 5" strokeLinecap="round" />
          <circle cx={x0} cy={y0} r="5" fill="#1a2233" />
          <circle cx={ex} cy={ey} r="7" fill="#22a35a" stroke="#fff" strokeWidth="2" />
          <text x={mx} y={my + 6} textAnchor="middle" fontSize="18">
            {VEHICLE[trip.mode]}
          </text>
        </svg>
        <p className={styles.tripTitle}>On the way to {trip.label}…</p>
        <div className={styles.pill} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <span className={styles.pillFill} style={{ width: `${pct}%` }} />
          <span className={styles.pillText}>{pct < 100 ? `${pct}%` : 'Arrived'}</span>
        </div>
      </div>
    </div>
  )
}
