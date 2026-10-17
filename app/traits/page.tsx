'use client'

import { AuthGate } from '@/components/auth/auth-gate'
import { TraitStudio } from '@/components/traits/trait-studio'

export default function TraitsPage() {
  return (
    <AuthGate mode="setup">
      <TraitStudio />
    </AuthGate>
  )
}
