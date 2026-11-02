'use client'

import { MapStage } from '@/components/world/map-stage'

/** The map tab. HUD, game state and auth live in PlayShell (root layout) so they survive tab switches. */
export default function GameShell() {
  return <MapStage />
}
