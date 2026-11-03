import { describe, expect, it } from 'vitest'
import {
  examLock,
  gradeFor,
  installments,
  lectureBuildingLock,
  lectureLock,
  schoolNowAt,
  sessionFee,
  tutorialLock,
  type SchoolNow,
  type SchoolRecord,
} from './school-rules.js'

const base = (over: Partial<SchoolRecord> = {}): SchoolRecord => ({
  courseId: 'mass-comm',
  isStudent: true,
  level: 100,
  semester: 1,
  acceptancePaid: true,
  paid1: true,
  paid2: false,
  prep: 0,
  lecturesThisSemester: 0,
  lastLectureDay: null,
  countsDay: null,
  lecturesToday: 0,
  tutorialsToday: 0,
  lastClassAt: null,
  results: [],
  graduated: false,
  ...over,
})
const at = (hour: number, day = 10, nowMs = 1_000_000_000): SchoolNow => ({ day, hour, nowMs })

describe('lecture buildings', () => {
  it('main campus: own faculty and shared halls only', () => {
    expect(lectureBuildingLock('mass-comm', 'mass-comm')).toBeNull()
    expect(lectureBuildingLock('english', 'mass-comm')).toBeNull()
    expect(lectureBuildingLock('mass-comm', 'twin-hall')).toBeNull()
    expect(lectureBuildingLock('mass-comm', 'cordelia-hall')).toBeNull()
    expect(lectureBuildingLock('mass-comm', 'law-campus')).toMatch(/isn't your faculty/)
    expect(lectureBuildingLock('mass-comm', 'etf-hall')).toMatch(/College of Medicine/)
  })
  it('science splits into physical and life science', () => {
    expect(lectureBuildingLock('physics', 'physical-science')).toBeNull()
    expect(lectureBuildingLock('physics', 'life-science')).not.toBeNull()
    expect(lectureBuildingLock('microbiology', 'life-science')).toBeNull()
    expect(lectureBuildingLock('microbiology', 'physical-science')).not.toBeNull()
  })
  it('medicine: only the College of Medicine halls', () => {
    for (const hall of ['hall-100', 'hall-200', 'etf-hall', 'mls-hall']) {
      expect(lectureBuildingLock('nursing', hall)).toBeNull()
      expect(lectureBuildingLock('medicine-and-surgery', hall)).toBeNull()
    }
    expect(lectureBuildingLock('nursing', 'twin-hall')).not.toBeNull()
    expect(lectureBuildingLock('anatomy', 'cordelia-hall')).not.toBeNull()
  })
  it('agriculture and environmental use the shared halls', () => {
    expect(lectureBuildingLock('architecture', 'twin-hall')).toBeNull()
    expect(lectureBuildingLock('agricultural-economics', 'cordelia-hall')).toBeNull()
    expect(lectureBuildingLock('agricultural-economics', 'engineering')).not.toBeNull()
  })
})

describe('fees', () => {
  it('differ by faculty and split into two installments', () => {
    expect(sessionFee('mass-comm', 100)).toBe(90_000)
    expect(sessionFee('medicine-and-surgery', 100)).toBe(200_000)
    expect(sessionFee('accounting', 300)).toBe(120_000)
    const [a, b] = installments('accounting', 100)
    expect(a + b).toBe(110_000)
    expect(a).toBe(55_000)
  })
  it('locks lectures until acceptance and the semester installment are paid', () => {
    expect(lectureLock(base({ acceptancePaid: false }), 'mass-comm', at(10))).toMatch(/acceptance/)
    expect(lectureLock(base({ paid1: false }), 'mass-comm', at(10))).toMatch(/1st installment/)
    expect(lectureLock(base({ semester: 2 }), 'mass-comm', at(10))).toMatch(/2nd installment/)
    expect(lectureLock(base(), 'mass-comm', at(10))).toBeNull()
  })
})

describe('the school day', () => {
  it('classes 8 AM – 5 PM, three a day, 50s apart', () => {
    expect(lectureLock(base(), 'mass-comm', at(7))).toMatch(/Classes run/)
    expect(lectureLock(base(), 'mass-comm', at(17))).toMatch(/Classes run/)
    expect(lectureLock(base({ countsDay: 10, lecturesToday: 3 }), 'mass-comm', at(10))).toMatch(/3 classes/)
    expect(lectureLock(base({ countsDay: 9, lecturesToday: 3 }), 'mass-comm', at(10))).toBeNull()
    expect(lectureLock(base({ lastClassAt: 1_000_000_000 - 20_000 }), 'mass-comm', at(10))).toMatch(/30s/)
  })
  it('tutorial: any hour, unpaid too, but not in a non-lecture building', () => {
    const unpaid = base({ acceptancePaid: false, paid1: false })
    expect(tutorialLock(unpaid, 'mass-comm', at(21))).toBeNull()
    expect(tutorialLock(unpaid, 'law-campus', at(21))).toBeNull()
    expect(tutorialLock(unpaid, 'clinic', at(21))).not.toBeNull()
    expect(tutorialLock(base({ countsDay: 10, tutorialsToday: 3 }), 'mass-comm', at(21))).toMatch(/enough/)
  })
  it('exam: at ICT, the day after a lecture, 9 AM – 1 PM', () => {
    const ready = base({ lecturesThisSemester: 2, lastLectureDay: 9, prep: 60 })
    expect(examLock(ready, 'ict-exams', at(10))).toBeNull()
    expect(examLock(ready, 'mass-comm', at(10))).toMatch(/ICT/)
    expect(examLock(ready, 'ict-exams', at(14))).toMatch(/Exams run/)
    expect(examLock(base({ lecturesThisSemester: 1, lastLectureDay: 10 }), 'ict-exams', at(10))).toMatch(/tomorrow/)
    expect(examLock(base(), 'ict-exams', at(10))).toMatch(/at least one lecture/)
  })
  it('three lectures is an A (5.0)', () => {
    expect(gradeFor(90).points).toBe(5)
    expect(gradeFor(75).letter).toBe('B')
    expect(gradeFor(0).letter).toBe('F')
  })
  it('reads the Nigerian clock', () => {
    // 15 Jan 2026 09:30 WAT = 08:30 UTC → day 1, 9 AM
    expect(schoolNowAt(Date.UTC(2026, 0, 15, 8, 30))).toMatchObject({ day: 1, hour: 9 })
  })
})
