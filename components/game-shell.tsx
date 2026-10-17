'use client'

import dynamic from 'next/dynamic'
import { Hud } from '@/components/hud/hud'
import { GameProvider } from '@/hooks/use-game'

const WorldCanvas = dynamic(
  () => import('@/components/world/world-canvas').then((mod) => ({ default: mod.WorldCanvas })),
  {
    ssr: false,
    loading: () => <div className="absolute inset-0 app-wash" aria-hidden="true" />,
  },
)

export default function GameShell() {
  return (
    <GameProvider>
      <main className="relative h-dvh w-full overflow-hidden">
        <h1 className="sr-only">Ekpoma Life</h1>
        <WorldCanvas />
        <Hud />
      </main>
    </GameProvider>
  )
}
