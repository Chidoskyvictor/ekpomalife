import { feesBalance, feesCleared, type CampusState } from './campus'
import type { GameActionId } from './places'
import type { TraitId } from './traits'

export type BuildingKind =
  | 'student-affairs'
  | 'lecture-hall'
  | 'ict'
  | 'clinic'
  | 'sports'
  | 'leisure'
  | 'faculty'
  | 'transport'
  | 'shop'
  | 'hostel'
  | 'generic'

export type ActionChip =
  | { kind: 'cash'; amount: number; label?: string }
  | { kind: 'energy'; amount: number }
  | { kind: 'time'; minutes: number }
  | { kind: 'reward'; text: string }

export type BuildingActionDef = {
  id: GameActionId
  emoji: string
  title: string
  subtitle: string
  chips: ActionChip[]
  buttonLabel: string
  /** Opens quiz / exam / amount / gpa overlay before POST */
  flow?: 'quiz' | 'exam' | 'pay-fees' | 'gpa' | 'ceremony' | 'travel-stub'
  quizBank?: string
  /** Soft lock — server still validates */
  lock?: (ctx: BuildingLockCtx) => string | null
}

export type BuildingDef = {
  id: string
  label: string
  emoji: string
  kind: BuildingKind
  /** Minutes from midnight; null = always open */
  openHours: { open: number; close: number } | null
  actions: BuildingActionDef[]
  /** Show JobsPanel / shop when here */
  showJobs?: boolean
  showShop?: boolean
}

export type BuildingLockCtx = {
  campus: CampusState
  gameHour: number
  traits: TraitId[]
  placeId: string
}

function hourFromGameTime(gameTime: number): number {
  return Math.floor((((gameTime % 1440) + 1440) % 1440) / 60)
}

export function isBuildingOpen(
  building: BuildingDef,
  gameTimeMinutes: number,
): { open: boolean; label: string } {
  if (!building.openHours) return { open: true, label: 'Open' }
  const hour = hourFromGameTime(gameTimeMinutes)
  const { open, close } = building.openHours
  const openNow = open <= close ? hour >= open && hour < close : hour >= open || hour < close
  return { open: openNow, label: openNow ? 'Open' : 'Closed' }
}

const lectureActions = (quizBank: string): BuildingActionDef[] => [
  {
    id: 'attend-lecture',
    emoji: '📝',
    title: 'Attend lecture',
    subtitle: 'Sit down, listen and learn.',
    chips: [
      { kind: 'energy', amount: -12 },
      { kind: 'time', minutes: 90 },
    ],
    buttonLabel: 'Enter class',
  },
  {
    id: 'submit-assignment',
    emoji: '📤',
    title: 'Submit assignment',
    subtitle: 'Only when one is due. Late comes with a soft penalty.',
    chips: [{ kind: 'time', minutes: 20 }],
    buttonLabel: 'Submit',
    lock: ({ campus }) =>
      campus.assignmentDueAt ? null : 'No assignment on the table right now.',
  },
  {
    id: 'take-quiz',
    emoji: '🧠',
    title: 'Take quiz',
    subtitle: 'Quick 3–5 questions. No stress.',
    chips: [
      { kind: 'energy', amount: -8 },
      { kind: 'time', minutes: 15 },
    ],
    buttonLabel: 'Start quiz',
    flow: 'quiz',
    quizBank,
  },
  {
    id: 'night-class',
    emoji: '🌙',
    title: 'Night class',
    subtitle: 'The reading room opens after 8pm. Night owls shine.',
    chips: [
      { kind: 'energy', amount: -10 },
      { kind: 'reward', text: 'Bonus knowledge' },
    ],
    buttonLabel: 'Read till late',
    lock: ({ gameHour }) => (gameHour >= 20 || gameHour < 5 ? null : 'Opens at 8pm'),
  },
  {
    id: 'exams-pointer',
    emoji: '💻',
    title: 'Exams',
    subtitle: 'Exams hold at ICT 💻',
    chips: [{ kind: 'reward', text: 'Go to ICT' }],
    buttonLabel: 'Noted',
    lock: () => 'Exams hold at ICT 💻',
  },
]

