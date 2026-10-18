'use client'

import { JobsPanel } from '@/components/hud/jobs-panel'
import { useGame } from '@/hooks/use-game'

export function JobsApp() {
  const { state } = useGame()
  const placeId = state?.locationId || 'town-shop-1'
  return <JobsPanel placeId={placeId} />
}
