/*
 * School rules for AAU students: fees, where you can attend lectures, class and exam hours,
 * exam prep and grades. Pure functions, no database.
 * The same file lives in lib/game and backend/src/game: keep the two identical (only the import path differs).
 */

import { getCourse } from './aau-courses'

/** The building groups lectures are tied to. */
export type FacultyGroup =
  | 'arts'
  | 'education'
  | 'social'
  | 'management'
  | 'law'
  | 'physical'
  | 'life'
  | 'engineering'
  | 'environmental'
  | 'agriculture'
  | 'medicine'
  | 'mbbs'

const LIFE_SCIENCE = new Set([
  'biochemistry',
  'microbiology',
  'zoology',
  'plant-science-and-biotechnology',
  'human-nutrition-and-dietetics',
])

/** Which group a course belongs to (null = not a known course). */
export function facultyGroup(courseId: string | null | undefined): FacultyGroup | null {
  if (!courseId) return null
  if (courseId === 'medicine-and-surgery') return 'mbbs'
  if (LIFE_SCIENCE.has(courseId)) return 'life'
  // Ids saved before the full course list
  if (courseId === 'engineering') return 'engineering'
  if (courseId === 'education') return 'education'
  const faculty = getCourse(courseId)?.faculty
  switch (faculty) {
    case 'Arts':
      return 'arts'
    case 'Education':
      return 'education'
    case 'Social Sciences':
      return 'social'
    case 'Management Sciences':
      return 'management'
    case 'Law':
      return 'law'
    case 'Science':
      return 'physical'
    case 'Engineering':
      return 'engineering'
    case 'Environmental Sciences':
      return 'environmental'
    case 'Agriculture':
      return 'agriculture'
    case 'College of Medicine / Basic Medical Sciences':
      return 'medicine'
    default:
      return null
  }
}

export const isMedGroup = (group: FacultyGroup | null) => group === 'medicine' || group === 'mbbs'

/** Lecture halls inside the College of Medicine plot: only medical students attend here. */
export const MED_HALLS = ['hall-100', 'hall-200', 'etf-hall', 'mls-hall'] as const
/** Main-campus halls any main-campus student can attend. */
export const SHARED_HALLS = ['twin-hall', 'cordelia-hall'] as const

/** Each main-campus faculty's own lecture buildings. Agriculture and Environmental have none yet. */
const FACULTY_BUILDINGS: Partial<Record<FacultyGroup, readonly string[]>> = {
  arts: ['mass-comm'],
  education: ['education'],
  social: ['social-science'],
  management: ['management-science'],
  law: ['law-campus', 'law-ext'],
  physical: ['physical-science'],
  life: ['life-science'],
  engineering: ['engineering'],
}

const BUILDING_NAMES: Record<string, string> = {
  'mass-comm': 'Mass Comm',
  education: 'Education',
  'social-science': 'Social Science',
  'management-science': 'Management Science',
  'law-campus': 'Law',
  'law-ext': 'Law (extension)',
  'physical-science': 'Physical Science',
  'life-science': 'Life Science',
  engineering: 'Engineering',
  'twin-hall': 'Twin Hall',
  'cordelia-hall': 'Cordelia Hall',
  'hall-100': '100 Level Hall',
  'hall-200': '200 Level Hall',
  'etf-hall': 'ETF Hall',
  'mls-hall': 'MLS Hall',
}

/** Every building where lectures run (for showing the lecture cards). */
export const LECTURE_BUILDINGS = new Set<string>([
  ...MED_HALLS,
  ...SHARED_HALLS,
  ...Object.values(FACULTY_BUILDINGS).flat(),
])

/** The buildings this course can attend lectures in. */
export function lectureBuildingsFor(courseId: string | null | undefined): string[] {
  const group = facultyGroup(courseId)
  if (!group) return []
  if (isMedGroup(group)) return [...MED_HALLS]
  return [...(FACULTY_BUILDINGS[group] ?? []), ...SHARED_HALLS]
}

/** Where to send someone who can't attend here, e.g. "Mass Comm, Twin Hall or Cordelia Hall". */
export function whereToAttend(courseId: string | null | undefined): string {
  const names = lectureBuildingsFor(courseId).map((id) => BUILDING_NAMES[id] ?? id)
  if (names.length <= 1) return names[0] ?? 'your faculty'
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
}

/** Why you can't attend lectures in this building, or null if you can. */
export function lectureBuildingLock(courseId: string | null | undefined, placeId: string): string | null {
  if (!LECTURE_BUILDINGS.has(placeId)) return 'No lectures hold here.'
  const allowed = lectureBuildingsFor(courseId)
  if (allowed.includes(placeId)) return null
  const group = facultyGroup(courseId)
  if (isMedGroup(group)) return `College of Medicine students attend lectures at ${whereToAttend(courseId)}.`
  if ((MED_HALLS as readonly string[]).includes(placeId)) {
    return `This hall is for College of Medicine students. Your lectures: ${whereToAttend(courseId)}.`
  }
  return `This isn't your faculty. Your lectures: ${whereToAttend(courseId)}.`
}

