export type CharacterTypeId = 'student' | 'lecturer' | 'indigene' | 'casual' | 'graduate'

export type LodgingId = 'hostel-poultry' | 'single-poultry' | 'selfcon-g2' | 'onebed-ojo'

export type CharacterType = {
  id: CharacterTypeId
  label: string
}

export type Course = {
  id: string
  label: string
  years: string
  icon: string
}

export type LodgingDetails = {
  perks: string[]
  coursesLabel: string
  courses: Course[]
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
  startLocationId: string
  details?: LodgingDetails
}

/** Edit AAU expand copy, perks, and courses here. */
export const AAU_DETAILS: LodgingDetails = {
  perks: [
    '100L in the course you pick. Mummy and Daddy paid the first session fees.',
    '₦3,000 allowance every Monday, and no LAPO loan to repay.',
    'A bunk in Igbinedion Hostel for ₦1,200 a week.',
    'Graduate with a First, 2:1, 2:2 or Third. Up to 25% more pay on every shift.',
  ],
  coursesLabel: 'Your course',
  courses: [
    { id: 'computer-science', label: 'Computer Science', years: '4 years', icon: '💻' },
    { id: 'engineering', label: 'Engineering', years: '5 years', icon: '⚙️' },
    { id: 'mass-comm', label: 'Mass Communication', years: '4 years', icon: '🎤' },
    { id: 'law', label: 'Law', years: '5 years', icon: '⚖️' },
    { id: 'accounting', label: 'Accounting', years: '4 years', icon: '📗' },
    { id: 'theatre-arts', label: 'Theatre Arts', years: '4 years', icon: '🎨' },
    { id: 'nursing', label: 'Nursing Science', years: '5 years', icon: '🩺' },
    { id: 'education', label: 'Education', years: '4 years', icon: '📚' },
  ],
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
    startLocationId: 'school-hostels-1',
    details: AAU_DETAILS,
  },
  {
    id: 'single-poultry',
    icon: '/emoji/house.png',
    title: 'Single room · Poultry road',
    badge: 'Single room',
    description: 'One room on Poultry road: bed, toilet and bucket all inside. Off campus, cheapest rent.',
    rentWeekly: 2500,
    startLocationId: 'off-campus-hostels',
  },
  {
    id: 'selfcon-g2',
    icon: '/emoji/house.png',
    title: 'Self-con · College of Medicine · G1',
    badge: 'Self-con',
    description: 'Your room plus your own toilet, bath and kitchen, by College of Medicine and G1. Walk to class.',
    rentWeekly: 3000,
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

export function normalizeCourseId(lodgingId: string | null | undefined, courseId?: string | null) {
  const lodging = getLodging(lodgingId)
  if (!lodging?.details || !courseId) return null
  return lodging.details.courses.some((course) => course.id === courseId) ? courseId : null
}

export function lodgingNeedsCourse(lodgingId: string | null | undefined) {
  return Boolean(getLodging(lodgingId)?.details?.courses.length)
}

export function formatNaira(value: number) {
  return `₦${Math.max(0, Math.round(value)).toLocaleString()}`
}
