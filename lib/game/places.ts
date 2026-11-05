/** Shared place ids — mirror backend/src/game/places.ts */

export type GameActionId =
  | 'eat'
  | 'sleep'
  | 'shower'
  | 'study'
  | 'hangout'
  | 'travel'
  | 'work-placeholder'
  // Room furniture (Home tab)
  | 'nap'
  | 'rest'
  | 'toilet'
  | 'bucket-bath'
  | 'cook'
  // Building interiors (Phase 3 UI → server POST /game/action)
  | 'pay-school-fees'
  // AAU school (POST /school/action)
  | 'pay-acceptance'
  | 'pay-installment-1'
  | 'pay-installment-2'
  | 'pay-full-session'
  | 'evening-tutorial'
  | 'student-portal'
  | 'course-registration'
  | 'collect-matric-gown'
  | 'collect-id-card'
  | 'convocation-clearance'
  | 'convocation-gown'
  | 'convocation-ceremony'
  | 'check-result'
  | 'attend-lecture'
  | 'submit-assignment'
  | 'take-quiz'
  | 'night-class'
  | 'write-exam'
  | 'exams-pointer'
  | 'clinic-treat'
  | 'sports-train'
  | 'centre-hangout'
  | 'meet-hod'
  | 'change-course'
  | 'see-vc'
  | 'fees-receipt'
  | 'faculty-notices'
  | 'shuttle-travel'

export type PlaceType =
  | 'campus'
  | 'hostel'
  | 'food'
  | 'shop'
  | 'transport'
  | 'leisure'
  | 'worship'
  | 'community'

export type OpenHours = { open: number; close: number }

export type Place = {
  id: string
  label: string
  zoneId: string
  type: PlaceType
  actions: GameActionId[]
  openHours: OpenHours | null
}

export const ACTION_LABELS: Partial<Record<GameActionId, { label: string; hint: string }>> = {
  eat: { label: 'Eat', hint: 'Plate of rice. Fill hunger.' },
  sleep: { label: 'Sleep', hint: 'Rest and refill energy.' },
  shower: { label: 'Shower', hint: 'Fresh body, clear head.' },
  study: { label: 'Study', hint: 'The books are calling.' },
  hangout: { label: 'Hang out', hint: 'Chat and relax.' },
  travel: { label: 'Travel', hint: 'Move to another place (keke).' },
  'work-placeholder': { label: 'Side hustle', hint: 'Earn a small wage.' },
}

export const PLACES: Place[] = [
  {
    id: 'home',
    label: 'My Home',
    zoneId: 'home',
    type: 'hostel',
    actions: ['sleep', 'shower', 'study'],
    openHours: null,
  },
  {
    id: 'admin-block',
    label: 'Admin Block',
    zoneId: 'admin-block',
    type: 'campus',
    // Admin work only (fees, course change, see the VC…): no studying or hanging out here
    actions: ['work-placeholder'],
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
    openHours: null, // rides run day and night
  },
  {
    id: 'shuttle-park',
    label: 'Shuttle Park',
    zoneId: 'shuttle-park',
    type: 'transport',
    actions: ['travel'],
    openHours: null, // rides run day and night
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
    id: 'aau-gate',
    label: 'AAU School Gate',
    zoneId: 'aau-gate',
    type: 'campus',
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
    openHours: { open: 20, close: 5 },
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
    label: 'Dublous',
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
    openHours: { open: 21, close: 5 },
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
    label: 'Play and Chill',
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
  return BY_ZONE.get(zoneId) ?? BY_ID.get(zoneId) ?? null
}

export function isGameplayPlace(id: string) {
  return BY_ID.has(id) || BY_ZONE.has(id)
}
