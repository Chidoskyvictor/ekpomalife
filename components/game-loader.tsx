'use client'

import dynamic from 'next/dynamic'

const GameShell = dynamic(() => import('./game-shell'), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh w-full items-center justify-center bg-[#cfe5c4]">
      <p className="animate-pulse text-sm font-semibold text-[#1f7a4c]">Loading Ekpoma…</p>
    </div>
  ),
})

export function GameLoader() {
  return <GameShell />
}
