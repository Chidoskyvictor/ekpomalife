import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import { getCourse } from './aau-courses.js'
import { applyCash } from './game-state.js'
import { missionProgress } from './missions.js'
import {
  ACCEPTANCE_FEE,
  FEES_PLACE,
  LECTURE_PREP,
  TUTORIAL_PREP,
  cgpaOf,
  classOfDegree,
  examLock,
  finalLevel,
  gradeFor,
  installments,
  lectureLock,
  tutorialLock,
  type SchoolNow,
  type SchoolRecord,
  type SemesterResult,
} from './school-rules.js'
import { clockFromGameTime, realGameTime } from './time.js'

export type SchoolAction = 'acceptance' | 'installment-1' | 'installment-2' | 'full-session' | 'lecture' | 'tutorial' | 'exam'
export const SCHOOL_ACTIONS: SchoolAction[] = ['acceptance', 'installment-1', 'installment-2', 'full-session', 'lecture', 'tutorial', 'exam']

type Row = {
  level: number
  semester: number
  acceptance_paid: boolean
  paid_1: boolean
  paid_2: boolean
  prep: number
  lectures_semester: number
  last_lecture_day: number | null
  counts_day: number | null
  lectures_today: number
  tutorials_today: number
  last_class_at: Date | null
  results: SemesterResult[] | string
  graduated: boolean
}

type Character = { id: string; character_type: string | null; course_id: string | null; location_id: string | null; cash: string | number | null }

/** Now on the game clock (real Nigerian time; tests can pin it). */
function schoolNow(): SchoolNow {
  const clock = clockFromGameTime(realGameTime())
  return { day: clock.day, hour: clock.hour, nowMs: Date.now() }
}

function toRecord(row: Row, ch: Character): SchoolRecord {
  return {
    courseId: ch.course_id,
    isStudent: ch.character_type === 'student',
    level: row.level,
    semester: row.semester === 2 ? 2 : 1,
    acceptancePaid: row.acceptance_paid,
    paid1: row.paid_1,
    paid2: row.paid_2,
    prep: row.prep,
    lecturesThisSemester: row.lectures_semester,
    lastLectureDay: row.last_lecture_day,
    countsDay: row.counts_day,
    lecturesToday: row.lectures_today,
    tutorialsToday: row.tutorials_today,
    lastClassAt: row.last_class_at ? new Date(row.last_class_at).getTime() : null,
    results: typeof row.results === 'string' ? (JSON.parse(row.results) as SemesterResult[]) : row.results,
    graduated: row.graduated,
  }
}

export type SchoolView = {
  record: SchoolRecord
  courseName: string | null
  fees: { acceptance: number; installment1: number; installment2: number }
  cgpa: number | null
  classOfDegree: string | null
  finalLevel: number
  locationId: string | null
  cash: number
  serverNowMs: number
}

function viewOf(record: SchoolRecord, ch: Character, cash: number): SchoolView {
  const [installment1, installment2] = installments(record.courseId, record.level)
  const cgpa = cgpaOf(record.results)
  return {
    record,
    courseName: getCourse(record.courseId)?.name ?? null,
    fees: { acceptance: ACCEPTANCE_FEE, installment1, installment2 },
    cgpa,
    classOfDegree: classOfDegree(cgpa),
    finalLevel: finalLevel(record.courseId),
    locationId: ch.location_id,
    cash,
    serverNowMs: Date.now(),
  }
}

async function loadCharacter(client: PoolClient, userId: string): Promise<Character | null> {
  const found = await client.query<Character>(
    `SELECT c.id, c.character_type, c.course_id, gs.location_id, gs.cash
     FROM characters c LEFT JOIN game_state gs ON gs.character_id = c.id
     WHERE c.user_id = $1`,
    [userId],
  )
  return found.rows[0] ?? null
}

