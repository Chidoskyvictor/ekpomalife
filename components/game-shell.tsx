'use client'

import dynamic from 'next/dynamic'
import { Hud } from '@/components/hud/hud'
import { EconomyProvider } from '@/hooks/use-economy'
import { GameProvider } from '@/hooks/use-game'

const WorldCanvas = dynamic(
  () => import('@/components/world/world-canvas').then((mod) => ({ default: mod.WorldCanvas })),
  {
    ssr: false,
    loading: () => <div className="absolute inset-0 app-wash" aria-hidden="true" />,
  },
)

export default function GameShell({ guest = false }: { guest?: boolean }) {
  return (
    <GameProvider guest={guest}>
      <EconomyProvider>
        <main className="relative h-dvh w-full overflow-hidden">
          <h1 className="sr-only">Ekpoma Life</h1>
          <WorldCanvas />
          <Hud />
        </main>
      </EconomyProvider>
    </GameProvider>
  )
}
