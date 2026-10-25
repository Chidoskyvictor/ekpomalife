'use client'

import { Hud } from '@/components/hud/hud'
import { EconomyProvider } from '@/hooks/use-economy'
import { GameProvider } from '@/hooks/use-game'
import { RoomScreen } from './room-screen'

/** Home tab — your home (single room, self-con or one bedroom) with the same play HUD as the map. */
export function RoomPageShell() {
  return (
    <GameProvider guest={false}>
      <EconomyProvider>
        <div className="relative h-dvh w-full overflow-hidden">
          <RoomScreen />
          <Hud />
        </div>
      </EconomyProvider>
    </GameProvider>
  )
}
