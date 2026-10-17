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
    label: "Students' Centre",
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
    id: 'market',
    label: 'Ekpoma Market',
    zoneId: 'market',
    type: 'shop',
    actions: ['eat', 'hangout', 'work-placeholder'],
    openHours: { open: 7, close: 19 },
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

/** Lodging start → place id. */
export function startPlaceForLodging(lodgingId: string | null | undefined): string {
  if (lodgingId === 'hostel-poultry') return 'school-hostels-1'
  if (lodgingId === 'selfcon-oxford') return 'off-campus-hostels'
  if (lodgingId === 'selfcon-g2') return 'college-of-medicine'
  if (lodgingId === 'onebed-ojo') return 'off-campus-hostels'
  return 'admin-block'
}
