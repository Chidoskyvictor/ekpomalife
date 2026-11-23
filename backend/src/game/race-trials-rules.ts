import { carById } from './cars-rules.js'
import { EFFECT } from './race-rewards-rules.js'

/*
 * The rules a time trial must pass (pure: no database, so the phone's tests can import this file).
 * The server does not just believe the phone's clock:
 *   - the trial is OPENED by the server (its clock starts the run), and your time cannot be longer
 *     than the wall clock allows
 *   - the time cannot beat what the car you drive could do over the route's length at top speed
 *   - every checkpoint must be cleared, in order, with rising times, and no stretch between two
 *     checkpoints can be faster than the car's top speed allows
 * Honest limit: this stops edited and impossible times, not a player who really drives the route
 * flawlessly with a modded client. The board only counts runs the server accepted.
 */

/** Routes and their checkpoints (metres along the run). Same as lib/game/race-courses.ts: its test fails if they drift. */
export const COURSES: Record<string, { name: string; lengthM: number; laps: number; checkpointsM: number[] }> = {
  'expressway-flat-out': { name: 'Benin–Auchi Flat Out', lengthM: 3202, laps: 1, checkpointsM: [801, 1601, 2402, 3202] },
  'ihumudumu-circuit': { name: 'Ihumudumu Circuit', lengthM: 5265, laps: 2, checkpointsM: [1316, 2632, 3948, 5265] },
  'g1-aau-run': { name: 'G1 → AAU Gate Run', lengthM: 3634, laps: 1, checkpointsM: [908, 1817, 2725, 3634] },
  'osimen-road-rush': { name: 'Osimen Road Rush', lengthM: 3799, laps: 1, checkpointsM: [950, 1900, 2849, 3799] },
}

export type TrialCheck = { ok: true } | { ok: false; reason: string; error: string }

/** The fastest a car can go, m/s (its top speed with its engine upgrades, and 3% for rounding). */
export const topSpeed = (model: string, engineLevel = 0) => ((carById(model)?.topKmh ?? 180) / 3.6) * (1 + EFFECT.engineTop * Math.max(0, Math.min(3, engineLevel))) * 1.03

const MAX_MS = 20 * 60 * 1000
/** A phone's clock may run this far past the server's wall clock before we call it a lie (network and frame jitter). */
export const CLOCK_SLACK_MS = 1500
/** Time allowed for a stretch is this share of the fastest the car could cover it. */
const FLOOR = 0.97

/**
 * Is this a possible run? `ms` is the finish time and `splits` the time each checkpoint was cleared
 * (the last is the finish). `elapsedMs` is how long the server saw the trial open.
 */
export function checkTrial(input: { courseId: string; model: string; engine?: number; ms: number; splits: number[]; elapsedMs: number }): TrialCheck {
  const course = COURSES[input.courseId]
  const reject = (reason: string, error: string): TrialCheck => ({ ok: false, reason, error })
  if (!course) return reject('NO_COURSE', 'That route does not exist.')
  const { ms, splits, elapsedMs } = input
  if (!Number.isInteger(ms) || ms <= 0 || ms > MAX_MS) return reject('BAD_TIME', 'That time is not valid.')
  if (splits.length !== course.checkpointsM.length) return reject('CHECKPOINTS', 'You missed a checkpoint.')
  const top = topSpeed(input.model, input.engine ?? 0)
  let prev = 0
  let prevM = 0
  for (let i = 0; i < splits.length; i++) {
    const t = splits[i]!
    if (!Number.isInteger(t) || t <= prev) return reject('ORDER', 'Checkpoints out of order.')
    const need = ((course.checkpointsM[i]! - prevM) / top) * 1000 * FLOOR
    if (t - prev < need) return reject('TOO_FAST', 'That is faster than the car can go.')
    prev = t
    prevM = course.checkpointsM[i]!
  }
  // The last split IS the finish
  if (Math.abs(splits[splits.length - 1]! - ms) > 60) return reject('FINISH', 'The finish time does not match.')
  if (ms < (course.lengthM / top) * 1000 * FLOOR) return reject('TOO_FAST', 'That is faster than the car can go.')
  if (ms > elapsedMs + CLOCK_SLACK_MS) return reject('CLOCK', 'That time is longer than the run took.')
  return { ok: true }
}
