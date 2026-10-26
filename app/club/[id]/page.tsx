'use client'

import { useParams } from 'next/navigation'
import { AuthGate } from '@/components/auth/auth-gate'
import { ClubPageShell } from '@/components/club/club-page-shell'

export default function ClubPage() {
  const params = useParams<{ id: string }>()
  return (
    <AuthGate mode="home">
      <ClubPageShell venueId={params?.id ?? 'sazza'} />
    </AuthGate>
  )
}
