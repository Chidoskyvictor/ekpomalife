'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useRef } from 'react'
import { hapticTap } from '@/components/hud/haptic'
import { useGame } from '@/hooks/use-game'
import { hasInterior } from '@/lib/game/home-place'
import { getPlace } from '@/lib/game/places'
import { newIdempotencyKey } from '@/lib/game/room-api'
import { travel, type TravelOption, type TravelOptions, type TripMode } from '@/lib/game/travel-api'
import { cancelTrip, HOME_STREET_EVENT, startTrip, stashHomeStreet, tripMoved, useTrip } from '@/lib/game/trip'
import { pushNavigation } from '@/lib/navigation/safe-nav'

/**
 * Take the trip to a place: shows the trip screen, asks the server to move you (and charge the
 * fare), then lands you there. Shared by "Where to?" and the place sheet on the map.
 */
export function useGoTo() {
  const { select, refreshServer, notifyToast } = useGame()
  const router = useRouter()
  const pathname = usePathname()
  const trip = useTrip()
  const idem = useRef<{ intent: string; key: string } | null>(null)

  const go = useCallback(
    async (options: TravelOptions, option: TravelOption, how: TripMode, onStart?: () => void) => {
      if (trip) return
      hapticTap()
      onStart?.()
      // Campus is behind the AAU gate: crossing it (either way) shows the gate, staying inside doesn't
      const fromCampus = getPlace(options.from)?.type === 'campus'
      const toCampus = option.type === 'campus'
      // Arriving somewhere you can step inside lands on its interior (the Home tab), not the map
      const interior = !option.home && hasInterior(option.id)
      // Already here: nothing to ride, just step inside
      if (interior && option.hops === 0) {
        select(null)
        if (pathname !== '/room') pushNavigation(router, '/room', pathname)
        return
      }
      const id = startTrip({
        label: option.home ? 'your house' : option.label,
        mode: option.hops === 0 ? 'trek' : how,
        from: options.fromUv,
        to: option.uv,
        scene: option.home ? 'home' : interior ? 'interior' : 'map',
        target: option.id,
        route: fromCampus && toCampus ? 'inside' : toCampus ? 'in' : fromCampus ? 'out' : 'road',
      })
      // One key per intent, reused if the player retries the same ride
      const intent = `${option.id}:${how}`
      if (idem.current?.intent !== intent) idem.current = { intent, key: newIdempotencyKey() }
      let res = await travel(option, how, idem.current.key)
      // Timed out on a slow server: the ride may have gone through, so ask again with the
      // same key (the server replays it instead of charging twice)
      if (!res.ok && res.network) res = await travel(option, how, idem.current.key)
      if (!res.ok) {
        cancelTrip()
        notifyToast(res.error, false)
        return
      }
      idem.current = null
      tripMoved(id)
      void refreshServer()
      if (option.home) {
        if (pathname === '/room') {
          window.dispatchEvent(new CustomEvent(HOME_STREET_EVENT))
        } else {
          stashHomeStreet()
          pushNavigation(router, '/room', pathname)
        }
        return
      }
      if (interior) {
        select(null)
        if (pathname !== '/room') pushNavigation(router, '/room', pathname)
        return
      }
      select(option.id)
      if (pathname !== '/') pushNavigation(router, '/', pathname)
    },
    [trip, notifyToast, refreshServer, pathname, router, select],
  )

  return { go, travelling: Boolean(trip) }
}
