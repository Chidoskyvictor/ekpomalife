/*
 * Daily missions: 3 a day (2 for your role + 1 General; Casual gets 3 General), new at midnight
 * Nigerian time, one free swap. Each is done at a place on the map in 60 seconds or less.
 * The same file lives in lib/game and backend/src/game: keep the two identical (only import paths differ).
 */

import { LECTURE_BUILDINGS, lectureBuildingsFor } from './school-rules'

export type MissionRole = 'student' | 'graduate' | 'lecturer' | 'indigene' | 'general'

export type MissionDef = {
  id: string
  role: MissionRole
  emoji: string
  title: string
  /** One line under the title */
  blurb: string
  /** Where it's done. 'faculty' = your lecture buildings (students) or any faculty (others). */
  places: string[] | 'faculty' | 'hidden'
  /** Real seconds it takes once you're there (max 60) */
  seconds: number
  reward: number
  /** Only ever done once per player */
  once?: boolean
  /** Only between these hours (Nigerian time) */
  hours?: { open: number; close: number }
  /** Done by a real action instead of the Start button */
  auto?: 'lecture' | 'bond'
  /** Chance of getting caught (pays `fine` instead of the reward) */
  risk?: { chance: number; fine: number }
}

export const DAILY_BONUS = 15_000
export const MISSIONS_PER_DAY = 3
export const BOND_TARGET = 5

const FACULTY = 'faculty' as const

