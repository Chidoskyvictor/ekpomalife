import type { OpenHours } from './time.js'
import type { GameActionId } from './actions.js'

export type PlaceType =
  | 'campus'
  | 'hostel'
  | 'food'
  | 'shop'
  | 'transport'
  | 'leisure'
  | 'worship'
  | 'community'

export type Place = {
  id: string
  label: string
  /** Map zone id when this place is a tappable building. */
  zoneId: string
  type: PlaceType
  actions: GameActionId[]
  openHours: OpenHours | null
}

/**
 * One list for map + gameplay. zoneId matches MAP_ZONES (or new zones for
 * Bukka / Keke / Market). Every tappable building should appear here.
 */
export const PLACES: Place[] = [
  {
    id: 'admin-block',
    label: 'Admin Block',
    zoneId: 'admin-block',
    type: 'campus',
    actions: ['study', 'hangout', 'work-placeholder'],
    openHours: { open: 8, close: 17 },
  },
  {
    id: 'ict-exams',
    label: 'ICT',
    zoneId: 'ict-exams',
    type: 'campus',
    actions: ['study', 'work-placeholder'],
    openHours: { open: 8, close: 20 },
  },
  {
    id: 'education',
    label: 'Education',
    zoneId: 'education',
    type: 'campus',
    actions: ['study'],
    openHours: { open: 8, close: 18 },
  },
  {
    id: 'mass-comm',
    label: 'Mass Comm',
    zoneId: 'mass-comm',
    type: 'campus',
    actions: ['study', 'hangout'],
    openHours: { open: 8, close: 18 },
  },
  {
    id: 'students-centre',
    label: 'Student Conference',
    zoneId: 'students-centre',
    type: 'leisure',
    actions: ['hangout', 'eat'],
    openHours: { open: 9, close: 21 },
  },
  {
    id: 'cordelia-hall',
    label: 'Cordelia Agbebaku Hall',
    zoneId: 'cordelia-hall',
    type: 'campus',
    actions: ['study', 'hangout'],
    openHours: { open: 8, close: 20 },
  },
  {
    id: 'sports-complex',
    label: 'Sports Complex',
    zoneId: 'sports-complex',
    type: 'leisure',
    actions: ['hangout', 'shower'],
    openHours: { open: 6, close: 21 },
  },
  {
    id: 'college-of-medicine',
    label: 'College of Medicine',
    zoneId: 'college-of-medicine',
    type: 'campus',
    actions: ['study'],
    openHours: { open: 7, close: 20 },
  },
  {
    id: 'clinic',
    label: 'Clinic',
    zoneId: 'clinic',
    type: 'community',
    actions: ['shower'],
    openHours: { open: 8, close: 18 },
  },
  {
    id: 'school-hostels-1',
    label: 'School Hostels',
    zoneId: 'school-hostels-1',
    type: 'hostel',
    actions: ['sleep', 'shower', 'study'],
    openHours: null,
  },
  {
    id: 'school-hostels-2',
    label: 'School Hostels',
    zoneId: 'school-hostels-2',
    type: 'hostel',
    actions: ['sleep', 'shower'],
    openHours: null,
  },
  {
    id: 'off-campus-hostels',
    label: 'Off-campus Hostels',
    zoneId: 'off-campus-hostels',
    type: 'hostel',
    actions: ['sleep', 'shower'],
    openHours: null,
  },
  {
    id: 'town-shop-1',
    label: 'Campus Shop',
    zoneId: 'town-shop-1',
    type: 'shop',
    actions: ['eat', 'hangout', 'work-placeholder'],
    openHours: { open: 8, close: 20 },
  },
  {
    id: 'relaxation-centre',
    label: 'Relaxation Centre',
    zoneId: 'relaxation-centre',
    type: 'leisure',
    actions: ['hangout'],
    openHours: { open: 10, close: 23 },
  },
  {
    id: 'bukka',
    label: 'Mama Amina Bukka',
    zoneId: 'bukka',
    type: 'food',
    actions: ['eat', 'hangout'],
    openHours: { open: 7, close: 22 },
  },
  {
    id: 'keke-park',
    label: 'Keke Park',
    zoneId: 'keke-park',
    type: 'transport',
    actions: ['travel', 'hangout'],
    openHours: { open: 5, close: 22 },
  },
  {
    id: 'shuttle-park',
    label: 'Shuttle Park',
    zoneId: 'shuttle-park',
    type: 'transport',
    actions: ['travel'],
    openHours: { open: 6, close: 20 },
  },
  {
    id: 'engineering',
    label: 'Engineering',
    zoneId: 'engineering',
    type: 'campus',
    actions: ['study'],
    openHours: { open: 8, close: 18 },
  },
  {
    id: 'law-campus',
    label: 'Law',
    zoneId: 'law-campus',
    type: 'campus',
    actions: ['study'],
    openHours: { open: 8, close: 18 },
  },
  // Buildings with an interior (lib/game/buildings.ts) so tapping them opens the place sheet
  {
    id: 'etf-hall',
    label: 'ETF Hall',
    zoneId: 'etf-hall',
    type: 'campus',
    actions: ['study', 'hangout'],
    openHours: { open: 7, close: 20 },
  },
  {
    id: 'hall-200',
    label: '200 Level Hall',
    zoneId: 'hall-200',
    type: 'campus',
    actions: ['study', 'hangout'],
    openHours: { open: 7, close: 20 },
  },
  {
    id: 'hall-100',
    label: '100 Level Hall',
    zoneId: 'hall-100',
    type: 'campus',
    actions: ['study', 'hangout'],
    openHours: { open: 7, close: 20 },
  },
  {
    id: 'mls-hall',
    label: 'MLS Hall',
    zoneId: 'mls-hall',
    type: 'campus',
    actions: ['study', 'hangout'],
    openHours: { open: 7, close: 20 },
  },
  {
    id: 'twin-hall',
    label: 'Twin Hall',
    zoneId: 'twin-hall',
    type: 'campus',
    actions: ['study', 'hangout'],
    openHours: { open: 7, close: 21 },
  },
  {
    id: 'physical-science',
    label: 'Physical Science',
    zoneId: 'physical-science',
    type: 'campus',
    actions: ['study', 'hangout'],
    openHours: { open: 8, close: 18 },
  },
  {
    id: 'social-science',
    label: 'Social Science',
    zoneId: 'social-science',
    type: 'campus',
    actions: ['study', 'hangout'],
    openHours: { open: 8, close: 18 },
  },
  {
    id: 'life-science',
    label: 'Life Science',
    zoneId: 'life-science',
    type: 'campus',
    actions: ['study', 'hangout'],
    openHours: { open: 8, close: 18 },
  },
  {
    id: 'management-science',
    label: 'Management Science',
    zoneId: 'management-science',
    type: 'campus',
    actions: ['study', 'hangout'],
    openHours: { open: 8, close: 18 },
  },
  {
    id: 'law-ext',
    label: 'Law (extension)',
    zoneId: 'law-ext',
    type: 'campus',
    actions: ['study', 'hangout'],
    openHours: { open: 8, close: 18 },
  },
  {
    id: 'aau-gate',
    label: 'AAU School Gate',
    zoneId: 'aau-gate',
    type: 'campus',
    actions: ['hangout'],
    openHours: null,
  },
  {
    id: 'parking-ext',
    label: 'Parking Lot',
    zoneId: 'parking-ext',
    type: 'transport',
    actions: ['hangout'],
    openHours: null,
  },
  {
    id: 'town-shop-4',
    label: 'Shop',
    zoneId: 'town-shop-4',
    type: 'shop',
    actions: ['eat'],
    openHours: { open: 8, close: 20 },
  },
  {
    id: 'cattle-market',
    label: 'Cattle Market',
    zoneId: 'cattle-market',
    type: 'community',
    actions: ['hangout'],
    openHours: { open: 6, close: 18 },
  },
  {
    id: 'sazza',
    label: 'Sazza',
    zoneId: 'sazza',
    type: 'leisure',
    actions: ['hangout'],
    openHours: { open: 20, close: 4 },
  },
  // Buildings with an interior (lib/game/buildings.ts) so tapping them opens the place sheet
  {
    id: 'market-square',
    label: 'Market Square',
    zoneId: 'market-square',
    type: 'community',
    actions: ['hangout', 'eat'],
    openHours: { open: 6, close: 20 },
  },
  {
    id: 'dubious',
    label: 'Dubious',
    zoneId: 'dubious',
    type: 'leisure',
    actions: ['hangout'],
    openHours: null,
  },
  {
    id: 'innovation-hub',
    label: 'Innovation Hub',
    zoneId: 'innovation-hub',
    type: 'community',
    actions: ['study', 'hangout'],
    openHours: { open: 8, close: 20 },
  },
  {
    id: 'magmus-autos',
    label: 'Magmus Autos',
    zoneId: 'magmus-autos',
    type: 'community',
    actions: ['hangout'],
    openHours: { open: 8, close: 18 },
  },
  {
    id: 'above-the-hills-church',
    label: 'Above the Hills Church',
    zoneId: 'above-the-hills-church',
    type: 'worship',
    actions: ['hangout'],
    openHours: null,
  },
  {
    id: 'wise-gourmet',
    label: 'Wise Gourmet',
    zoneId: 'wise-gourmet',
    type: 'food',
    actions: ['eat'],
    openHours: { open: 8, close: 22 },
  },
  {
    id: 'park',
    label: 'Park',
    zoneId: 'park',
    type: 'leisure',
    actions: ['hangout'],
    openHours: { open: 6, close: 20 },
  },
  {
    id: 'shop-mid-1',
    label: 'Shop',
    zoneId: 'shop-mid-1',
    type: 'shop',
    actions: ['eat'],
    openHours: { open: 8, close: 20 },
  },
  {
    id: 'shop-mid-2',
    label: 'Shop',
    zoneId: 'shop-mid-2',
    type: 'shop',
    actions: ['eat'],
    openHours: { open: 8, close: 20 },
  },
  {
    id: 'forbes',
    label: 'Forbes',
    zoneId: 'forbes',
    type: 'leisure',
    actions: ['hangout'],
    openHours: { open: 20, close: 4 },
  },
  {
    id: 'spot-rite',
    label: 'Spot Rite',
    zoneId: 'spot-rite',
    type: 'food',
    actions: ['eat'],
    openHours: { open: 9, close: 22 },
  },
  {
    id: 'shop-low-1',
    label: 'Shop',
    zoneId: 'shop-low-1',
    type: 'shop',
    actions: ['eat'],
    openHours: { open: 8, close: 20 },
  },
  {
    id: 'shop-low-2',
    label: 'Shop',
    zoneId: 'shop-low-2',
    type: 'shop',
    actions: ['eat'],
    openHours: { open: 8, close: 20 },
  },
  {
    id: 'shop-low-3',
    label: 'Shop',
    zoneId: 'shop-low-3',
    type: 'shop',
    actions: ['eat'],
    openHours: { open: 8, close: 20 },
  },
  {
    id: 'anonymous-zone',
    label: 'Anonymous Zone',
    zoneId: 'anonymous-zone',
    type: 'leisure',
    actions: ['hangout'],
    openHours: null,
  },
  {
    id: 'denco',
    label: 'Denco',
    zoneId: 'denco',
    type: 'community',
    actions: ['hangout'],
    openHours: { open: 8, close: 20 },
  },
  {
    id: 'playchill-climax',
    label: 'Playchill Climax',
    zoneId: 'playchill-climax',
    type: 'leisure',
    actions: ['hangout'],
    openHours: { open: 7, close: 22 },
  },
]

