'use client'

import { useEffect } from 'react'
import { endTrip, TRIP_TIMEOUT_MS, useTrip } from '@/lib/game/trip'
import { TripScreen } from './trip-screen'

/**
 * The trip screen, mounted once in the root layout so it stays up while the next page boots
 * (map ↔ home). It lets the player in once the scene is ready and the ride has "taken" long
 * enough, or TRIP_TIMEOUT_MS after the server moved you whatever happens.
 */
export function TripLayer() {
  const trip = useTrip()

  useEffect(() => {
    if (!trip || trip.done || !trip.moved) return
    const left = Math.max(0, trip.startedAt + trip.minMs - Date.now())
    const wait = trip.ready ? left : Math.max(left, trip.movedAt + TRIP_TIMEOUT_MS - Date.now())
    const id = window.setTimeout(() => endTrip(trip.id), wait)
    return () => window.clearTimeout(id)
  }, [trip])

  return trip ? <TripScreen trip={trip} /> : null
}
