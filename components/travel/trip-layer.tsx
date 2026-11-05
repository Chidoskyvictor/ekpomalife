'use client'

import { useEffect } from 'react'
import { endTrip, TRIP_TIMEOUT_MS, useTrip } from '@/lib/game/trip'
import dynamic from 'next/dynamic'

// The ride scene pulls in three.js: loaded only when a trip starts, not on every page
const TripScreen = dynamic(() => import('./trip-screen').then((m) => m.TripScreen), { ssr: false })

/**
 * The trip screen, mounted once in the root layout so it stays up while the next page boots
 * (map ↔ home). It lets the player in once the scene is ready and the ride has "taken" long
 * enough, or TRIP_TIMEOUT_MS after the server moved you whatever happens.
 */
export function TripLayer() {
  const trip = useTrip()

  useEffect(() => {
    if (!trip || trip.done || !trip.moved) return
    // A 3D ride that hasn't drawn yet: wait for it (its clock starts when it shows), give up only after the timeout
    if (trip.drive && !trip.shown && trip.minMs > 0) {
      const id = window.setTimeout(() => endTrip(trip.id), Math.max(0, trip.movedAt + TRIP_TIMEOUT_MS * 2 - Date.now()))
      return () => window.clearTimeout(id)
    }
    const left = Math.max(0, trip.startedAt + trip.minMs - Date.now())
    const wait = trip.ready ? left : Math.max(left, trip.movedAt + TRIP_TIMEOUT_MS - Date.now())
    const id = window.setTimeout(() => endTrip(trip.id), wait)
    return () => window.clearTimeout(id)
  }, [trip])

  return trip ? <TripScreen trip={trip} /> : null
}