export const MISSIONS: MissionDef[] = [
  // —— Students ——
  { id: 'attend-lectures', role: 'student', emoji: '📝', title: 'Attend a lecture', blurb: 'Sit in on one of your classes today.', places: FACULTY, seconds: 0, reward: 6_000, auto: 'lecture' },
  { id: 'read-course', role: 'student', emoji: '📖', title: 'Read a course', blurb: 'Find a quiet corner at ICT and read.', places: ['ict-exams'], seconds: 30, reward: 4_000 },
  { id: 'competition', role: 'student', emoji: '🏆', title: 'Represent your school', blurb: 'Compete for AAU at the Student Conference.', places: ['students-centre'], seconds: 45, reward: 10_000 },
  { id: 'lecturer-note', role: 'student', emoji: '🗒️', title: "Get the lecturer's note", blurb: 'Copy the notes in your faculty.', places: FACULTY, seconds: 20, reward: 4_000 },
  { id: 'buy-handouts', role: 'student', emoji: '📚', title: 'Buy handouts', blurb: 'Pick up this week\'s handouts at the Campus Shop.', places: ['town-shop-1'], seconds: 15, reward: 3_000 },
  { id: 'prep-test', role: 'student', emoji: '🧠', title: 'Prepare for a test', blurb: 'Revise at the ICT before the test.', places: ['ict-exams'], seconds: 35, reward: 5_000 },
  // —— Graduates ——
  { id: 'whatsapp-errands', role: 'graduate', emoji: '📲', title: 'Run WhatsApp errands', blurb: 'Pick up orders for your customers at Market Square.', places: ['market-square'], seconds: 30, reward: 6_000 },
  { id: 'networking', role: 'graduate', emoji: '🤝', title: 'Attend a networking event', blurb: 'Meet people who are building things.', places: ['innovation-hub'], seconds: 40, reward: 7_000 },
  { id: 'apply-jobs', role: 'graduate', emoji: '💼', title: 'Apply for jobs', blurb: 'Send out applications from the ICT.', places: ['ict-exams'], seconds: 25, reward: 5_000 },
  { id: 'get-results', role: 'graduate', emoji: '🎓', title: 'Get your results', blurb: 'Collect your final results at the Admin Block. Once only.', places: ['admin-block'], seconds: 30, reward: 10_000, once: true },
  { id: 'connect-ceo', role: 'graduate', emoji: '👔', title: 'Connect with a CEO', blurb: 'Shoot your shot at Forbes.', places: ['forbes'], seconds: 40, reward: 9_000 },
  { id: 'assist-lecturer', role: 'graduate', emoji: '🧑‍🏫', title: 'Assist a lecturer', blurb: 'Help a lecturer with their class.', places: FACULTY, seconds: 35, reward: 6_000 },
  { id: 'advise-fresher', role: 'graduate', emoji: '💡', title: 'Give advice to a fresher', blurb: 'Talk a 100L student through their first year.', places: ['hall-100', 'twin-hall', 'cordelia-hall'], seconds: 20, reward: 4_000 },
  // —— Lecturers ——
  { id: 'run-class', role: 'lecturer', emoji: '🎤', title: 'Run a class', blurb: 'Teach a class in any faculty.', places: FACULTY, seconds: 50, reward: 10_000 },
  { id: 'give-assignment', role: 'lecturer', emoji: '📤', title: 'Give assignments', blurb: 'Set this week\'s assignment.', places: FACULTY, seconds: 20, reward: 4_000 },
  { id: 'lecturers-meeting', role: 'lecturer', emoji: '🗂️', title: "Attend lecturers' meeting", blurb: 'Faculty board meeting at the Admin Block.', places: ['admin-block'], seconds: 40, reward: 7_000 },
  { id: 'monitor-test', role: 'lecturer', emoji: '👀', title: 'Monitor a test', blurb: 'Invigilate the CBT at the ICT.', places: ['ict-exams'], seconds: 45, reward: 8_000 },
  { id: 'mark-assignment', role: 'lecturer', emoji: '✅', title: 'Mark assignments', blurb: 'Clear the pile on your desk.', places: FACULTY, seconds: 35, reward: 6_000 },
  { id: 'graduate-help', role: 'lecturer', emoji: '🤲', title: 'Get help from a graduate', blurb: 'A graduate assistant helps you sort the scripts.', places: FACULTY, seconds: 25, reward: 5_000 },
  // —— Indigenes ——
  { id: 'indigene-job', role: 'indigene', emoji: '💼', title: 'Apply for a job', blurb: 'Ask around for work at Market Square.', places: ['market-square'], seconds: 25, reward: 5_000 },
  { id: 'attend-function', role: 'indigene', emoji: '🎊', title: 'Attend a function', blurb: 'Show face at the church event.', places: ['above-the-hills-church'], seconds: 40, reward: 6_000 },
  { id: 'community-service', role: 'indigene', emoji: '🧹', title: 'Community service', blurb: 'Help clean up Market Square.', places: ['market-square'], seconds: 45, reward: 7_000 },
  { id: 'help-security', role: 'indigene', emoji: '🛡️', title: 'Help security officials', blurb: 'Keep watch with security at the school gate.', places: ['aau-gate'], seconds: 35, reward: 6_000 },
  { id: 'council-meeting', role: 'indigene', emoji: '🏛️', title: 'Attend a council meeting', blurb: 'Speak up for your street.', places: ['admin-block'], seconds: 40, reward: 7_000 },
  { id: 'nuisance', role: 'indigene', emoji: '😈', title: 'Loiter and be a nuisance', blurb: 'Risky: security might catch you and fine you ₦2,000.', places: ['cattle-market'], seconds: 20, reward: 8_000, risk: { chance: 0.3, fine: 2_000 } },
  // —— General ——
  { id: 'hidden-prize', role: 'general', emoji: '🎁', title: 'Find the hidden prize', blurb: 'Follow the clue.', places: 'hidden', seconds: 10, reward: 10_000 },
  { id: 'evening-sports', role: 'general', emoji: '⚽', title: 'Play evening sports', blurb: 'Kick ball at the Sports Complex after 5 PM.', places: ['sports-complex'], seconds: 45, reward: 5_000, hours: { open: 17, close: 22 } },
  { id: 'new-field', role: 'general', emoji: '🧪', title: 'Learn a new field', blurb: 'Take a short class at the Innovation Hub.', places: ['innovation-hub'], seconds: 40, reward: 6_000 },
  { id: 'birthday', role: 'general', emoji: '🎂', title: 'Attend a birthday party', blurb: 'Someone is turning up at Sazza.', places: ['sazza'], seconds: 35, reward: 5_000 },
  { id: 'crush', role: 'general', emoji: '💘', title: 'Get close to your crush', blurb: 'A quiet chat at the Relaxation Centre.', places: ['relaxation-centre'], seconds: 30, reward: 5_000 },
  { id: 'bond-5', role: 'general', emoji: '🫂', title: `Bond with ${BOND_TARGET} people`, blurb: 'Wave, laugh or chat with 5 different people anywhere.', places: [], seconds: 0, reward: 6_000, auto: 'bond' },
]

