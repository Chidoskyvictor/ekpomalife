/**
 * In-process mock for building actions when NEXT_PUBLIC_USE_MOCKS=true.
 * Money / grades / attendance mutate only here (server-shaped), never in UI math.
 */
import { emptyCampus, feesBalance, feeAmountForLevel, type CampusState } from './campus'
import type { ServerGameState } from './game-api'
import { defaultNeeds } from './needs-defaults'
import type { GameActionId } from './places'
import { QUIZ_BANKS } from './quiz-bank'
import type { TraitId } from './traits'

let campus: CampusState = emptyCampus(100)
let cash = 125_000
let version = 1
let locationId = 'admin-block'
let gameTime = 10 * 60
let day = 1
const needs = defaultNeeds()

function periodFor(minute: number) {
  const h = Math.floor(minute / 60) % 24
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  if (h < 20) return 'evening'
  return 'night'
}

function timeLabel(minute: number) {
  const m = ((minute % 1440) + 1440) % 1440
  const h24 = Math.floor(m / 60)
  const mm = m % 60
  const h12 = h24 % 12 || 12
  const ampm = h24 < 12 ? 'AM' : 'PM'
  return `${h12}:${mm.toString().padStart(2, '0')} ${ampm}`
}

function snapshot(message?: string, extra?: Partial<ServerGameState>): ServerGameState {
  return {
    ok: true,
    cash,
    needs: { ...needs },
    locationId,
    gameTime,
    day,
    period: periodFor(gameTime),
    timeLabel: timeLabel(gameTime),
    mood: { emoji: '😊', label: 'Fine', tone: 'good', score: 70 },
    dreamProgress: null,
    upNext: { actionId: 'study', placeId: locationId, need: 'study', label: 'Study' },
    version,
    places: [],
    message,
    campus: { ...campus, attendance: { ...campus.attendance }, knowledge: { ...campus.knowledge } },
    confetti: false,
    ...extra,
  }
}

function spend(amount: number): string | null {
  if (amount <= 0) return null
  if (cash < amount) return 'INSUFFICIENT_FUNDS'
  cash -= amount
  return null
}

function bumpTime(minutes: number) {
  gameTime = (gameTime + minutes) % 1440
  version += 1
}

function bumpNeed(key: keyof typeof needs, delta: number) {
  needs[key] = Math.max(0, Math.min(100, needs[key] + delta))
}

export function getMockCampus(): CampusState {
  return {
    ...campus,
    attendance: { ...campus.attendance },
    knowledge: { ...campus.knowledge },
    gpaHistory: [...campus.gpaHistory],
    facultyNotices: [...campus.facultyNotices],
  }
}

export function mockGetState(): ServerGameState {
  return snapshot()
}

function gradeAnswers(questionIds: string[] | undefined, answers: number[] | undefined) {
  const ids = questionIds ?? []
  const ans = answers ?? []
  let correct = 0
  const all = Object.values(QUIZ_BANKS).flat()
  ids.forEach((id, i) => {
    const q = all.find((row) => row.id === id)
    if (q && ans[i] === q.answerIndex) correct += 1
  })
  return { correct, total: Math.max(1, ids.length) }
}

export function resetBuildingsMock(opts?: { level?: number; examSeason?: boolean }) {
  campus = emptyCampus(opts?.level ?? 100)
  if (opts?.examSeason) campus.examSeason = true
  cash = 125_000
  version = 1
  locationId = 'admin-block'
  gameTime = 10 * 60
  day = 1
  Object.assign(needs, defaultNeeds())
}

export type BuildingActionPayload = {
  amount?: number
  answers?: number[]
  questionIds?: string[]
}

