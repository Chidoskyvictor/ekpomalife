import { isCourseId } from './aau-courses'

export type CharacterTypeId = 'student' | 'lecturer' | 'indigene' | 'casual' | 'graduate'

export type LodgingId = 'hostel-poultry' | 'single-poultry' | 'selfcon-g2' | 'onebed-ojo'

export type CharacterType = {
  id: CharacterTypeId
  label: string
}

export type Lodging = {
  id: LodgingId
  icon: string
  photo?: boolean
  title: string
  badge: string
  badgeTone?: 'student' | 'onebed'
  description: string
  /** Weekly rent only — starting cash is rolled on the server. */
  rentWeekly: number
  /** Rent paid in advance, taken from the starting money when you move in. Mirrors backend/src/game/lodging.ts. */
  moveInFee: number
  startLocationId: string
  /** Only students can live here (the Igbinedion hostel). */
  studentOnly?: boolean
}

export const CHARACTER_TYPES: CharacterType[] = [
  { id: 'student', label: 'Student' },
  { id: 'graduate', label: 'Graduate' },
  { id: 'lecturer', label: 'Lecturer' },
  { id: 'indigene', label: 'Indigene' },
  { id: 'casual', label: 'Casual' },
]

export const LODGINGS: Lodging[] = [
  {
    id: 'hostel-poultry',
    icon: '/aau.jpg',
    photo: true,
    title: 'AAU student · Ekpoma',
    badge: 'Student life',
    badgeTone: 'student',
    description:
      'A bunk in Igbinedion Hostel on campus. Lectures, night class, hostel life, exams, CGPA, and sign-out day.',
    rentWeekly: 1200,
    moveInFee: 0,
    startLocationId: 'school-hostels-1',
    studentOnly: true,
  },
  {
    id: 'single-poultry',
    icon: '/emoji/house.png',
    title: 'Single room · Poultry road',
    badge: 'Single room',
    description: 'One room on Poultry road: bed, toilet and bucket all inside. Off campus, cheapest rent.',
    rentWeekly: 2500,
    moveInFee: 150_000,
    startLocationId: 'off-campus-hostels',
  },
  {
    id: 'selfcon-g2',
    icon: '/emoji/house.png',
    title: 'Self-con · College of Medicine · G1',
    badge: 'Self-con',
    description: 'Your room plus your own toilet, bath and kitchen, by College of Medicine and G1. Walk to class.',
    rentWeekly: 3000,
    moveInFee: 250_000,
    startLocationId: 'college-of-medicine',
  },
  {
    id: 'onebed-ojo',
    icon: '/emoji/bed.png',
    title: 'One bedroom · Ojo street',
    badge: 'One bedroom',
    badgeTone: 'onebed',
    description: 'Parlour, separate bedroom, kitchen and bath on Ojo street. More space, more rent, more peace.',
    rentWeekly: 10_500,
    moveInFee: 400_000,
    startLocationId: 'off-campus-hostels',
  },
]

const TYPE_IDS = new Set<CharacterTypeId>(CHARACTER_TYPES.map((item) => item.id))
const LODGING_BY_ID = new Map(LODGINGS.map((item) => [item.id, item]))

export function isCharacterTypeId(value: string | null | undefined): value is CharacterTypeId {
  return Boolean(value && TYPE_IDS.has(value as CharacterTypeId))
}

export function normalizeCharacterType(input?: string | null): CharacterTypeId | null {
  return isCharacterTypeId(input) ? input : null
}

/** Old ids still sitting in saved sign-up drafts. */
const RENAMED_LODGINGS: Record<string, LodgingId> = { 'selfcon-oxford': 'single-poultry' }

export function getLodging(id: string | null | undefined): Lodging | null {
  if (!id) return null
  return LODGING_BY_ID.get((RENAMED_LODGINGS[id] ?? id) as LodgingId) ?? null
}

export function normalizeLodgingId(input?: string | null): LodgingId | null {
  return getLodging(input)?.id ?? null
}

/** A course is kept only for students, and only if it is on the AAU list. */
export function normalizeCourseId(characterType: string | null | undefined, courseId?: string | null) {
  return characterType === 'student' && isCourseId(courseId) ? courseId : null
}

/** Students pick a course (wherever they live); everyone else has none. */
export const needsCourse = (characterType: string | null | undefined) => characterType === 'student'

/** Houses this kind of character can choose from. */
export const lodgingsFor = (characterType: string | null | undefined) =>
  LODGINGS.filter((lodging) => !lodging.studentOnly || characterType === 'student')

/** Can this much cash cover the house's move-in fee? */
export const canAffordLodging = (lodging: Pick<Lodging, 'moveInFee'>, cash: number) => cash >= lodging.moveInFee

export function formatNaira(value: number) {
  return `₦${Math.max(0, Math.round(value)).toLocaleString()}`
}