// —— Fees ——

export const ACCEPTANCE_FEE = 10_000

const SESSION_FEE: Record<FacultyGroup, number> = {
  arts: 90_000,
  education: 90_000,
  social: 90_000,
  management: 110_000,
  law: 110_000,
  physical: 120_000,
  life: 120_000,
  agriculture: 120_000,
  engineering: 140_000,
  environmental: 140_000,
  medicine: 160_000,
  mbbs: 200_000,
}

/** A full session's school fees: by faculty, ₦5,000 more for each level above 100. */
export function sessionFee(courseId: string | null | undefined, level: number): number {
  const group = facultyGroup(courseId) ?? 'arts'
  const steps = Math.max(0, Math.floor((level - 100) / 100))
  return SESSION_FEE[group] + steps * 5_000
}

/** First installment (first semester) and second installment (second semester). */
export function installments(courseId: string | null | undefined, level: number): [number, number] {
  const total = sessionFee(courseId, level)
  const first = Math.ceil(total / 2 / 1000) * 1000
  return [first, total - first]
}

/** The last level of a course (4-year course → 400). */
export function finalLevel(courseId: string | null | undefined): number {
  return (getCourse(courseId)?.years ?? 4) * 100
}

// —— The school day (real Nigerian time) ——

export const CLASS_HOURS = { open: 8, close: 17 } as const
export const EXAM_HOURS = { open: 9, close: 13 } as const
export const CLASSES_PER_DAY = 3
export const TUTORIALS_PER_DAY = 3
/** Real seconds between two classes (or two tutorials). */
export const CLASS_COOLDOWN_SECONDS = 50
export const LECTURE_PREP = 30
export const TUTORIAL_PREP = 5

const hourLabel = (hour: number) => `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`
export const CLASS_HOURS_LABEL = `${hourLabel(CLASS_HOURS.open)} – ${hourLabel(CLASS_HOURS.close)}`
export const EXAM_HOURS_LABEL = `${hourLabel(EXAM_HOURS.open)} – ${hourLabel(EXAM_HOURS.close)}`

export const inClassHours = (hour: number) => hour >= CLASS_HOURS.open && hour < CLASS_HOURS.close
export const inExamHours = (hour: number) => hour >= EXAM_HOURS.open && hour < EXAM_HOURS.close

// —— Grades ——