const BY_ID = new Map(PLACES.map((place) => [place.id, place]))
const BY_ZONE = new Map(PLACES.map((place) => [place.zoneId, place]))

export function getPlace(id: string | null | undefined): Place | null {
  if (!id) return null
  return BY_ID.get(id) ?? null
}

export function getPlaceByZone(zoneId: string | null | undefined): Place | null {
  if (!zoneId) return null
  return BY_ZONE.get(zoneId) ?? null
}

export const PLACE_IDS = PLACES.map((place) => place.id)

/**
 * Rough UV from MAP_ZONES (plus hostel placeholders not on the map).
 * Used for ride hop distance — not for rendering.
 */
export const PLACE_UV: Record<string, { u: number; v: number }> = {
  'college-of-medicine': { u: 0.085, v: 0.8 },
  'town-shop-1': { u: 0.245, v: 0.28 },
  bukka: { u: 0.245, v: 0.76 },
  'off-campus-hostels': { u: 0.32, v: 0.12 },
  clinic: { u: 0.46, v: 0.2 },
  'sports-complex': { u: 0.4728, v: 0.4584 },
  'ict-exams': { u: 0.54, v: 0.26 },
  education: { u: 0.54, v: 0.38 },
  'mass-comm': { u: 0.6, v: 0.46 },
  'admin-block': { u: 0.54, v: 0.72 },
  'students-centre': { u: 0.7, v: 0.54 },
  'cordelia-hall': { u: 0.7, v: 0.7 },
  'law-campus': { u: 0.7, v: 0.38 },
  engineering: { u: 0.84, v: 0.58 },
  'shuttle-park': { u: 0.975, v: 0.84 },
  'keke-park': { u: 0.47, v: 0.74 },
  'relaxation-centre': { u: 0.055, v: 0.48 },
  // Hostels removed from map — near campus edge for fare math
  'school-hostels-1': { u: 0.5, v: 0.15 },
  'school-hostels-2': { u: 0.55, v: 0.15 },
  'etf-hall': { u: 0.055, v: 0.4942 },
  'hall-200': { u: 0.115, v: 0.1358 },
  'hall-100': { u: 0.1312, v: 0.3035 },
  'mls-hall': { u: 0.1008, v: 0.6232 },
  'twin-hall': { u: 0.8076, v: 0.7777 },
  'physical-science': { u: 0.6605, v: 0.0742 },
  'social-science': { u: 0.76, v: 0.0779 },
  'life-science': { u: 0.835, v: 0.21 },
  'management-science': { u: 0.8582, v: 0.3953 },
  'law-ext': { u: 0.6, v: 0.28 },
  'aau-gate': { u: 0.5803, v: 0.8821 },
  'parking-ext': { u: 0.72, v: 0.52 },
  'town-shop-4': { u: 0.205, v: 0.64 },
  'cattle-market': { u: 0.32, v: 0.42 },
  'sazza': { u: 0.3596, v: 0.6467 },
  'market-square': { u: 0.0429, v: 1.3591 },
  'dubious': { u: 0.1214, v: 1.32 },
  'innovation-hub': { u: 0.2071, v: 1.32 },
  'magmus-autos': { u: 0.2929, v: 1.2731 },
  'above-the-hills-church': { u: 0.2144, v: 1.6775 },
  'wise-gourmet': { u: 0.4554, v: 1.2731 },
  'park': { u: 0.0429, v: 1.6171 },
  'shop-mid-1': { u: 0.1143, v: 1.5545 },
  'shop-mid-2': { u: 0.1714, v: 1.5545 },
  'forbes': { u: 0.3214, v: 1.5936 },
  'spot-rite': { u: 0.6429, v: 1.5702 },
  'shop-low-1': { u: 0.0429, v: 1.8047 },
  'shop-low-2': { u: 0.0929, v: 1.8047 },
  'shop-low-3': { u: 0.1429, v: 1.8047 },
  'anonymous-zone': { u: 0.3, v: 1.7891 },
  'denco': { u: 0.4, v: 1.7891 },
  'playchill-climax': { u: 0.5143, v: 1.6796 },
}

/** Zone-distance units between two places (min 1 when distinct). */
export function hopDistance(fromPlaceId: string, toPlaceId: string): number | null {
  const a = PLACE_UV[fromPlaceId]
  const b = PLACE_UV[toPlaceId]
  if (!a || !b) return null
  if (fromPlaceId === toPlaceId) return 0
  const hops = Math.round(Math.hypot(a.u - b.u, a.v - b.v) / 0.12)
  return Math.max(1, hops)
}

/** Lodging start → place id. */
export function startPlaceForLodging(lodgingId: string | null | undefined): string {
  if (lodgingId === 'hostel-poultry') return 'school-hostels-1'
  if (lodgingId === 'single-poultry') return 'off-campus-hostels'
  if (lodgingId === 'selfcon-g2') return 'college-of-medicine'
  if (lodgingId === 'onebed-ojo') return 'off-campus-hostels'
  return 'admin-block'
}
