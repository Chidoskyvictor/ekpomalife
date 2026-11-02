'use client'

import { useGame } from '@/hooks/use-game'
import { interiorPlaceId } from '@/lib/game/home-place'
import { PlaceInterior } from './place-interior'
import { RoomScreen } from './room-screen'

/** The Home tab: the inside of where you are. Your own room at your home place, else that place's interior. */
export function RoomPageShell() {
  const { state } = useGame()
  const placeId = interiorPlaceId(state?.locationId, state?.lodgingId)
  return placeId ? <PlaceInterior placeId={placeId} /> : <RoomScreen />
}
