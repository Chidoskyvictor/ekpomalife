'use client'

import { AuthGate } from '@/components/auth/auth-gate'
import { useAuthGate } from '@/lib/auth/auth-gate-context'
import GameShell from './game-shell'

function HomeGame() {
  const { me } = useAuthGate()
  return <GameShell guest={!me} />
}

/** Home entry — guests explore the map; logged-in players need completed setup. */
export function GameLoader() {
  return (
    <AuthGate mode="home">
      <HomeGame />
    </AuthGate>
  )
}
