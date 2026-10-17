'use client'

import { AuthGate } from '@/components/auth/auth-gate'
import GameShell from './game-shell'

/** Home/game entry — AuthGate blocks incomplete setup and logged-out users. */
export function GameLoader() {
  return (
    <AuthGate mode="home">
      <GameShell />
    </AuthGate>
  )
}
