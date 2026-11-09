/*
 * Onboarding: the first-time tour and the one-time tips.
 * The same file lives in lib/game and backend/src/game: keep the two identical.
 */

/** Steps in the first-time tour (the client owns what each step looks like). */
export const TOUR_STEPS = 6

/** One-time tips: each shows once per character, the first time they open that feature. */
export const TIP_IDS = ['buy-mode', 'club', 'family', 'bank', 'phone-apps', 'forbes'] as const
export type TipId = (typeof TIP_IDS)[number]

export const isTipId = (id: string): id is TipId => (TIP_IDS as readonly string[]).includes(id)

export type CoachView = {
  /** Show the tour: a new character that has not finished or skipped it */
  tour: boolean
  step: number
  tipsSeen: string[]
}

/** Next step after finishing `step`; null when the tour is over. Never goes backwards or past the end. */
export function nextTourStep(current: number, finished: number): number | null {
  const next = Math.max(current, finished + 1)
  return next >= TOUR_STEPS ? null : next
}