const facultyActions = (name: string): BuildingActionDef[] => [
  {
    id: 'meet-hod',
    emoji: '👔',
    title: 'Meet your HOD',
    subtitle: `Short word with ${name} leadership.`,
    chips: [
      { kind: 'time', minutes: 15 },
      { kind: 'reward', text: '+rep' },
    ],
    buttonLabel: 'Knock',
  },
  {
    id: 'faculty-notices',
    emoji: '📌',
    title: 'Faculty notices',
    subtitle: 'See what is on the board.',
    chips: [{ kind: 'time', minutes: 5 }],
    buttonLabel: 'Read board',
  },
  {
    id: 'study',
    emoji: '📚',
    title: 'Quiet study',
    subtitle: 'Find a corner and read.',
    chips: [
      { kind: 'energy', amount: -10 },
      { kind: 'time', minutes: 60 },
    ],
    buttonLabel: 'Study',
  },
]

/** Config map — new buildings are data only. */
export const BUILDINGS: Record<string, BuildingDef> = {
  'admin-block': {
    id: 'admin-block',
    label: 'Student Affairs',
    emoji: '🏛️',
    kind: 'student-affairs',
    openHours: { open: 8, close: 16 },
    showJobs: true,
    actions: [
      {
        id: 'pay-school-fees',
        emoji: '💳',
        title: 'Pay school fees',
        subtitle: 'Partial payment allowed. Balance shows after each pay.',
        chips: [{ kind: 'cash', amount: 0, label: 'Any amount' }],
        buttonLabel: 'Pay',
        flow: 'pay-fees',
        lock: ({ campus }) => (feesBalance(campus) <= 0 ? 'Fees already cleared. Nice!' : null),
      },
      {
        id: 'course-registration',
        emoji: '📋',
        title: 'Course registration',
        subtitle: 'Pick your courses for the session.',
        chips: [
          { kind: 'time', minutes: 30 },
          { kind: 'cash', amount: -500 },
        ],
        buttonLabel: 'Register',
        lock: ({ campus }) => {
          if (!feesCleared(campus)) return 'Clear your fees first.'
          if (campus.registered) return 'You already registered this session.'
          return null
        },
      },
      {
        id: 'collect-matric-gown',
        emoji: '🎓',
        title: 'Collect matric gown',
        subtitle: '100 Level only. One-time. Lands in your bag.',
        chips: [{ kind: 'reward', text: 'Inventory' }],
        buttonLabel: 'Collect',
        lock: ({ campus }) => {
          if (campus.level !== 100) return 'Comes up in 100 Level only.'
          if (campus.hasMatricGown) return 'You already collected your gown.'
          return null
        },
      },
      {
        id: 'collect-id-card',
        emoji: '🪪',
        title: 'Collect ID card',
        subtitle: 'One-time campus ID. Keep it safe.',
        chips: [{ kind: 'reward', text: 'Inventory' }],
        buttonLabel: 'Collect',
        lock: ({ campus }) => (campus.hasIdCard ? 'ID card already with you.' : null),
      },
      {
        id: 'convocation-clearance',
        emoji: '✅',
        title: 'Convocation clearance',
        subtitle: 'Final year only. Clearance before gown.',
        chips: [{ kind: 'time', minutes: 40 }],
        buttonLabel: 'Clear',
        lock: ({ campus }) => {
          if (campus.level < 400) return 'Comes up in final year.'
          if (campus.clearanceDone) return 'Clearance already done.'
          return null
        },
      },
      {
        id: 'convocation-gown',
        emoji: '👘',
        title: 'Collect convocation gown',
        subtitle: 'After clearance. Look sharp for the day.',
        chips: [{ kind: 'reward', text: 'Inventory' }],
        buttonLabel: 'Collect gown',
        lock: ({ campus }) => {
          if (campus.level < 400) return 'Comes up in final year.'
          if (!campus.clearanceDone) return 'Finish clearance first.'
          if (campus.convocationReady) return 'Gown already collected.'
          return null
        },
      },
      {
        id: 'convocation-ceremony',
        emoji: '🎉',
        title: 'Convocation ceremony',
        subtitle: 'Walk the stage. Big moment.',
        chips: [{ kind: 'reward', text: 'Confetti' }],
        buttonLabel: 'Enter hall',
        flow: 'ceremony',
        lock: ({ campus }) => {
          if (campus.level < 400) return 'Comes up in final year.'
          if (!campus.convocationReady) return 'Collect your gown first.'
          if (campus.convocationDone) return 'You already walked.'
          return null
        },
      },
      {
        id: 'check-result',
        emoji: '📊',
        title: 'Check result / transcript',
        subtitle: 'GPA history and any pending exam score.',
        chips: [{ kind: 'time', minutes: 10 }],
        buttonLabel: 'Open portal',
        flow: 'gpa',
      },
    ],
  },

  'hall-100': {
    id: 'hall-100',
    label: '100 Level Hall',
    emoji: '1️⃣',
    kind: 'lecture-hall',
    openHours: { open: 7, close: 20 },
    actions: lectureActions('general'),
  },
  'hall-200': {
    id: 'hall-200',
    label: '200 Level Hall',
    emoji: '2️⃣',
    kind: 'lecture-hall',
    openHours: { open: 7, close: 20 },
    actions: lectureActions('general').map((action) =>
      action.id === 'attend-lecture'
        ? {
            ...action,
            lock: ({ campus }) =>
              campus.level < 200 ? 'Comes up in 200 Level' : null,
          }
        : action,
    ),
  },
  'etf-hall': {
    id: 'etf-hall',
    label: 'ETF Hall',
    emoji: '🏢',
    kind: 'lecture-hall',
    openHours: { open: 7, close: 20 },
    actions: lectureActions('science'),
  },
  'mls-hall': {
    id: 'mls-hall',
    label: 'MLS Hall',
    emoji: '🔬',
    kind: 'lecture-hall',
    openHours: { open: 7, close: 20 },
    actions: lectureActions('medicine'),
  },
  'twin-hall': {
    id: 'twin-hall',
    label: 'Twin Hall',
    emoji: '🏫',
    kind: 'lecture-hall',
    openHours: { open: 7, close: 21 },
    actions: lectureActions('arts'),
  },
  'cordelia-hall': {
    id: 'cordelia-hall',
    label: 'Cordelia Agbebaku Hall',
    emoji: '🏫',
    kind: 'lecture-hall',
    openHours: { open: 8, close: 20 },
    actions: lectureActions('arts'),
  },
  education: {
    id: 'education',
    label: 'Education',
    emoji: '📚',
    kind: 'lecture-hall',
    openHours: { open: 8, close: 18 },
    actions: lectureActions('arts'),
  },
  'mass-comm': {
    id: 'mass-comm',
    label: 'Mass Comm',
    emoji: '🎤',
    kind: 'lecture-hall',
    openHours: { open: 8, close: 18 },
    actions: lectureActions('arts'),
  },
  bamssa: {
    id: 'bamssa',
    label: 'BAMSSA',
    emoji: '🎓',
    kind: 'lecture-hall',
    openHours: { open: 8, close: 18 },
    actions: lectureActions('medicine'),
  },
  'college-of-medicine': {
    id: 'college-of-medicine',
    label: 'College of Medicine',
    emoji: '🏥',
    kind: 'faculty',
    openHours: { open: 7, close: 20 },
    actions: facultyActions('Medicine'),
  },
  'anatomy-secretariat': {
    id: 'anatomy-secretariat',
    label: 'Anatomy Secretariat',
    emoji: '🫀',
    kind: 'faculty',
    openHours: { open: 8, close: 17 },
    actions: facultyActions('Anatomy'),
  },

  'ict-exams': {
    id: 'ict-exams',
    label: 'ICT',
    emoji: '💻',
    kind: 'ict',
    openHours: { open: 8, close: 20 },
    showJobs: true,
    actions: [
      {
        id: 'write-exam',
        emoji: '🖥️',
        title: 'Write exam',
        subtitle: 'CBT. Only in exam season, after fees + registration.',
        chips: [
          { kind: 'time', minutes: 60 },
          { kind: 'energy', amount: -20 },
        ],
        buttonLabel: 'Start CBT',
        flow: 'exam',
        quizBank: 'general',
        lock: ({ campus }) => {
          if (!campus.examSeason) return 'Exam season has not opened yet.'
          if (!feesCleared(campus)) return 'Pay your fees before exams.'
          if (!campus.registered) return 'Register your courses first.'
          return null
        },
      },
      {
        id: 'study',
        emoji: '📚',
        title: 'Revision bay',
        subtitle: 'Quiet corner before the CBT.',
        chips: [
          { kind: 'energy', amount: -8 },
          { kind: 'time', minutes: 45 },
        ],
        buttonLabel: 'Revise',
      },
    ],
  },
  'ict-lab': {
    id: 'ict-lab',
    label: 'ICT Lab',
    emoji: '🖥️',
    kind: 'ict',
    openHours: { open: 8, close: 18 },
    actions: [
      {
        id: 'study',
        emoji: '💻',
        title: 'Practice on a PC',
        subtitle: 'Warm up before the real CBT at ICT.',
        chips: [
          { kind: 'energy', amount: -10 },
          { kind: 'time', minutes: 40 },
        ],
        buttonLabel: 'Practice',
      },
      {
        id: 'exams-pointer',
        emoji: '📝',
        title: 'Official exams',
        subtitle: 'Exams hold at ICT 💻 (main block).',
        chips: [{ kind: 'reward', text: 'Go to ICT' }],
        buttonLabel: 'Noted',
        lock: () => 'Exams hold at ICT 💻',
      },
    ],
  },

  clinic: {
    id: 'clinic',
    label: 'Clinic',
    emoji: '🩺',
    kind: 'clinic',
    openHours: { open: 8, close: 18 },
    actions: [
      {
        id: 'clinic-treat',
        emoji: '💊',
        title: 'Get treatment',
        subtitle: 'A nurse will check you. Restores health for a small fee.',
        chips: [
          { kind: 'cash', amount: -1500 },
          { kind: 'reward', text: '+health' },
        ],
        buttonLabel: 'Treat me',
      },
    ],
  },
  'sports-complex': {
    id: 'sports-complex',
    label: 'Sports Complex',
    emoji: '⚽',
    kind: 'sports',
    openHours: { open: 6, close: 21 },
    actions: [
      {
        id: 'sports-train',
        emoji: '🏋️',
        title: 'Train',
        subtitle: 'Work up a sweat. Gym rats get a bonus.',
        chips: [
          { kind: 'energy', amount: -18 },
          { kind: 'reward', text: '+fitness' },
        ],
        buttonLabel: 'Train',
      },
      {
        id: 'shower',
        emoji: '🚿',
        title: 'Quick shower',
        subtitle: 'After the pitch.',
        chips: [
          { kind: 'cash', amount: -100 },
          { kind: 'time', minutes: 15 },
        ],
        buttonLabel: 'Shower',
      },
    ],
  },
  'students-centre': {
    id: 'students-centre',
    label: "Students' Centre",
    emoji: '🎒',
    kind: 'leisure',
    openHours: { open: 9, close: 21 },
    actions: [
      {
        id: 'centre-hangout',
        emoji: '🧃',
        title: 'Hang out',
        subtitle: 'Chat corner. Social butterflies thrive here.',
        chips: [
          { kind: 'cash', amount: -200 },
          { kind: 'reward', text: '+social' },
        ],
        buttonLabel: 'Vibe',
      },
      {
        id: 'eat',
        emoji: '🥪',
        title: 'Snack stall',
        subtitle: 'Something small for the road.',
        chips: [{ kind: 'cash', amount: -400 }],
        buttonLabel: 'Buy snack',
      },
    ],
  },
  'relaxation-centre': {
    id: 'relaxation-centre',
    label: 'Relaxation Centre',
    emoji: '😌',
    kind: 'leisure',
    openHours: { open: 10, close: 23 },
    actions: [
      {
        id: 'centre-hangout',
        emoji: '🎧',
        title: 'Chill',
        subtitle: 'Music, benches, soft life for a bit.',
        chips: [
          { kind: 'energy', amount: 8 },
          { kind: 'reward', text: '+happiness' },
        ],
        buttonLabel: 'Relax',
      },
    ],
  },
  'shuttle-park': {
    id: 'shuttle-park',
    label: 'Shuttle Park',
    emoji: '🚌',
    kind: 'transport',
    openHours: { open: 6, close: 20 },
    actions: [
      {
        id: 'shuttle-travel',
        emoji: '🗺️',
        title: 'Travel to other slabs',
        subtitle: 'Coming soon. Stub for multi-slab travel.',
        chips: [{ kind: 'cash', amount: -500 }],
        buttonLabel: 'Check routes',
        flow: 'travel-stub',
      },
      {
        id: 'travel',
        emoji: '🚌',
        title: 'Campus shuttle',
        subtitle: 'Hop to another spot on this slab.',
        chips: [
          { kind: 'cash', amount: -300 },
          { kind: 'time', minutes: 20 },
        ],
        buttonLabel: 'Board',
      },
    ],
  },
  'keke-park': {
    id: 'keke-park',
    label: 'Keke Park',
    emoji: '🛵',
    kind: 'transport',
    openHours: { open: 5, close: 22 },
    actions: [
      {
        id: 'travel',
        emoji: '🛺',
        title: 'Take a keke',
        subtitle: 'Move around campus and town.',
        chips: [
          { kind: 'cash', amount: -300 },
          { kind: 'time', minutes: 15 },
        ],
        buttonLabel: 'Enter keke',
      },
      {
        id: 'hangout',
        emoji: '🗣️',
        title: 'Chat with riders',
        subtitle: 'Hear the latest road news.',
        chips: [{ kind: 'time', minutes: 10 }],
        buttonLabel: 'Chat',
      },
    ],
  },

  'physical-science': {
    id: 'physical-science',
    label: 'Physical Science',
    emoji: '🔭',
    kind: 'faculty',
    openHours: { open: 8, close: 18 },
    actions: facultyActions('Physical Science'),
  },
  'social-science': {
    id: 'social-science',
    label: 'Social Science',
    emoji: '🗣️',
    kind: 'faculty',
    openHours: { open: 8, close: 18 },
    actions: facultyActions('Social Science'),
  },
  'life-science': {
    id: 'life-science',
    label: 'Life Science',
    emoji: '🧬',
    kind: 'faculty',
    openHours: { open: 8, close: 18 },
    actions: facultyActions('Life Science'),
  },
  'law-campus': {
    id: 'law-campus',
    label: 'Law',
    emoji: '⚖️',
    kind: 'faculty',
    openHours: { open: 8, close: 18 },
    actions: facultyActions('Law'),
  },
  'law-ext': {
    id: 'law-ext',
    label: 'Law (extension)',
    emoji: '⚖️',
    kind: 'faculty',
    openHours: { open: 8, close: 18 },
    actions: facultyActions('Law'),
  },
  'management-science': {
    id: 'management-science',
    label: 'Management Science',
    emoji: '📈',
    kind: 'faculty',
    openHours: { open: 8, close: 18 },
    actions: facultyActions('Management'),
  },
  engineering: {
    id: 'engineering',
    label: 'Engineering',
    emoji: '⚙️',
    kind: 'faculty',
    openHours: { open: 8, close: 18 },
    actions: facultyActions('Engineering'),
  },

  'town-shop-1': {
    id: 'town-shop-1',
    label: 'Campus Shop',
    emoji: '🏪',
    kind: 'shop',
    openHours: { open: 8, close: 20 },
    showShop: true,
    showJobs: true,
    actions: [
      {
        id: 'eat',
        emoji: '🍫',
        title: 'Quick bite',
        subtitle: 'Something small from the counter.',
        chips: [{ kind: 'cash', amount: -300 }],
        buttonLabel: 'Buy',
      },
    ],
  },
  'town-shop-2': {
    id: 'town-shop-2',
    label: 'Shop',
    emoji: '🏪',
    kind: 'shop',
    openHours: { open: 8, close: 20 },
    showShop: true,
    actions: [
      {
        id: 'eat',
        emoji: '🍪',
        title: 'Snack',
        subtitle: 'Fill a small hunger hole.',
        chips: [{ kind: 'cash', amount: -250 }],
        buttonLabel: 'Buy',
      },
    ],
  },
  'town-shop-3': {
    id: 'town-shop-3',
    label: 'House',
    emoji: '🏡',
    kind: 'generic',
    openHours: null,
    actions: [
      {
        id: 'hangout',
        emoji: '🚪',
        title: 'Visit',
        subtitle: 'Say hello if anyone is around.',
        chips: [{ kind: 'time', minutes: 10 }],
        buttonLabel: 'Knock',
      },
    ],
  },
  'town-shop-4': {
    id: 'town-shop-4',
    label: 'Shop',
    emoji: '🏪',
    kind: 'shop',
    openHours: { open: 8, close: 20 },
    showShop: true,
    actions: [
      {
        id: 'eat',
        emoji: '🥤',
        title: 'Cold drink',
        subtitle: 'Beat the sun.',
        chips: [{ kind: 'cash', amount: -200 }],
        buttonLabel: 'Buy',
      },
    ],
  },
  bukka: {
    id: 'bukka',
    label: 'Mama Amina Bukka',
    emoji: '🍛',
    kind: 'shop',
    openHours: { open: 7, close: 22 },
    showShop: true,
    showJobs: true,
    actions: [
      {
        id: 'eat',
        emoji: '🍲',
        title: 'Plate of rice',
        subtitle: 'Mama Amina never disappoints.',
        chips: [{ kind: 'cash', amount: -800 }],
        buttonLabel: 'Eat',
      },
      {
        id: 'hangout',
        emoji: '🪑',
        title: 'Sit and chat',
        subtitle: 'Bench by the pot.',
        chips: [{ kind: 'time', minutes: 20 }],
        buttonLabel: 'Sit',
      },
    ],
  },
  'cattle-market': {
    id: 'cattle-market',
    label: 'Cattle Market',
    emoji: '🐂',
    kind: 'generic',
    openHours: { open: 6, close: 18 },
    actions: [
      {
        id: 'hangout',
        emoji: '👀',
        title: 'Look around',
        subtitle: 'Busy yard. Watch your step.',
        chips: [{ kind: 'time', minutes: 15 }],
        buttonLabel: 'Explore',
      },
    ],
  },
  sazza: {
    id: 'sazza',
    label: 'Sazza',
    emoji: '🏠',
    kind: 'generic',
    openHours: { open: 8, close: 20 },
    actions: [
      {
        id: 'hangout',
        emoji: '🤝',
        title: 'Visit Sazza',
        subtitle: 'Local hangout spot.',
        chips: [{ kind: 'time', minutes: 20 }],
        buttonLabel: 'Enter',
      },
    ],
  },
  'animal-house-1': {
    id: 'animal-house-1',
    label: 'Animal House',
    emoji: '🐄',
    kind: 'generic',
    openHours: { open: 7, close: 17 },
    actions: [
      {
        id: 'study',
        emoji: '🔬',
        title: 'Lab visit',
        subtitle: 'Observe. Do not pet the wrong animal.',
        chips: [
          { kind: 'time', minutes: 40 },
          { kind: 'energy', amount: -6 },
        ],
        buttonLabel: 'Visit',
      },
    ],
  },
  'animal-house-2': {
    id: 'animal-house-2',
    label: 'Animal House',
    emoji: '🐐',
    kind: 'generic',
    openHours: { open: 7, close: 17 },
    actions: [
      {
        id: 'study',
        emoji: '🔬',
        title: 'Lab visit',
        subtitle: 'Second house. Same rules.',
        chips: [
          { kind: 'time', minutes: 40 },
          { kind: 'energy', amount: -6 },
        ],
        buttonLabel: 'Visit',
      },
    ],
  },
  'off-campus-hostels': {
    id: 'off-campus-hostels',
    label: 'Off-campus Hostels',
    emoji: '🛏️',
    kind: 'hostel',
    openHours: null,
    actions: [
      {
        id: 'sleep',
        emoji: '😴',
        title: 'Sleep',
        subtitle: 'Rest and refill energy.',
        chips: [{ kind: 'time', minutes: 240 }],
        buttonLabel: 'Sleep',
      },
      {
        id: 'shower',
        emoji: '🚿',
        title: 'Shower',
        subtitle: 'Fresh body.',
        chips: [
          { kind: 'cash', amount: -100 },
          { kind: 'time', minutes: 20 },
        ],
        buttonLabel: 'Shower',
      },
    ],
  },
  'aau-gate': {
    id: 'aau-gate',
    label: 'AAU School Gate',
    emoji: '🚪',
    kind: 'generic',
    openHours: null,
    actions: [
      {
        id: 'hangout',
        emoji: '🚶',
        title: 'Gate vibe',
        subtitle: 'Watch people enter and exit.',
        chips: [{ kind: 'time', minutes: 10 }],
        buttonLabel: 'Stand',
      },
    ],
  },
  'parking-ext': {
    id: 'parking-ext',
    label: 'Parking Lot',
    emoji: '🅿️',
    kind: 'generic',
    openHours: null,
    actions: [
      {
        id: 'hangout',
        emoji: '🚗',
        title: 'Wait in the lot',
        subtitle: 'Shade and cars. That is all.',
        chips: [{ kind: 'time', minutes: 10 }],
        buttonLabel: 'Wait',
      },
    ],
  },
}

