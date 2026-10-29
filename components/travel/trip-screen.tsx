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
 * "On the way to …". Paid rides get the looping highway drive; walking gets the campus map with
 * your route and a progress pill. Both hold at 90% until the next scene is ready.
 */
export function TripScreen({ trip }: { trip: Trip }) {
  return trip.drive ? <DriveTrip trip={trip} /> : <MapTrip trip={trip} />
}
