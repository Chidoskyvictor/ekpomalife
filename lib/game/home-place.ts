import { getPlace } from './places'

/*
 * The Home tab shows the inside of wherever you are. Your own room is only that while you're at
 * your own home place; anywhere else it's the interior of the place you travelled to.
 */

/** Where each lodging puts you (the same table the server uses to start and send you home). */
export function homePlaceFor(lodgingId: string | null | undefined): string {
  if (lodgingId === 'hostel-poultry') return 'school-hostels-1'
  if (lodgingId === 'single-poultry') return 'off-campus-hostels'
  if (lodgingId === 'selfcon-g2') return 'college-of-medicine'
  if (lodgingId === 'onebed-ojo') return 'off-campus-hostels'
  return 'admin-block'
}

/** Places you can step inside (parks and the like stay on the map). */
export function hasInterior(placeId: string | null | undefined): boolean {
  const place = getPlace(placeId)
  return Boolean(place) && place!.type !== 'transport'
}

/** The place whose interior the Home tab should show, or null when it should show your own room. */
export function interiorPlaceId(locationId: string | null | undefined, lodgingId: string | null | undefined): string | null {
  if (!locationId || locationId === homePlaceFor(lodgingId)) return null
  return hasInterior(locationId) ? locationId : null
}
