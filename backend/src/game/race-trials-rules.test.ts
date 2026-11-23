import { describe, expect, it } from 'vitest'
import { CLOCK_SLACK_MS, COURSES, checkTrial, topSpeed } from './race-trials-rules.js'

const ID = 'expressway-flat-out'
const course = COURSES[ID]!
/** A believable run: Camry (200 km/h) at 85% of its top speed the whole way. */
function honest(model = 'camry', share = 0.85) {
  const v = topSpeed(model) * share
  const splits = course.checkpointsM.map((m) => Math.round((m / v) * 1000))
  return { courseId: ID, model, ms: splits[splits.length - 1]!, splits, elapsedMs: splits[splits.length - 1]! + 4000 }
}

describe('checkTrial', () => {
  it('accepts an honest run', () => {
    expect(checkTrial(honest())).toEqual({ ok: true })
  })

  it('rejects an unknown route', () => {
    expect(checkTrial({ ...honest(), courseId: 'nope' })).toMatchObject({ ok: false, reason: 'NO_COURSE' })
  })

  it('rejects a time faster than the car can go over the length', () => {
    const fast = honest('corolla', 1.5)
    expect(checkTrial(fast)).toMatchObject({ ok: false, reason: 'TOO_FAST' })
  })

  it('a faster car may run a faster time than a slow one', () => {
    const run = honest('gt3', 0.95)
    expect(checkTrial(run)).toEqual({ ok: true })
    // the same run in a Corolla is impossible
    expect(checkTrial({ ...run, model: 'corolla' })).toMatchObject({ ok: false, reason: 'TOO_FAST' })
  })

  it('rejects a missing checkpoint', () => {
    const run = honest()
    expect(checkTrial({ ...run, splits: run.splits.slice(1) })).toMatchObject({ ok: false, reason: 'CHECKPOINTS' })
    expect(checkTrial({ ...run, splits: [...run.splits, run.ms + 10] })).toMatchObject({ ok: false, reason: 'CHECKPOINTS' })
  })

  it('rejects checkpoints out of order or repeated', () => {
    const run = honest()
    const swapped = [run.splits[1]!, run.splits[0]!, run.splits[2]!, run.splits[3]!]
    expect(checkTrial({ ...run, splits: swapped })).toMatchObject({ ok: false, reason: 'ORDER' })
    expect(checkTrial({ ...run, splits: [run.splits[0]!, run.splits[0]!, run.splits[2]!, run.splits[3]!] })).toMatchObject({ ok: false, reason: 'ORDER' })
  })

  it('rejects a stretch too quick even when the total looks fine', () => {
    const run = honest('camry', 0.6)
    // all the time spent early, the last three checkpoints crammed into a second: impossible speed
    const crammed = [run.splits[2]!, run.splits[2]! + 300, run.splits[2]! + 600, run.ms]
    expect(checkTrial({ ...run, splits: crammed })).toMatchObject({ ok: false, reason: 'TOO_FAST' })
  })

  it('rejects a finish time that does not match the last checkpoint', () => {
    const run = honest()
    expect(checkTrial({ ...run, ms: run.ms + 5000, elapsedMs: run.elapsedMs + 5000 })).toMatchObject({ ok: false, reason: 'FINISH' })
  })

  it('rejects a time longer than the server saw the run take', () => {
    const run = honest()
    expect(checkTrial({ ...run, elapsedMs: run.ms - CLOCK_SLACK_MS - 500 })).toMatchObject({ ok: false, reason: 'CLOCK' })
    // a little clock jitter is fine
    expect(checkTrial({ ...run, elapsedMs: run.ms - 800 })).toEqual({ ok: true })
  })

  it('rejects silly numbers', () => {
    const run = honest()
    expect(checkTrial({ ...run, ms: -5 })).toMatchObject({ ok: false, reason: 'BAD_TIME' })
    expect(checkTrial({ ...run, ms: 1.5 })).toMatchObject({ ok: false, reason: 'BAD_TIME' })
    expect(checkTrial({ ...run, ms: 99_999_999 })).toMatchObject({ ok: false, reason: 'BAD_TIME' })
  })

  it('knows every route has rising checkpoints ending at the length', () => {
    for (const c of Object.values(COURSES)) {
      expect([...c.checkpointsM].sort((a, b) => a - b)).toEqual(c.checkpointsM)
      expect(c.checkpointsM[c.checkpointsM.length - 1]).toBe(c.lengthM)
    }
  })
})
