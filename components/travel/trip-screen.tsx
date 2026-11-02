'use client'

import type { Trip } from '@/lib/game/trip'
import { DriveTrip } from './drive-trip'
import { TripMap, tripProgress, useTripClock } from './trip-map'
import styles from './travel.module.css'

/** On foot, or a ride on a phone that can't take the drive: the campus map and a progress pill. */
function MapTrip({ trip }: { trip: Trip }) {
  const now = useTripClock(trip, 50)
  const progress = tripProgress(trip, now)
  const pct = Math.round(progress * 100)

  return (
    <div className={styles.trip} data-done={trip.done} role="status" aria-live="polite">
      <div className={styles.tripCard}>
        <TripMap trip={trip} progress={progress} />
        <p className={styles.tripTitle}>On the way to {trip.label}…</p>
        <div className={styles.pill} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <span className={styles.pillFill} style={{ width: `${pct}%` }} />
          <span className={styles.pillText}>{pct < 100 ? `${pct}%` : 'Arrived'}</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Walking: no card and nothing covering the map, just a small "On the way to …" pill at the top
 * (like Lagos Life) until the place is ready.
 */
function TrekFade({ trip }: { trip: Trip }) {
  return (
    <div className={styles.trekPill} data-done={trip.done} role="status" aria-live="polite">
      🚶 On the way to {trip.label}…
    </div>
  )
}

/**
 * "On the way to …". Paid rides get the looping highway drive; walking is a short fade (TrekFade); a
 * ride on a phone that can't take the drive gets the campus map with a progress pill. Both hold at 90% until the next scene is ready.
 */
export function TripScreen({ trip }: { trip: Trip }) {
  if (trip.drive) return <DriveTrip trip={trip} />
  return trip.mode === 'trek' ? <TrekFade trip={trip} /> : <MapTrip trip={trip} />
}
