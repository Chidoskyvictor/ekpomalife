'use client'

import { useParams } from 'next/navigation'
import { useGame } from '@/hooks/use-game'
import { interiorPlaceId } from '@/lib/game/home-place'
import { PlaceInterior } from './place-interior'
import { RoomScreen } from './room-screen'

/** The Home tab: the inside of where you are. Your own room at your home place, else that place's interior. */
export function RoomPageShell() {
  const { state } = useGame()
  // /room/<username>: visiting someone else's house always shows their room, wherever you are
  const params = useParams<{ username?: string }>()
  const visiting = params?.username ? decodeURIComponent(params.username).toLowerCase() : null
  if (visiting && visiting !== (state?.username ?? '').toLowerCase()) return <RoomScreen />
  const placeId = interiorPlaceId(state?.locationId, state?.lodgingId)
  return placeId ? <PlaceInterior placeId={placeId} /> : <RoomScreen />
}
