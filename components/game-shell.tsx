'use client'

import { Hud } from '@/components/hud/hud'
import { MapStage, OfflineBanner } from '@/components/world/map-stage'
import { EconomyProvider } from '@/hooks/use-economy'
import { GameProvider } from '@/hooks/use-game'

export default function GameShell({ guest = false }: { guest?: boolean }) {
  return (
    <GameProvider guest={guest}>
      <EconomyProvider>
        <main className="relative h-dvh w-full overflow-hidden">
          <h1 className="sr-only">Ekpoma Life</h1>
          <MapStage />
          <Hud />
          <OfflineBanner />
        </main>
      </EconomyProvider>
    </GameProvider>
  )
}
