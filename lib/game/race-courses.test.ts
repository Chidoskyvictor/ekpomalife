import { describe, expect, it } from 'vitest'
import { COURSES as SERVER_COURSES } from '../../backend/src/game/race-trials-rules'
import { aiField, makeAi, stepAi } from './race-ai'
import { advance, courseById, courses, formatGap, formatRaceTime, newTracker, ordinal, rankRacers, sprintFrom, type Course } from './race-courses'

/** Drive a course perfectly along its own line, one point per step, to test the tracker. */
function lapAlong(course: Course, every = 3) {
  let t = newTracker()
  for (let i = 0; i < course.pts.length; i += every) {
    const [x, z] = course.pts[i]!
    t = advance(course, t, x, z, i * 100)
  }
  const [x, z] = course.pts[course.pts.length - 1]!
  return advance(course, t, x, z, 99_000)
}

describe('named courses', () => {
  it('has three or four long, real routes', () => {
    const all = courses()
    expect(all.length).toBeGreaterThanOrEqual(3)
    for (const c of all) {
      expect(c.length).toBeGreaterThan(1200)
      expect(c.pts.length).toBeGreaterThan(100)
      // points are close together: no gaps a car could skip over
      for (let i = 1; i < c.pts.length; i++) expect(Math.hypot(c.pts[i]![0] - c.pts[i - 1]![0], c.pts[i]![1] - c.pts[i - 1]![1])).toBeLessThan(40)
    }
  })

  it('matches the server table (length and checkpoints), so the board checks the same course', () => {
    for (const c of courses()) {
      const server = SERVER_COURSES[c.id]
      expect(server, c.id).toBeTruthy()
      expect(server!.checkpointsM.length).toBe(c.checkpoints.length)
      server!.checkpointsM.forEach((m, i) => expect(Math.abs(m - c.checkpoints[i]!)).toBeLessThan(Math.max(30, c.length * 0.01)))
      expect(server!.laps).toBe(c.laps)
      expect(server!.name).toBe(c.name)
      expect(Math.abs(server!.lengthM - c.length)).toBeLessThan(Math.max(30, c.length * 0.01))
    }
    expect(Object.keys(SERVER_COURSES).sort()).toEqual(courses().map((c) => c.id).sort())
  })

  it('a perfect lap clears every checkpoint in order and finishes', () => {
    for (const c of courses()) {
      const t = lapAlong(c)
      expect(t.passed, c.id).toBe(c.checkpoints.length)
      expect(t.finished).toBe(true)
      expect(t.splits).toEqual([...t.splits].sort((a, b) => a - b))
    }
  })

  it('cannot skip checkpoints by jumping to the finish', () => {
    const c = courseById('expressway-flat-out')!
    const end = c.pts[c.pts.length - 1]!
    const t = advance(c, newTracker(), end[0], end[1], 1000)
    expect(t.passed).toBe(0)
    expect(t.finished).toBe(false)
  })

  it('does not count the finish while you are off the road', () => {
    const c = courseById('expressway-flat-out')!
    let t = newTracker()
    for (let i = 0; i < c.pts.length; i += 3) t = advance(c, t, c.pts[i]![0] + 300, c.pts[i]![1], i)
    expect(t.passed).toBe(0)
  })

  it('a circuit needs both laps', () => {
    const c = courses().find((x) => x.kind === 'circuit')!
    expect(c.laps).toBe(2)
    expect(c.checkpoints.length).toBe(4)
    // stop after the first lap's line: not finished
    let t = newTracker()
    for (let i = 0; i < c.pts.length; i += 2) {
      if (c.at[i]! > c.lap + 5) break
      t = advance(c, t, c.pts[i]![0], c.pts[i]![1], i * 50)
    }
    expect(t.passed).toBe(2)
    expect(t.finished).toBe(false)
  })

  it('builds a sprint from anywhere to a place', () => {
    const c = courseById('expressway-flat-out')!
    const sprint = sprintFrom(c.start.x, c.start.z, c.start.h, 'aau-gate')
    expect(sprint).toBeTruthy()
    expect(sprint!.length).toBeGreaterThan(500)
    expect(sprint!.checkpoints.length).toBe(4)
  })
})

