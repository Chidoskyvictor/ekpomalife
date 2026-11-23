import { GRIP, bodyFor, drive, newBody, suspend, type Body, type Tune } from './car-physics'
import { carById } from './cars-rules'
import { advance, newTracker, pointOnCourse, type Course, type Tracker } from './race-courses'

/*
 * AI drivers: they follow a course's racing line with the same car physics you drive with (same
 * pull, same grip, same braking), so they speed up out of corners and brake for hairpins like a
 * car would. Skill 0..1 sets how much of the car they use: a sleepy driver brakes early and never
 * flat-out, a sharp one is within a whisker of you. Nobody is perfect, so the player can win.
 */

/** Metres per map unit in the street world (matches the player's car). */
const UNIT = 2.5

/** How a driver behaves: where on the road they sit, how hard they push, how late they brake, how much they wander. */
export type Personality = 'aggressive' | 'smooth' | 'cautious' | 'erratic'
const PERSONALITIES: Record<Personality, { lane: [number, number]; skill: [number, number]; brake: number; weave: number; nerve: number }> = {
  // lane: metres off the racing line (+ left); brake: braking strength; weave: sideways wander; nerve: closeness it will tail a car
  aggressive: { lane: [-1.2, 1.2], skill: [0.88, 0.97], brake: 1.25, weave: 0.6, nerve: 5 },
  smooth: { lane: [-0.4, 0.4], skill: [0.84, 0.94], brake: 1, weave: 0.1, nerve: 9 },
  cautious: { lane: [1.8, 3.2], skill: [0.7, 0.82], brake: 0.8, weave: 0.2, nerve: 14 },
  erratic: { lane: [-3, 3], skill: [0.74, 0.95], brake: 0.9, weave: 2.2, nerve: 7 },
}

export type AiRacer = {
  personality: Personality
  /** Preferred offset from the racing line (m, left positive) and a phase for its wandering. */
  lane: number
  phase: number
  id: string
  name: string
  model: string
  color: string
  /** 0.7 (slow) .. 0.97 (sharp). */
  skill: number
  body: Body
  tracker: Tracker
  /** Time (ms from green) this one crossed the line. */
  finishedAt: number | null
  /** Pedals as last set, for the brake lights. */
  braking: boolean
}

/** Per-point sideways acceleration need: heading change over ~30 m. Cached per course. */
const bends = new WeakMap<Course, Float32Array>()
function bendsOf(course: Course) {
  let hit = bends.get(course)
  if (!hit) {
    const { pts, at } = course
    const n = pts.length
    hit = new Float32Array(n)
    const head = (i: number) => {
      const a = pts[Math.max(0, i - 1)]!
      const b = pts[Math.min(n - 1, i + 1)]!
      return Math.atan2(b[0] - a[0], b[1] - a[1])
    }
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 3)
      const b = Math.min(n - 1, i + 3)
      let d = head(b) - head(a)
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      hit[i] = Math.abs(d) / Math.max(1, at[b]! - at[a]!)
    }
    bends.set(course, hit)
  }
  return hit
}

export function tuneFor(model: string, skill: number): Tune {
  const spec = carById(model)
  const top = ((spec?.topKmh ?? 180) / 3.6) * (0.88 + 0.1 * skill)
  return { top, topGrass: 4.6 * UNIT, gas: (spec?.accel ?? 5) * UNIT * (0.9 + 0.1 * skill), reverse: 3 * UNIT, brake: 13 * UNIT, drag: 2.4 * UNIT }
}

export function makeAi(course: Course, slot: { x: number; z: number; h: number }, info: { id: string; name: string; model: string; color: string; skill: number; personality?: Personality; lane?: number; phase?: number }): AiRacer {
  return { personality: 'smooth', lane: 0, phase: 0, ...info, body: newBody(slot.x, slot.z, slot.h), tracker: newTracker(), finishedAt: null, braking: false }
}

/** The speed (m/s) this car should be doing now: fast on straights, slow enough for each bend it can see. */
export function targetSpeed(course: Course, ai: AiRacer, top: number) {
  const bend = bendsOf(course)
  const body = bodyFor(ai.model)
  const grip = GRIP[body.drive].limit * (0.72 + 0.2 * ai.skill)
  const brakeDecel = 10 * (0.7 + 0.3 * ai.skill) * PERSONALITIES[ai.personality].brake
  let best = top
  const i0 = ai.tracker.idx
  // Look 0..220 m ahead, a point every ~12 m
  for (let k = 0; k < 18; k++) {
    const i = Math.min(course.pts.length - 1, i0 + k * 2)
    const dist = Math.max(0, course.at[i]! - course.at[i0]!)
    const bendNow = bend[i]!
    const cornerSpeed = bendNow > 0.0008 ? Math.sqrt(grip / bendNow) : Infinity
    // The speed we may have now to still make that corner after braking over `dist`
    const allowed = Math.sqrt(cornerSpeed * cornerSpeed + 2 * brakeDecel * dist)
    if (allowed < best) best = allowed
  }
  return Math.max(6, best)
}

const wrap = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

