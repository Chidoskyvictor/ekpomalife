'use client'

import { useParams } from 'next/navigation'
import { ClubPageShell } from '@/components/club/club-page-shell'

export default function ClubPage() {
  const params = useParams<{ id: string }>()
  return (
    <ClubPageShell venueId={params?.id ?? 'sazza'} />
  )
}