export function mockGameAction(input: {
  actionId: GameActionId | string
  targetPlaceId?: string | null
  version?: number
  payload?: BuildingActionPayload
  traits?: TraitId[]
}): ServerGameState | { ok: false; error: string } {
  const actionId = input.actionId
  const traits = input.traits ?? []

  const fail = (error: string) => ({ ok: false as const, error })

  switch (actionId) {
    case 'pay-school-fees': {
      const due = feesBalance(campus)
      if (due <= 0) return fail('Fees already cleared. Nice!')
      const amount = Math.max(1, Math.min(due, Math.floor(input.payload?.amount ?? due)))
      const err = spend(amount)
      if (err) return fail(err)
      campus.feesPaid += amount
      bumpTime(10)
      return snapshot(
        feesBalance(campus) <= 0
          ? 'Fees cleared. You can register courses now.'
          : `Paid ₦${amount.toLocaleString()}. Balance ₦${feesBalance(campus).toLocaleString()}.`,
      )
    }
    case 'course-registration': {
      if (feesBalance(campus) > 0) return fail('Clear your fees first.')
      if (campus.registered) return fail('You already registered this session.')
      const err = spend(500)
      if (err) return fail(err)
      campus.registered = true
      bumpTime(30)
      return snapshot('Courses registered. You are on the list.')
    }
    case 'collect-matric-gown': {
      if (campus.level !== 100) return fail('Comes up in 100 Level only.')
      if (campus.hasMatricGown) return fail('You already collected your gown.')
      campus.hasMatricGown = true
      bumpTime(15)
      return snapshot('Matric gown collected. Check your inventory.', { confetti: true })
    }
    case 'collect-id-card': {
      if (campus.hasIdCard) return fail('ID card already with you.')
      campus.hasIdCard = true
      bumpTime(15)
      return snapshot('ID card is yours. Keep it safe.', { confetti: true })
    }
    case 'convocation-clearance': {
      if (campus.level < 400) return fail('Comes up in final year.')
      campus.clearanceDone = true
      bumpTime(40)
      return snapshot('Clearance done. Collect your gown next.')
    }
    case 'convocation-gown': {
      if (!campus.clearanceDone) return fail('Finish clearance first.')
      campus.convocationReady = true
      bumpTime(20)
      return snapshot('Convocation gown ready. Time for the ceremony.')
    }
    case 'convocation-ceremony': {
      if (!campus.convocationReady) return fail('Collect your gown first.')
      campus.convocationDone = true
      cash += 20_000
      bumpTime(90)
      return snapshot('You walked. Congrats, graduate!', { confetti: true })
    }
    case 'check-result': {
      bumpTime(10)
      if (campus.pendingExamScore != null) {
        const score = campus.pendingExamScore
        campus.gpaHistory.unshift({
          semester: `Day ${day} exam`,
          gpa: Math.round((score / 100) * 5 * 10) / 10,
          label: `CBT ${score}%`,
        })
        campus.pendingExamScore = null
      }
      return snapshot('Result portal open.', {
        resultView: {
          gpaHistory: campus.gpaHistory,
          pendingExamScore: null,
        },
      })
    }
    case 'attend-lecture': {
      if (needs.energy < 12) return fail('NO_ENERGY')
      bumpNeed('energy', -12)
      bumpNeed('study', 12)
      campus.attendance.general = Math.min(100, (campus.attendance.general ?? 0) + 8)
      campus.knowledge.general = Math.min(100, (campus.knowledge.general ?? 0) + 6)
      bumpTime(90)
      return snapshot('Lecture done. Knowledge up a little.')
    }
    case 'submit-assignment': {
      if (!campus.assignmentDueAt) return fail('No assignment on the table right now.')
      const late = Date.now() > new Date(campus.assignmentDueAt).getTime()
      campus.knowledge.general = Math.min(
        100,
        (campus.knowledge.general ?? 0) + (late ? 3 : 10),
      )
      campus.assignmentDueAt = null
      bumpTime(20)
      return snapshot(late ? 'Submitted late. Soft penalty applied.' : 'Assignment in. Nice one.')
    }
    case 'take-quiz': {
      if (needs.energy < 8) return fail('NO_ENERGY')
      const { correct, total } = gradeAnswers(input.payload?.questionIds, input.payload?.answers)
      bumpNeed('energy', -8)
      bumpNeed('study', 4 + correct * 2)
      campus.knowledge.general = Math.min(100, (campus.knowledge.general ?? 0) + correct * 3)
      bumpTime(15)
      return snapshot(`Quiz done. ${correct}/${total} correct.`)
    }
    case 'night-class': {
      const hour = Math.floor(gameTime / 60) % 24
      if (!(hour >= 20 || hour < 5)) return fail('Opens at 8pm')
      if (needs.energy < 10) return fail('NO_ENERGY')
      const bonus = traits.includes('night-classer') ? 12 : 6
      bumpNeed('energy', -10)
      bumpNeed('study', bonus)
      campus.knowledge.general = Math.min(100, (campus.knowledge.general ?? 0) + bonus)
      bumpTime(75)
      return snapshot(
        traits.includes('night-classer')
          ? 'Night owl mode. Your brain is sharp.'
          : 'Night class done. You tried.',
      )
    }
    case 'write-exam': {
      if (!campus.examSeason) return fail('Exam season has not opened yet.')
      if (feesBalance(campus) > 0) return fail('Pay your fees before exams.')
      if (!campus.registered) return fail('Register your courses first.')
      if (needs.energy < 20) return fail('NO_ENERGY')
      const { correct, total } = gradeAnswers(input.payload?.questionIds, input.payload?.answers)
      const knowledge = campus.knowledge.general ?? 35
      const attendance = campus.attendance.general ?? 40
      const traitBonus = traits.includes('academic-weapon') ? 8 : 0
      const raw =
        (correct / total) * 55 + knowledge * 0.25 + attendance * 0.15 + traitBonus
      const score = Math.max(0, Math.min(100, Math.round(raw)))
      campus.pendingExamScore = score
      bumpNeed('energy', -20)
      bumpTime(60)
      return snapshot('Exam submitted. Check result later at Student Affairs.', {
        confetti: score >= 70,
        examSubmitted: { scoreHidden: true },
      })
    }
    case 'exams-pointer':
      return fail('Exams hold at ICT 💻')
    case 'clinic-treat': {
      const err = spend(1500)
      if (err) return fail(err)
      bumpNeed('energy', 15)
      bumpNeed('hygiene', 10)
      bumpTime(25)
      return snapshot('The nurse sorted you out. Feel better.')
    }
    case 'sports-train': {
      if (needs.energy < 18) return fail('NO_ENERGY')
      const bonus = traits.includes('gym-rat') ? 8 : 0
      bumpNeed('energy', -18 + Math.floor(bonus / 2))
      bumpNeed('fun', 10 + bonus)
      bumpTime(45)
      return snapshot(traits.includes('gym-rat') ? 'Gym rat session. Legs are shaking.' : 'Training done.')
    }
    case 'centre-hangout': {
      const bonus = traits.includes('social-butterfly') ? 8 : 0
      const atRelax = locationId === 'relaxation-centre'
      if (!atRelax) {
        const err = spend(200)
        if (err) return fail(err)
      }
      bumpNeed('social', 18 + bonus)
      bumpNeed('fun', 15 + bonus)
      bumpNeed('energy', atRelax ? 8 : -5)
      bumpTime(40)
      return snapshot(
        traits.includes('social-butterfly') ? 'Butterfly mode. Everybody know you.' : 'Chill complete.',
      )
    }
    case 'meet-hod': {
      bumpTime(15)
      bumpNeed('social', 5)
      return snapshot('HOD said stay focused. Soft encouragement.')
    }
    case 'faculty-notices': {
      bumpTime(5)
      return snapshot(campus.facultyNotices[0] ?? 'No new notices today.', {
        notices: campus.facultyNotices,
      })
    }
    case 'shuttle-travel':
      return snapshot('Other slabs coming soon. Hold your ticket stub.', {
        travelStub: true,
      })
    case 'eat': {
      const err = spend(800)
      if (err) return fail(err)
      bumpNeed('hunger', 35)
      bumpNeed('fun', 5)
      bumpTime(30)
      return snapshot('You ate. Hunger is calm.')
    }
    case 'sleep': {
      bumpNeed('energy', 50)
      bumpNeed('hygiene', -5)
      bumpNeed('hunger', -10)
      bumpTime(240)
      return snapshot('Good rest.')
    }
    case 'shower': {
      const err = spend(100)
      if (err) return fail(err)
      bumpNeed('hygiene', 40)
      bumpNeed('energy', 5)
      bumpTime(20)
      return snapshot('Fresh body.')
    }
    case 'study': {
      if (needs.energy < 10) return fail('NO_ENERGY')
      bumpNeed('energy', -10)
      bumpNeed('study', 18)
      campus.knowledge.general = Math.min(100, (campus.knowledge.general ?? 0) + 5)
      bumpTime(60)
      return snapshot('Study session locked in.')
    }
    case 'hangout': {
      bumpNeed('social', 20)
      bumpNeed('fun', 15)
      bumpNeed('energy', -5)
      bumpTime(30)
      return snapshot('Great chat.')
    }
    case 'travel': {
      const err = spend(300)
      if (err) return fail(err)
      if (input.targetPlaceId) locationId = input.targetPlaceId
      bumpNeed('energy', -5)
      bumpTime(20)
      return snapshot('You arrived.')
    }
    case 'work-placeholder': {
      cash += 600
      bumpNeed('energy', -20)
      bumpTime(120)
      return snapshot('Side hustle pay landed.')
    }
    default:
      return fail('That action is not available yet.')
  }
}

/** Dev helper: open exam season / bump level in mock store. */
export function mockSetCampusFlags(patch: Partial<CampusState>) {
  campus = { ...campus, ...patch }
  if (patch.level != null) campus.feesDue = feeAmountForLevel(patch.level)
}