/** One physics step for an AI racer. `go` is false before the lights: it sits on the line. Returns nothing; state is in `ai`. */
export function stepAi(course: Course, ai: AiRacer, dt: number, go: boolean, tMs: number, others: { x: number; z: number }[] = []) {
  const b = ai.body
  const shape = bodyFor(ai.model)
  const tune = tuneFor(ai.model, ai.skill)
  if (ai.finishedAt !== null) {
    // Cooled off after the line: roll to a stop
    const step = drive(b, { gas: false, brake: true, steer: 0 }, shape, tune, 'road', dt, true)
    b.x = step.x
    b.z = step.z
    b.h = step.h
    suspend(b, step.aLong, step.aLat, 0, dt)
    ai.braking = true
    return
  }
  const lookAhead = 9 + Math.abs(b.v) * 0.45
  const [px, pz] = pointOnCourse(course, ai.tracker.progress + lookAhead)
  const [qx, qz] = pointOnCourse(course, ai.tracker.progress + lookAhead + 3)
  const ph = Math.atan2(qx - px, qz - pz)
  const per = PERSONALITIES[ai.personality]
  // Sit in its own part of the road, wandering a little, and move over for any car alongside or just ahead
  let side = ai.lane + Math.sin(tMs / 1000 / 2.3 + ai.phase) * per.weave
  let ease = 1
  for (const o of others) {
    const dx = o.x - b.x
    const dz = o.z - b.z
    const ahead = dx * Math.sin(b.h) + dz * Math.cos(b.h)
    const left = dx * Math.cos(b.h) - dz * Math.sin(b.h)
    if (ahead > -4 && ahead < per.nerve + 6 && Math.abs(left) < 3.4) {
      side += left > 0 ? -2.6 : 2.6
      if (ahead > 0 && ahead < per.nerve) ease = Math.min(ease, 0.6 + ahead / (per.nerve * 2.5))
    }
  }
  side = Math.max(-5, Math.min(5, side))
  // left of travel is (cos h, -sin h)
  const tx = px + Math.cos(ph) * side
  const tz = pz - Math.sin(ph) * side
  const err = wrap(Math.atan2(tx - b.x, tz - b.z) - b.h)
  const steer = Math.max(-1, Math.min(1, err * 2.4))
  const want = go ? targetSpeed(course, ai, tune.top) * ease : 0
  const gas = go && b.v < want - 0.4
  const brake = !go || b.v > want + 1.2
  const step = drive(b, { gas, brake: brake && !gas, steer }, shape, tune, 'road', dt, !go)
  b.x = step.x
  b.z = step.z
  b.h = step.h
  suspend(b, step.aLong, step.aLat, 0, dt)
  ai.braking = brake && b.v > 1
  if (go) {
    ai.tracker = advance(course, ai.tracker, b.x, b.z, tMs)
    if (ai.tracker.finished) ai.finishedAt = tMs
  }
}

/** Drivers' names for the field: Ekpoma-flavoured handles. */
export const AI_NAMES = ['@Odogwu_Speed', '@Sazza_Boy', '@IyaOla_Racer', '@Chairman_Ekpoma', '@Ujemen_Flash', '@G1_Ghost', '@Wahala_Wheels', '@Ihumudumu_King']
const PAINTS = ['#c9ccd1', '#f2f2ef', '#111317', '#7a1c22', '#1f2a44', '#2f6bf0', '#e46a1c']
/** A car near the player's own class, so the race is close. */
const NEAR: Record<string, string[]> = {
  corolla: ['corolla', 'camry'],
  camry: ['corolla', 'camry', 'es350'],
  es350: ['camry', 'es350', 'scout'],
  scout: ['es350', 'scout', 'rx350'],
  rx350: ['scout', 'rx350', 'gla'],
  gla: ['rx350', 'gla', 'gle43'],
  gle43: ['gla', 'gle43', 'suv'],
  suv: ['gle43', 'suv', 'gt3'],
  gt3: ['suv', 'gt3', 'gt3'],
}

/** The AI field for a race: `count` drivers of different skill in cars like yours. Seeded so a retry is the same field. */
export function aiField(playerModel: string, count: number, seed: number) {
  let s = seed >>> 0 || 1
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  const pool = NEAR[playerModel] ?? NEAR.corolla!
  const names = [...AI_NAMES].sort(() => rnd() - 0.5)
  // Different characters: shuffle the four personalities so a small field is never all alike
  const kinds = (Object.keys(PERSONALITIES) as Personality[]).sort(() => rnd() - 0.5)
  return Array.from({ length: count }, (_, i) => {
    const personality = kinds[i % kinds.length]!
    const p = PERSONALITIES[personality]
    const between = ([lo, hi]: [number, number]) => lo + rnd() * (hi - lo)
    return {
      id: `ai-${i}`,
      name: names[i % names.length]!,
      model: pool[Math.floor(rnd() * pool.length)]!,
      color: PAINTS[Math.floor(rnd() * PAINTS.length)]!,
      skill: between(p.skill),
      personality,
      lane: between(p.lane),
      phase: rnd() * 6.28,
    }
  })
}