async function loadRow(client: PoolClient, characterId: string, lock: boolean): Promise<Row> {
  await client.query(`INSERT INTO school_state (character_id) VALUES ($1) ON CONFLICT (character_id) DO NOTHING`, [characterId])
  const found = await client.query<Row>(
    `SELECT level, semester, acceptance_paid, paid_1, paid_2, prep, lectures_semester, last_lecture_day,
            counts_day, lectures_today, tutorials_today, last_class_at, results, graduated
     FROM school_state WHERE character_id = $1 ${lock ? 'FOR UPDATE' : ''}`,
    [characterId],
  )
  return found.rows[0]!
}

const asCash = (value: string | number | null) => Number(value ?? 0)

type Fail = { ok: false; code: number; error: string }
const fail = (code: number, error: string): Fail => ({ ok: false, code, error })

export async function getSchool(userId: string): Promise<{ ok: true; school: SchoolView } | Fail> {
  const client = await pool.connect()
  try {
    const ch = await loadCharacter(client, userId)
    if (!ch) return fail(404, 'Create your character first.')
    const row = await loadRow(client, ch.id, false)
    return { ok: true, school: viewOf(toRecord(row, ch), ch, asCash(ch.cash)) }
  } finally {
    client.release()
  }
}

/** Run one school action: pay a fee, attend a lecture or tutorial, or write the exam. */
export async function schoolAction(
  userId: string,
  action: SchoolAction,
): Promise<{ ok: true; school: SchoolView; message: string; result?: SemesterResult } | Fail> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const ch = await loadCharacter(client, userId)
    if (!ch) {
      await client.query('ROLLBACK')
      return fail(404, 'Create your character first.')
    }
    const row = await loadRow(client, ch.id, true)
    const r = toRecord(row, ch)
    const now = schoolNow()
    const place = ch.location_id ?? ''
    const done = async (message: string, result?: SemesterResult) => {
      await client.query('COMMIT')
      const fresh = await loadRow(client, ch.id, false)
      const cash = await client.query<{ cash: string }>(`SELECT cash FROM game_state WHERE character_id = $1`, [ch.id])
      return { ok: true as const, school: viewOf(toRecord(fresh, ch), ch, asCash(cash.rows[0]?.cash ?? null)), message, result }
    }
    const refuse = async (error: string, code = 409) => {
      await client.query('ROLLBACK')
      return fail(code, error)
    }

    // —— Fees (Admin Block) ——
    if (action === 'acceptance' || action === 'installment-1' || action === 'installment-2' || action === 'full-session') {
      if (r.isStudent !== true || !r.courseId) return refuse('Only students pay school fees.')
      if (r.graduated) return refuse('You have graduated. No more fees!')
      if (place !== FEES_PLACE) return refuse('Pay fees at the Admin Block.')
      const [fee1, fee2] = installments(r.courseId, r.level)
      let amount = 0
      let reason = ''
      const set: string[] = []
      if (action === 'acceptance') {
        if (r.acceptancePaid) return refuse('Your acceptance fee is already paid.')
        amount = ACCEPTANCE_FEE
        reason = 'AAU acceptance fee'
        set.push('acceptance_paid = TRUE')
      } else {
        if (!r.acceptancePaid) return refuse('Pay your acceptance fee first.')
        if (action === 'installment-1') {
          if (r.paid1) return refuse('Your 1st installment is already paid.')
          amount = fee1
          reason = `${r.level}L school fees, 1st installment`
          set.push('paid_1 = TRUE')
        } else if (action === 'installment-2') {
          if (r.paid2) return refuse('Your 2nd installment is already paid.')
          if (!r.paid1) return refuse('Pay your 1st installment first.')
          amount = fee2
          reason = `${r.level}L school fees, 2nd installment`
          set.push('paid_2 = TRUE')
        } else {
          if (r.paid1 && r.paid2) return refuse('This session is fully paid.')
          amount = (r.paid1 ? 0 : fee1) + (r.paid2 ? 0 : fee2)
          reason = `${r.level}L school fees, full session`
          set.push('paid_1 = TRUE', 'paid_2 = TRUE')
        }
      }
      const paid = await applyCash(client, ch.id, -amount, reason, 'school_fees')
      if (!paid.ok) {
        return refuse(
          paid.error === 'INSUFFICIENT_FUNDS'
            ? `You need ₦${amount.toLocaleString()}. Work a job to raise the money.`
            : 'Could not take the payment.',
          paid.error === 'INSUFFICIENT_FUNDS' ? 402 : 409,
        )
      }
      await client.query(`UPDATE school_state SET ${set.join(', ')}, updated_at = NOW() WHERE character_id = $1`, [ch.id])
      return done(`Paid ₦${amount.toLocaleString()}: ${reason}. ✅`)
    }

    // A new day: reset today's counts
    const sameDay = r.countsDay === now.day
    const lecturesToday = sameDay ? r.lecturesToday : 0
    const tutorialsToday = sameDay ? r.tutorialsToday : 0

    if (action === 'lecture') {
      const lock = lectureLock(r, place, now)
      if (lock) return refuse(lock)
      const prep = Math.min(100, r.prep + LECTURE_PREP)
      await client.query(
        `UPDATE school_state
         SET prep = $2, lectures_semester = lectures_semester + 1, last_lecture_day = $3,
             counts_day = $3, lectures_today = $4, tutorials_today = $5, last_class_at = NOW(), updated_at = NOW()
         WHERE character_id = $1`,
        [ch.id, prep, now.day, lecturesToday + 1, tutorialsToday],
      )
      const mission = await missionProgress(client, ch.id, 'lecture')
      return done(`Lecture attended 📝 Exam prep ${prep}%.${mission ? ` ${mission}` : ''}`)
    }

    if (action === 'tutorial') {
      const lock = tutorialLock(r, place, now)
      if (lock) return refuse(lock)
      const prep = Math.min(100, r.prep + TUTORIAL_PREP)
      await client.query(
        `UPDATE school_state
         SET prep = $2, counts_day = $3, lectures_today = $4, tutorials_today = $5, last_class_at = NOW(), updated_at = NOW()
         WHERE character_id = $1`,
        [ch.id, prep, now.day, lecturesToday, tutorialsToday + 1],
      )
      return done(`Evening tutorial done 🌙 Exam prep ${prep}%.`)
    }

    // —— Exam (ICT) ——
    const lock = examLock(r, place, now)
    if (lock) return refuse(lock)
    const grade = gradeFor(r.prep)
    const result: SemesterResult = {
      level: r.level,
      semester: r.semester,
      prep: r.prep,
      grade: grade.letter,
      points: grade.points,
      day: now.day,
    }
    const results = [...r.results, result]
    const last = finalLevel(r.courseId)
    if (r.semester === 1) {
      await client.query(
        `UPDATE school_state
         SET semester = 2, prep = 0, lectures_semester = 0, last_lecture_day = NULL, results = $2::jsonb, updated_at = NOW()
         WHERE character_id = $1`,
        [ch.id, JSON.stringify(results)],
      )
    } else if (r.level >= last) {
      await client.query(
        `UPDATE school_state
         SET prep = 0, lectures_semester = 0, last_lecture_day = NULL, results = $2::jsonb, graduated = TRUE, updated_at = NOW()
         WHERE character_id = $1`,
        [ch.id, JSON.stringify(results)],
      )
    } else {
      // Next session: new level, fees due again (acceptance is once only)
      await client.query(
        `UPDATE school_state
         SET level = level + 100, semester = 1, paid_1 = FALSE, paid_2 = FALSE, prep = 0, lectures_semester = 0,
             last_lecture_day = NULL, results = $2::jsonb, updated_at = NOW()
         WHERE character_id = $1`,
        [ch.id, JSON.stringify(results)],
      )
    }
    return done(`Exam submitted: ${grade.letter} (${grade.points.toFixed(1)}) 🎓`, result)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