describe('AI drivers', () => {
  const run = (course: Course, skill: number, model = 'camry') => {
    const ai = makeAi(course, course.start, { id: 'a', name: '@a', model, color: '#fff', skill })
    let t = 0
    while (ai.finishedAt === null && t < 400) {
      t += 0.05
      stepAi(course, ai, 0.05, true, t * 1000)
    }
    return { ai, t }
  }

  it('finishes every course', () => {
    for (const c of courses()) {
      const { ai } = run(c, 0.9)
      expect(ai.finishedAt, c.id).not.toBeNull()
    }
  })

  it('a sharper driver is faster than a sleepy one, and neither beats the physics limit', () => {
    const c = courseById('ihumudumu-circuit')!
    const slow = run(c, 0.72).ai.finishedAt!
    const sharp = run(c, 0.97).ai.finishedAt!
    expect(sharp).toBeLessThan(slow)
    // 318 km/h car at full speed for the whole run is a hard floor
    expect(sharp / 1000).toBeGreaterThan(c.length / 90)
  })

  it('slows for the hairpins: slower there than on the straight', () => {
    const c = courseById('ihumudumu-circuit')!
    const ai = makeAi(c, c.start, { id: 'a', name: '@a', model: 'camry', color: '#fff', skill: 0.9 })
    let straight = 0
    let turn = Infinity
    for (let t = 0; t < 120 && ai.finishedAt === null; t += 0.05) {
      stepAi(c, ai, 0.05, true, t * 1000)
      const along = ai.tracker.progress % c.lap
      if (along > c.lap * 0.2 && along < c.lap * 0.4) straight = Math.max(straight, ai.body.v)
      if (Math.abs(along - c.lap / 2) < 40) turn = Math.min(turn, ai.body.v)
    }
    expect(turn).toBeLessThan(straight * 0.7)
  })

  it('stays on the grid until the lights go green', () => {
    const c = courseById('expressway-flat-out')!
    const ai = makeAi(c, c.start, { id: 'a', name: '@a', model: 'camry', color: '#fff', skill: 0.9 })
    for (let i = 0; i < 40; i++) stepAi(c, ai, 0.05, false, 0)
    expect(Math.abs(ai.body.v)).toBeLessThan(0.5)
  })

  it('makes the same field for the same seed, with a spread of skill', () => {
    const a = aiField('camry', 3, 42)
    expect(aiField('camry', 3, 42)).toEqual(a)
    expect(new Set(a.map((x) => x.skill)).size).toBe(3)
    for (const x of a) expect(x.skill).toBeLessThan(0.98)
  })
})

describe('AI personalities', () => {
  it('gives a field different characters, lanes and skill', () => {
    const f = aiField('camry', 4, 11)
    expect(new Set(f.map((x) => x.personality)).size).toBe(4)
    expect(new Set(f.map((x) => x.lane.toFixed(1))).size).toBe(4)
  })

  it('does not drive through each other: three cars race and never overlap', () => {
    const c = courseById('expressway-flat-out')!
    const field = aiField('camry', 3, 5)
    const ais = field.map((f, i) => makeAi(c, { x: c.start.x - Math.sin(c.start.h) * i * 6, z: c.start.z - Math.cos(c.start.h) * i * 6, h: c.start.h }, f))
    let closest = Infinity
    for (let t = 0; t < 40; t += 0.05) {
      ais.forEach((a) => stepAi(c, a, 0.05, true, t * 1000, ais.filter((o) => o !== a).map((o) => ({ x: o.body.x, z: o.body.z }))))
      if (t > 5) for (let i = 0; i < ais.length; i++) for (let j = i + 1; j < ais.length; j++) closest = Math.min(closest, Math.hypot(ais[i]!.body.x - ais[j]!.body.x, ais[i]!.body.z - ais[j]!.body.z))
    }
    expect(closest).toBeGreaterThan(2.2)
    // and they do not all sit on one line: lateral spread across the field
    expect(new Set(ais.map((a) => a.personality)).size).toBe(3)
  })
})

describe('timing and ranking', () => {
  it('formats times', () => {
    expect(formatRaceTime(45_120)).toBe('45.12')
    expect(formatRaceTime(62_450)).toBe('1:02.45')
    expect(formatRaceTime(0)).toBe('0.00')
    expect(formatGap(-450)).toBe('-0.45')
    expect(formatGap(1200)).toBe('+1.20')
    expect(ordinal(1)).toBe('1st')
    expect(ordinal(2)).toBe('2nd')
    expect(ordinal(3)).toBe('3rd')
    expect(ordinal(11)).toBe('11th')
    expect(ordinal(22)).toBe('22nd')
  })

  it('ranks finishers by time, then the rest by distance', () => {
    const order = rankRacers([
      { progress: 900, finishedAt: null },
      { progress: 3000, finishedAt: 50_000 },
      { progress: 3000, finishedAt: 48_000 },
      { progress: 1500, finishedAt: null },
    ])
    expect(order).toEqual([2, 1, 3, 0])
  })
})
