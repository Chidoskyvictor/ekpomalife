'use client'

import { ClubScreen } from './club-screen'

/** Inside a club. The play HUD comes from PlayShell, shared with the map and Home. */
export function ClubPageShell({ venueId }: { venueId: string }) {
  return <ClubScreen venueId={venueId} />
}
