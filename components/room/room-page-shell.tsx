'use client'

import { Hud } from '@/components/hud/hud'
import { EconomyProvider } from '@/hooks/use-economy'
import { GameProvider, useGame } from '@/hooks/use-game'
import { interiorPlaceId } from '@/lib/game/home-place'
import { PlaceInterior } from './place-interior'
import { RoomScreen } from './room-screen'

/** The Home tab: the inside of where you are. Your own room at your home place, else that place's interior. */
function HomeTab() {
  const { state } = useGame()
  const placeId = interiorPlaceId(state?.locationId, state?.lodgingId)
  return placeId ? <PlaceInterior placeId={placeId} /> : <RoomScreen />
}

export function RoomPageShell() {
  return (
    <GameProvider guest={false}>
      <EconomyProvider>
        <div className="relative h-dvh w-full overflow-hidden">
          <HomeTab />
          <Hud />
        </div>
      </EconomyProvider>
    </GameProvider>
  )
}
