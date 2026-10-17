'use client'

import { AuthGate } from '@/components/auth/auth-gate'
import { DreamStudio } from '@/components/dreams/dream-studio'

export default function DreamPage() {
  return (
    <AuthGate mode="setup">
      <DreamStudio />
    </AuthGate>
  )
}
