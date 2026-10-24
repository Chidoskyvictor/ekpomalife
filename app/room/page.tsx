'use client'

import { AuthGate } from '@/components/auth/auth-gate'
import { RoomPageShell } from '@/components/room/room-page-shell'

export default function RoomPage() {
  return (
    <AuthGate mode="home">
      <RoomPageShell />
    </AuthGate>
  )
}
