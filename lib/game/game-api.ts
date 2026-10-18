import { apiGet, apiPost, useMocks } from '@/lib/api/client'
import type { ApiFail } from '@/lib/api/errors'
import { mockGameAction, type BuildingActionPayload } from './buildings-mock'
import type { CampusState, GpaRow } from './campus'
import type { GameActionId, Place } from './places'
import type { NeedId } from './needs'
import type { TraitId } from './traits'

export type ServerNeeds = Record<NeedId, number>

export type ServerGameState = {
  ok: true
  cash: number
  needs: ServerNeeds
  locationId: string
  gameTime: number
  day: number
  period: string
  timeLabel: string
  mood: { emoji: string; label: string; tone: 'good' | 'warn' | 'bad'; score: number }
  dreamProgress: { current: number; target: number; label: string; complete: boolean } | null
  upNext: { actionId: GameActionId; placeId: string; need: NeedId; label: string }
  version: number
  places: Place[]
  message?: string
  /** Island toast from weekly payouts / rent ladder */
  toast?: string | null
  reputation?: number
  hustleLockoutUntil?: number | null
  /** Academic / campus progress — server owned */
  campus?: CampusState
  confetti?: boolean
  resultView?: { gpaHistory: GpaRow[]; pendingExamScore: number | null }
  notices?: string[]
  travelStub?: boolean
  examSubmitted?: { scoreHidden: boolean }
  /** Quiz prompts for client UI (answers never included) */
  quiz?: {
    bankId: string
    questions: { id: string; prompt: string; choices: [string, string, string, string] }[]
    mode: 'quiz' | 'exam'
  }
}

export type GameStatePayload = ServerGameState

type Fail = ApiFail

export async function fetchGameState(): Promise<ServerGameState | Fail> {
  const live = await apiGet<ServerGameState>('/game/state')
  // Offline / no backend: fall back to in-process mock. Vitest MSW failures stay as-is.
  if (!live.ok && useMocks() && live.network) {
    const { mockGetState } = await import('./buildings-mock')
    return mockGetState()
  }
  return live
}

const PHASE3_ACTIONS = new Set([
  'pay-school-fees',
  'course-registration',
  'collect-matric-gown',
  'collect-id-card',
  'convocation-clearance',
  'convocation-gown',
  'convocation-ceremony',
  'check-result',
  'attend-lecture',
  'submit-assignment',
  'take-quiz',
  'night-class',
  'write-exam',
  'exams-pointer',
  'clinic-treat',
  'sports-train',
  'centre-hangout',
  'meet-hod',
  'faculty-notices',
  'shuttle-travel',
  'quiz-start',
  'exam-start',
])

function asFailFromMock(result: ReturnType<typeof mockGameAction>): ServerGameState | Fail {
  if (result.ok) return result
  return {
    ok: false,
    error: result.error,
    code:
      result.error === 'INSUFFICIENT_FUNDS' || result.error === 'NO_ENERGY'
        ? result.error
        : undefined,
  }
}

export async function postGameAction(input: {
  actionId: GameActionId | string
  targetPlaceId?: string | null
  version: number
  payload?: BuildingActionPayload
  traits?: TraitId[]
}): Promise<ServerGameState | Fail> {
  if (useMocks()) {
    return asFailFromMock(mockGameAction(input))
  }

  const live = await apiPost<ServerGameState>('/game/action', {
    actionId: input.actionId,
    targetPlaceId: input.targetPlaceId,
    version: input.version,
    payload: input.payload,
  })

  // Until the backend PC ships §7.6, Phase 3 action ids fall back to the in-process mock.
  if (
    !live.ok &&
    PHASE3_ACTIONS.has(String(input.actionId)) &&
    (live.network ||
      /not available|unknown|invalid|could not|not found|400|404/i.test(live.error || ''))
  ) {
    return asFailFromMock(mockGameAction(input))
  }

  return live
}

/** Fetch quiz prompts without grading (mock returns bank; live API should too). */
export async function fetchQuizPrompt(input: {
  actionId: 'take-quiz' | 'write-exam'
  placeId: string
  bankId: string
  version: number
}): Promise<
  | { ok: true; questions: ServerGameState['quiz'] extends infer Q ? NonNullable<Q>['questions'] : never }
  | Fail
> {
  const { pickQuiz, publicQuiz } = await import('./quiz-bank')
  const count = input.actionId === 'write-exam' ? 10 : 4
  if (useMocks()) {
    return { ok: true, questions: publicQuiz(pickQuiz(input.bankId, count)) }
  }
  const result = await apiPost<ServerGameState>('/game/action', {
    actionId: input.actionId === 'write-exam' ? 'exam-start' : 'quiz-start',
    targetPlaceId: input.placeId,
    version: input.version,
    payload: { bankId: input.bankId },
  })
  if (result.ok && result.quiz?.questions) {
    return { ok: true, questions: result.quiz.questions }
  }
  // Backend not ready → local question bank (grading still goes through postGameAction mock fallback)
  return { ok: true, questions: publicQuiz(pickQuiz(input.bankId, count)) }
}
