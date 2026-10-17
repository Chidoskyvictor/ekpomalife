'use client'

import { AuthGate } from '@/components/auth/auth-gate'
import { LiveStudio } from '@/components/live/live-studio'

export default function LivePage() {
  return (
    <AuthGate mode="setup">
      <LiveStudio />
    </AuthGate>
  )
}