export function getBuilding(id: string | null | undefined): BuildingDef | null {
  if (!id) return null
  return BUILDINGS[id] ?? null
}

/** Every playable map zone should resolve — fallback generic panel. */
export function resolveBuilding(
  id: string,
  fallbackLabel?: string,
  fallbackEmoji = '📍',
): BuildingDef {
  const known = BUILDINGS[id]
  if (known) return known
  return {
    id,
    label: fallbackLabel ?? id,
    emoji: fallbackEmoji,
    kind: 'generic',
    openHours: { open: 8, close: 18 },
    actions: [
      {
        id: 'hangout',
        emoji: '👋',
        title: 'Look around',
        subtitle: 'Nothing special wired here yet.',
        chips: [{ kind: 'time', minutes: 5 }],
        buttonLabel: 'Look',
      },
    ],
  }
}

export function chipLabel(chip: ActionChip): string {
  switch (chip.kind) {
    case 'cash':
      if (chip.label) return chip.label
      if (chip.amount === 0) return '₦—'
      return chip.amount > 0
        ? `+₦${chip.amount.toLocaleString()}`
        : `₦${Math.abs(chip.amount).toLocaleString()}`
    case 'energy':
      return chip.amount >= 0 ? `+${chip.amount} energy` : `${chip.amount} energy`
    case 'time':
      return `${chip.minutes} min`
    case 'reward':
      return chip.text
  }
}
