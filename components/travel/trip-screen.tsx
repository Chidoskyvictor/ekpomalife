'use client'

import type { Trip } from '@/lib/game/trip'
import { DriveTrip } from './drive-trip'
import styles from './travel.module.css'

/**
 * Walking: no card and nothing covering the map, just a small "On the way to …" pill at the top
 * (like Lagos Life) until the place is ready.
 */
function TrekFade({ trip }: { trip: Trip }) {
  const icon = trip.mode === 'keke' ? '🛺' : trip.mode === 'okada' ? '🏍️' : '🚶'
  return (
    <div className={styles.trekPill} data-done={trip.done} role="status" aria-live="polite">
      {icon} On the way to {trip.label}…
    </div>
  )
}

/**
 * "On the way to …". Paid rides get the looping highway drive; everything else (walking, okada
 * inside campus, a phone short on memory) gets the small pill over the map. No map card any more.
 */
export function TripScreen({ trip }: { trip: Trip }) {
  if (trip.drive) return <DriveTrip trip={trip} />
  return <TrekFade trip={trip} />
}
