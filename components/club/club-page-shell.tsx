'use client'

import { Hud } from '@/components/hud/hud'
import { EconomyProvider } from '@/hooks/use-economy'
import { GameProvider } from '@/hooks/use-game'
import { ClubScreen } from './club-screen'

/** Inside a club, with the same play HUD as the map and home. */
export function ClubPageShell({ venueId }: { venueId: string }) {
  return (
    <GameProvider guest={false}>
      <EconomyProvider>
        <div className="relative h-dvh w-full overflow-hidden">
          <ClubScreen venueId={venueId} />
          <Hud />
        </div>
      </EconomyProvider>
    </GameProvider>
  )
}
