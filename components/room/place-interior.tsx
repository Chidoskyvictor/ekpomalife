'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getPlace } from '@/lib/game/places'
import { markSceneReady, useTrip } from '@/lib/game/trip'
import { pushNavigation } from '@/lib/navigation/safe-nav'
import styles from './place-interior.module.css'

const EMOJI: Record<string, string> = {
  campus: '🎓',
  hostel: '🛏️',
  food: '🍲',
  shop: '🛒',
  leisure: '🎉',
  worship: '⛪',
  community: '🏥',
}

/**
 * The inside of the place you're at. Until each interior is modelled (`/models/interiors/<placeId>.glb`
 * is where it would load from) this is a stand-in, but the flow around it is real: arriving lands
 * here, Map leaves from here, and the next ride starts from this place.
 */
export function PlaceInterior({ placeId }: { placeId: string }) {
  const router = useRouter()
  const place = getPlace(placeId)

  // The trip that brought you here holds its screen until this is up. A fresh page starts from the
  // saved place before the server answers, so only the place the trip is heading to counts.
  const trip = useTrip()
  const wrongPlace = trip?.scene === 'interior' && trip.target !== placeId
  useEffect(() => {
    if (wrongPlace) return
    markSceneReady('interior')
    return () => markSceneReady('interior', false)
  }, [placeId, wrongPlace])

  return (
    <div className={styles.stage}>
      <span className={styles.emoji} aria-hidden="true">
        {EMOJI[place?.type ?? ''] ?? '📍'}
      </span>
      <h1 className={styles.title}>{place?.label ?? 'Inside'}</h1>
      <p className={styles.note}>You’re inside. The interior is on its way.</p>
      <div className={styles.actions}>
        <button type="button" className={styles.action} onClick={() => pushNavigation(router, '/', '/room')}>
          🗺️ Map
        </button>
      </div>
    </div>
  )
}
