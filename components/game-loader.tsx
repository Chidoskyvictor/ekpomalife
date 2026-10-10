'use client'

import dynamic from 'next/dynamic'

const GameShell = dynamic(() => import('./game-shell'), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh w-full items-center justify-center bg-[#3d9ad6]">
      <p className="animate-pulse text-sm font-semibold text-white">Loading Ekpoma…</p>
    </div>
  ),
})

export function GameLoader() {
  return <GameShell />
}
