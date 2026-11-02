import { getPlace } from './places'

/*
 * The Home tab shows the inside of wherever you are. Your own room is only that while you're at
 * your own home place; anywhere else it's the interior of the place you travelled to.
 */

/** Where homes used to be before every player got a house on the map. */
const LEGACY_HOMES = new Set(['school-hostels-1', 'off-campus-hostels', 'college-of-medicine', 'admin-block'])

/** Where each lodging puts you (the same table the server uses to start and send you home). */
export function homePlaceFor(_lodgingId: string | null | undefined): string {
  // Everyone's home is their own house on the map; the lodging only decides the room inside
  return 'home'
}

/** Places you can step inside (parks and the like stay on the map). */
export function hasInterior(placeId: string | null | undefined): boolean {
  const place = getPlace(placeId)
  return Boolean(place) && place!.type !== 'transport'
}

/** The place whose interior the Home tab should show, or null when it should show your own room. */
export function interiorPlaceId(locationId: string | null | undefined, lodgingId: string | null | undefined): string | null {
  if (!locationId || locationId === homePlaceFor(lodgingId)) return null
  // Players saved before the house existed may still be parked at their old hostel spot
  if (LEGACY_HOMES.has(locationId) && locationId !== 'admin-block') return null
  return hasInterior(locationId) ? locationId : null
}

/** Your home's address and kind of place, from your lodging (shown on the house's map sheet). */
export function homeAddress(lodgingId: string | null | undefined): { kind: string; address: string } {
  if (lodgingId === 'hostel-poultry') return { kind: 'Hostel bunk', address: 'Igbinedion Hostel, AAU campus, Ekpoma' }
  if (lodgingId === 'single-poultry') return { kind: 'Single room', address: 'Poultry road, Ekpoma' }
  if (lodgingId === 'selfcon-g2') return { kind: 'Self-con', address: 'By College of Medicine and G1, Ekpoma' }
  if (lodgingId === 'onebed-ojo') return { kind: 'One bedroom', address: 'Ojo street, Ekpoma' }
  return { kind: 'Room', address: 'Ekpoma' }
}
