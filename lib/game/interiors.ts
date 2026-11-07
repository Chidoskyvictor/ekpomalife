import { hallFor, officeFor } from './halls'
import { MAP_ONLY_PLACES } from './home-place'
import { CLUB_LAYOUTS } from './room-layouts'

/** Places with a real 3D inside (halls, offices, food places, church, hub, Wise Gourmet, the clubs). Others are still being built. */
export function hasBuiltInterior(placeId: string | null | undefined): boolean {
  // The gate is the campus itself: you see it up close on the map, nothing to build inside
  if (!placeId || placeId === 'home' || MAP_ONLY_PLACES.has(placeId)) return true
  return Boolean(hallFor(placeId) || officeFor(placeId) || placeId === 'wise-gourmet' || CLUB_LAYOUTS[placeId])
}