export const MISSION_BY_ID = new Map(MISSIONS.map((m) => [m.id, m]))

/** Where the hidden prize can be, with the clue players see. */
export const HIDDEN_SPOTS: { place: string; clue: string }[] = [
  { place: 'bukka', clue: 'Where the pot of soup never finishes.' },
  { place: 'keke-park', clue: 'Where every ride in Ekpoma starts.' },
  { place: 'clinic', clue: 'Where they check your temperature first.' },
  { place: 'park', clue: 'Green grass, open air, no lectures.' },
  { place: 'wise-gourmet', clue: 'Shawarma, chicken and chips.' },
  { place: 'magmus-autos', clue: 'Where engines get fixed.' },
  { place: 'spot-rite', clue: 'The spot that is always right.' },
  { place: 'shuttle-park', clue: 'Where the big buses wait.' },
]

const FACULTY_ALL = [...LECTURE_BUILDINGS]

/** The places a mission can be done at, for this player. */
export function missionPlaces(def: MissionDef, opts: { courseId: string | null; hiddenPlace: string }): string[] {
  if (def.places === 'hidden') return [opts.hiddenPlace]
  if (def.places === 'faculty') {
    const own = opts.courseId ? lectureBuildingsFor(opts.courseId) : []
    return own.length ? own : FACULTY_ALL
  }
  return def.places
}

/** Small, stable random numbers from a text seed (same picks all day for a player). */
export function seededRandom(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function roleOf(characterType: string | null | undefined): MissionRole | null {
  return characterType === 'student' || characterType === 'graduate' || characterType === 'lecturer' || characterType === 'indigene'
    ? characterType
    : null
}

function pickFrom(pool: MissionDef[], count: number, rand: () => number, skip: Set<string>): string[] {
  const left = pool.filter((m) => !skip.has(m.id))
  const out: string[] = []
  while (out.length < count && left.length) {
    const i = Math.floor(rand() * left.length)
    out.push(left.splice(i, 1)[0]!.id)
  }
  return out
}

/** Today's 3 missions and hidden prize spot for a player. `done` = once-only missions already finished. */
export function pickDailyMissions(seed: string, characterType: string | null, doneOnce: Set<string>) {
  const rand = seededRandom(seed)
  const role = roleOf(characterType)
  const general = MISSIONS.filter((m) => m.role === 'general')
  const skip = new Set(doneOnce)
  const ids = role
    ? [...pickFrom(MISSIONS.filter((m) => m.role === role), 2, rand, skip), ...pickFrom(general, 1, rand, skip)]
    : pickFrom(general, MISSIONS_PER_DAY, rand, skip)
  const hidden = HIDDEN_SPOTS[Math.floor(rand() * HIDDEN_SPOTS.length)]!
  return { ids, hiddenPlace: hidden.place }
}

/** A replacement for one mission (same role), not one already on today's list. */
export function swapMission(seed: string, characterType: string | null, current: string[], out: string, doneOnce: Set<string>) {
  const def = MISSION_BY_ID.get(out)
  if (!def) return null
  const rand = seededRandom(`${seed}:swap`)
  const pool = MISSIONS.filter((m) => m.role === def.role)
  return pickFrom(pool, 1, rand, new Set([...current, ...doneOnce]))[0] ?? null
}

export const clueFor = (place: string) => HIDDEN_SPOTS.find((s) => s.place === place)?.clue ?? 'Look around Ekpoma.'

const hourLabel = (hour: number) => `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`
export const hoursLabel = (h: { open: number; close: number }) => `${hourLabel(h.open)} – ${hourLabel(h.close)}`
