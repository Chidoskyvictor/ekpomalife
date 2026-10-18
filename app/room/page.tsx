'use client'

import { AuthGate } from '@/components/auth/auth-gate'
import { RoomScreen } from '@/components/room/room-screen'
import { GameProvider } from '@/hooks/use-game'

export default function RoomPage() {
  return (
    <AuthGate mode="home">
      <GameProvider>
        <RoomScreen />
      </GameProvider>
    </AuthGate>
  )
}
