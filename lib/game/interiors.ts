import { hallFor, officeFor } from './halls'
import { CLUB_LAYOUTS } from './room-layouts'

/** Places with a real 3D inside (halls, offices, food places, church, hub, Wise Gourmet, the clubs). Others are still being built. */
export function hasBuiltInterior(placeId: string | null | undefined): boolean {
  if (!placeId || placeId === 'home') return true
  return Boolean(hallFor(placeId) || officeFor(placeId) || placeId === 'wise-gourmet' || CLUB_LAYOUTS[placeId])
}
