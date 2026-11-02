'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { BuildingPanel } from '@/components/buildings/building-panel'
import { HallScreen } from '@/components/hall/hall-screen'
import { useGame } from '@/hooks/use-game'
import { BUILDINGS } from '@/lib/game/buildings'
import { hallFor, officeFor } from '@/lib/game/halls'
import { getPlace } from '@/lib/game/places'
import { markSceneReady, useTrip } from '@/lib/game/trip'
import { pushNavigation } from '@/lib/navigation/safe-nav'
import styles from './place-interior.module.css'
import { WiseInterior } from './wise-interior'

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
 * The inside of the place you're at. Places with an interior (lib/game/buildings.ts: lectures,
 * club entry, shop…) open their BuildingPanel on arrival; the rest show a stand-in until a 3D
 * interior is modelled (`/models/interiors/<placeId>.glb`). Map leaves from here, and the next
 * ride starts from this place.
 */
export function PlaceInterior({ placeId }: { placeId: string }) {
  // Lecture halls and faculties have a real 3D hall with classmates in it
  if (hallFor(placeId) || officeFor(placeId)) return <HallInterior placeId={placeId} />
  if (placeId === 'wise-gourmet') return <WiseInterior />
  return <StandInInterior placeId={placeId} />
}

/** The 3D lecture hall or office; still tells the trip screen when it's up. */
function HallInterior({ placeId }: { placeId: string }) {
  const trip = useTrip()
  const wrongPlace = trip?.scene === 'interior' && trip.target !== placeId
  useEffect(() => {
    if (wrongPlace) return
    markSceneReady('interior')
    return () => markSceneReady('interior', false)
  }, [placeId, wrongPlace])
  return <HallScreen hallId={placeId} />
}

function StandInInterior({ placeId }: { placeId: string }) {
  const router = useRouter()
  const { selectedId, select } = useGame()
  const place = getPlace(placeId)
  const hasInterior = Boolean(BUILDINGS[placeId])

  // The trip that brought you here holds its screen until this is up. A fresh page starts from the
  // saved place before the server answers, so only the place the trip is heading to counts.
  const trip = useTrip()
  const wrongPlace = trip?.scene === 'interior' && trip.target !== placeId
  useEffect(() => {
    if (wrongPlace) return
    markSceneReady('interior')
    return () => markSceneReady('interior', false)
  }, [placeId, wrongPlace])

  // Arriving opens this place's interior panel once (closing it keeps you here, with "Open" to reopen)
  const openedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!hasInterior || wrongPlace || openedFor.current === placeId) return
    openedFor.current = placeId
    select(placeId)
  }, [hasInterior, placeId, select, wrongPlace])

  const panelOpen = hasInterior && selectedId === placeId

  return (
    <div className={styles.stage}>
      <span className={styles.emoji} aria-hidden="true">
        {EMOJI[place?.type ?? ''] ?? '📍'}
      </span>
      <h1 className={styles.title}>{place?.label ?? 'Inside'}</h1>
      <p className={styles.note}>
        {hasInterior ? 'You’re inside.' : 'You’re inside. The interior is on its way.'}
      </p>
      <div className={styles.actions}>
        {hasInterior ? (
          <button type="button" className={styles.action} onClick={() => select(placeId)}>
            🚪 Open
          </button>
        ) : null}
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            select(null)
            pushNavigation(router, '/', '/room')
          }}
        >
          🗺️ Map
        </button>
      </div>
      {panelOpen ? <BuildingPanel /> : null}
    </div>
  )
}