export type Grade = { letter: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'; points: number }

/** Exam prep at the exam → grade. All three lectures (90%) is an A. */
export function gradeFor(prep: number): Grade {
  if (prep >= 90) return { letter: 'A', points: 5 }
  if (prep >= 75) return { letter: 'B', points: 4 }
  if (prep >= 60) return { letter: 'C', points: 3 }
  if (prep >= 50) return { letter: 'D', points: 2 }
  if (prep >= 40) return { letter: 'E', points: 1 }
  return { letter: 'F', points: 0 }
}

export type SemesterResult = {
  level: number
  semester: 1 | 2
  prep: number
  grade: Grade['letter']
  points: number
  day: number
}

export function cgpaOf(results: SemesterResult[]): number | null {
  if (results.length === 0) return null
  const total = results.reduce((sum, r) => sum + r.points, 0)
  return Math.round((total / results.length) * 100) / 100
}

export function classOfDegree(cgpa: number | null): string | null {
  if (cgpa == null) return null
  if (cgpa >= 4.5) return 'First Class'
  if (cgpa >= 3.5) return 'Second Class Upper'
  if (cgpa >= 2.4) return 'Second Class Lower'
  if (cgpa >= 1.5) return 'Third Class'
  return 'Pass'
}

// —— A student's school record and what they can do ——

export type SchoolRecord = {
  courseId: string | null
  isStudent: boolean
  level: number
  semester: 1 | 2
  acceptancePaid: boolean
  /** This session's installments */
  paid1: boolean
  paid2: boolean
  /** 0–100 for this semester */
  prep: number
  /** Lectures attended this semester */
  lecturesThisSemester: number
  /** Game day of the last lecture (exam opens the day after) */
  lastLectureDay: number | null
  /** Today's counts (reset when `countsDay` isn't today) */
  countsDay: number | null
  lecturesToday: number
  tutorialsToday: number
  /** Real ms of the last lecture or tutorial (cooldown) */
  lastClassAt: number | null
  results: SemesterResult[]
  graduated: boolean
}

export type SchoolNow = { day: number; hour: number; nowMs: number }

const todays = (r: SchoolRecord, day: number) =>
  r.countsDay === day ? { lectures: r.lecturesToday, tutorials: r.tutorialsToday } : { lectures: 0, tutorials: 0 }

/** Is this semester's fee covered? */
export const semesterPaid = (r: SchoolRecord) => (r.semester === 1 ? r.paid1 : r.paid2)

export function feesLock(r: SchoolRecord): string | null {
  if (!r.acceptancePaid) return 'Pay your acceptance fee at the Admin Block first.'
  if (!semesterPaid(r)) {
    return r.semester === 1
      ? 'Pay your 1st installment of school fees at the Admin Block first.'
      : 'Pay your 2nd installment of school fees at the Admin Block first.'
  }
  return null
}

function cooldownLock(r: SchoolRecord, now: SchoolNow): string | null {
  if (r.lastClassAt == null) return null
  const left = Math.ceil((r.lastClassAt + CLASS_COOLDOWN_SECONDS * 1000 - now.nowMs) / 1000)
  return left > 0 ? `Take a short break. Next class in ${left}s.` : null
}

function studentLock(r: SchoolRecord): string | null {
  if (!r.isStudent || !r.courseId) return 'Only students attend classes.'
  if (r.graduated) return 'You have graduated. Congratulations! 🎓'
  return null
}

export function lectureLock(r: SchoolRecord, placeId: string, now: SchoolNow): string | null {
  return (
    studentLock(r) ??
    lectureBuildingLock(r.courseId, placeId) ??
    feesLock(r) ??
    (inClassHours(now.hour) ? null : `Classes run ${CLASS_HOURS_LABEL}. Come back then.`) ??
    (todays(r, now.day).lectures >= CLASSES_PER_DAY
      ? `That's your ${CLASSES_PER_DAY} classes for today. Come back tomorrow.`
      : null) ??
    (r.prep >= 100 ? 'You are fully prepared. Write your exam at ICT.' : null) ??
    cooldownLock(r, now)
  )
}

export function tutorialLock(r: SchoolRecord, placeId: string, now: SchoolNow): string | null {
  return (
    studentLock(r) ??
    (LECTURE_BUILDINGS.has(placeId) ? null : 'Tutorials hold in the lecture halls.') ??
    (todays(r, now.day).tutorials >= TUTORIALS_PER_DAY ? "You've done enough tutorials today." : null) ??
    (r.prep >= 100 ? 'You are fully prepared. Write your exam at ICT.' : null) ??
    cooldownLock(r, now)
  )
}

export const EXAM_PLACE = 'ict-exams'
export const FEES_PLACE = 'admin-block'

export function examLock(r: SchoolRecord, placeId: string, now: SchoolNow): string | null {
  return (
    studentLock(r) ??
    (placeId === EXAM_PLACE ? null : 'Exams hold at ICT.') ??
    feesLock(r) ??
    (r.lecturesThisSemester < 1 ? 'Attend at least one lecture before you can write the exam.' : null) ??
    (r.lastLectureDay != null && now.day <= r.lastLectureDay
      ? `Your exam is tomorrow, ${EXAM_HOURS_LABEL} at ICT.`
      : null) ??
    (inExamHours(now.hour) ? null : `Exams run ${EXAM_HOURS_LABEL}. Come back then.`)
  )
}

/** What a student should do next, for the school card. */
export function nextStep(r: SchoolRecord, now: SchoolNow): string {
  if (!r.isStudent || !r.courseId) return 'Not a student.'
  if (r.graduated) return 'Graduated. Congratulations! 🎓'
  const fees = feesLock(r)
  if (fees) return fees
  const t = todays(r, now.day)
  if (r.lecturesThisSemester >= 1 && r.lastLectureDay != null && now.day > r.lastLectureDay) {
    return inExamHours(now.hour)
      ? 'Exams are open: write yours at ICT 🧾'
      : `Exam: ${EXAM_HOURS_LABEL} at ICT. You can still attend class to raise your prep.`
  }
  if (t.lectures >= CLASSES_PER_DAY) return `Exam tomorrow, ${EXAM_HOURS_LABEL} at ICT.`
  if (!inClassHours(now.hour)) return `Classes run ${CLASS_HOURS_LABEL}. Evening tutorials are open.`
  return `Attend lectures at ${whereToAttend(r.courseId)}.`
}

/** Day 1 00:00 WAT, the same epoch as the game clock (backend/src/game/time.ts). */
const SCHOOL_EPOCH_MS = Date.UTC(2026, 0, 14, 23, 0, 0)

/** Game day and Nigerian hour at a real moment. */
export function schoolNowAt(nowMs: number): SchoolNow {
  const minutes = Math.max(0, Math.floor((nowMs - SCHOOL_EPOCH_MS) / 60_000))
  return { day: Math.floor(minutes / 1440) + 1, hour: Math.floor((minutes % 1440) / 60), nowMs }
}
