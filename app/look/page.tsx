'use client'

import { AuthGate } from '@/components/auth/auth-gate'
import { LookStudio } from '@/components/look/look-studio'

export default function LookPage() {
  return (
    <AuthGate mode="setup">
      <LookStudio />
    </AuthGate>
  )
}
