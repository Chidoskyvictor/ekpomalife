import { LANE, MID_LANE, ROAD_PLACES, pointAt, roadById, routeAhead, spotAt, placeSpot } from './drive-road'

/*
 * Racing courses on the real Ekpoma roads, and the pure timing maths that goes with them (no React,
 * no three.js: unit-tested in race-courses.test.ts).
 *
 * A course is a polyline of points down the racing lane, one every ~6 m. A SPRINT runs once from A to B;
 * a CIRCUIT is an out-and-back stretch with a hairpin at each end, run for several laps (the path is the
 * laps laid end to end). Checkpoints are distances along that path; a racer must clear them in order
 * and then cross the line, which is what the server checks a time trial against.
 */

export type Pt = [number, number]
export type CourseKind = 'sprint' | 'circuit'

type Def = {
  id: string
  name: string
  blurb: string
  /** Emoji for the card. */
  icon: string
  kind: CourseKind
  laps: number
  road: string
  from: number
  to: number
}

/**
 * The named routes. The matching table in backend/src/game/race-trials.ts holds each one's length and
 * checkpoint count for the server's checks; race-courses.test.ts fails if the two drift apart.
 */
export const COURSE_DEFS: Def[] = [
  {
    id: 'expressway-flat-out',
    name: 'Benin–Auchi Flat Out',
    blurb: 'Three km of dual carriageway, nothing to turn for. Foot down.',
    icon: '🛣️',
    kind: 'sprint',
    laps: 1,
    road: 'expressway',
    from: 2300,
    to: 5500,
  },
  {
    id: 'ihumudumu-circuit',
    name: 'Ihumudumu Circuit',
    blurb: '2 laps. A hairpin at each end: brake late or run wide.',
    icon: '🔁',
    kind: 'circuit',
    laps: 2,
    road: 'ihumudumu-road',
    from: 2000,
    to: 3300,
  },
  {
    id: 'g1-aau-run',
    name: 'G1 → AAU Gate Run',
    blurb: 'Out of G1, along the expressway to the school gate. Know your turns.',
    icon: '🎓',
    kind: 'sprint',
    laps: 1,
    road: 'g1-road',
    from: 30,
    to: 0,
  },
  {
    id: 'osimen-road-rush',
    name: 'Osimen Road Rush',
    blurb: 'Long and quick through the bush side of town. Watch the bends.',
    icon: '⚡',
    kind: 'sprint',
    laps: 1,
    road: 'emando-osimen-road',
    from: 600,
    to: 4400,
  },
]

export type Course = {
  id: string
  name: string
  blurb: string
  icon: string
  kind: CourseKind
  laps: number
  /** The whole run, laps laid end to end. */
  pts: Pt[]
  /** Distance along the path at each point. */
  at: number[]
  /** Metres of one lap (the whole sprint). */
  lap: number
  /** Metres of the whole run. */
  length: number
  /** Distance of each checkpoint along the run; the last one is the finish line. */
  checkpoints: number[]
  start: { x: number; z: number; h: number }
}

export const STEP = 6

export function headingAt(pts: Pt[], i: number) {
  const a = pts[Math.max(0, Math.min(pts.length - 2, i))]!
  const b = pts[Math.max(1, Math.min(pts.length - 1, i + 1))]!
  return Math.atan2(b[0] - a[0], b[1] - a[1])
}

/** Cumulative distance along a polyline. */
export function cumulative(pts: Pt[]) {
  const at = [0]
  for (let i = 1; i < pts.length; i++) at.push(at[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]))
  return at
}

/** Checkpoints for a run: three on the way plus the line for a sprint; the far hairpin and the line each lap for a circuit. */
export function checkpointsFor(kind: CourseKind, lap: number, laps: number) {
  if (kind === 'circuit') {
    const out: number[] = []
    for (let k = 0; k < laps; k++) out.push(lap * (k + 0.5), lap * (k + 1))
    return out
  }
  return [lap * 0.25, lap * 0.5, lap * 0.75, lap]
}

/** A course from the points of one lap (the whole run for a sprint), with its checkpoints. */
export function makeCourse(meta: Pick<Course, 'id' | 'name' | 'blurb' | 'icon' | 'kind' | 'laps'>, lapPts: Pt[]): Course {
  const lapAt = cumulative(lapPts)
  const lap = lapAt[lapAt.length - 1]!
  const pts: Pt[] = []
  for (let k = 0; k < meta.laps; k++) for (let i = k === 0 ? 0 : 1; i < lapPts.length; i++) pts.push(lapPts[i]!)
  const at = cumulative(pts)
  const first = pts[0]!
  return { ...meta, pts, at, lap, length: at[at.length - 1]!, checkpoints: checkpointsFor(meta.kind, lap, meta.laps), start: { x: first[0], z: first[1], h: headingAt(pts, 0) } }
}

/** Points down the middle lane of a road from `from` to `to` (either direction). */
function lanePoints(roadId: string, from: number, to: number, outer = false): Pt[] {
  const road = roadById(roadId)
  const lane = (outer ? LANE : MID_LANE)[road.kind]
  const dir = Math.sign(to - from) || 1
  const out: Pt[] = []
  for (let s = from; dir > 0 ? s < to : s > to; s += dir * STEP) {
    const p = spotAt(roadId, s, dir * lane)
    out.push([p.x, p.z])
  }
  const end = spotAt(roadId, to, dir * lane)
  out.push([end.x, end.z])
  return out
}

/** A hairpin: half a circle from the lane you came along to the one you leave by, bulging the way the road was heading. */
function hairpin(from: Pt, to: Pt, heading: Pt): Pt[] {
  const cx = (from[0] + to[0]) / 2
  const cz = (from[1] + to[1]) / 2
  const r = Math.hypot(to[0] - from[0], to[1] - from[1]) / 2
  const a0 = Math.atan2(from[0] - cx, from[1] - cz)
  const mid = Math.atan2(heading[0], heading[1])
  const swing = Math.sin(mid - a0) > 0 ? 1 : -1
  const out: Pt[] = []
  for (let k = 1; k < 12; k++) {
    const a = a0 + swing * Math.PI * (k / 12)
    out.push([cx + Math.sin(a) * r, cz + Math.cos(a) * r])
  }
  return out
}

function circuitLap(roadId: string, from: number, to: number): Pt[] {
  const road = roadById(roadId)
  // The outer lanes: the widest hairpin the road allows
  const out = lanePoints(roadId, from, to, true)
  const back = lanePoints(roadId, to, from, true)
  const far = pointAt(road, to)
  const near = pointAt(road, from)
  return [...out, ...hairpin(out[out.length - 1]!, back[0]!, [far.dx, far.dz]), ...back, ...hairpin(back[back.length - 1]!, out[0]!, [-near.dx, -near.dz])]
}

/** The lane arrows from a point on a road to a place, as a path (the same route the GPS shows). */
function throughStreets(roadId: string, s: number, placeId: string): Pt[] {
  const road = roadById(roadId)
  let best: Pt[] = []
  for (const dir of [1, -1]) {
    const spot = spotAt(roadId, s, dir * MID_LANE[road.kind])
    const h = Math.atan2(spot.dx * dir, spot.dz * dir)
    const pts = routeAhead(spot.x, spot.z, h, placeId, STEP, 1e9)
    const path: Pt[] = [[spot.x, spot.z], ...pts.map((p): Pt => [p[0], p[1]])]
    if (path.length > best.length) best = path
  }
  return best
}

let cache: Course[] | null = null
/** Every named course (built once, on first use). */
export function courses(): Course[] {
  if (cache) return cache
  cache = COURSE_DEFS.map((d) => {
    const meta = { id: d.id, name: d.name, blurb: d.blurb, icon: d.icon, kind: d.kind, laps: d.laps }
    if (d.id === 'g1-aau-run') return makeCourse(meta, throughStreets(d.road, d.from, 'aau-gate'))
    if (d.kind === 'circuit') return makeCourse(meta, circuitLap(d.road, d.from, d.to))
    return makeCourse(meta, lanePoints(d.road, d.from, d.to))
  })
  return cache
}
export const courseById = (id: string) => courses().find((c) => c.id === id) ?? null

/** A sprint from wherever you are to a place on the roads. Null if the roads do not lead there. */
export function sprintFrom(x: number, z: number, h: number, destId: string): Course | null {
  const place = ROAD_PLACES.find((p) => p.id === destId)
  if (!place) return null
  const pts = routeAhead(x, z, h, destId, STEP, 1e9)
  if (pts.length < 20) return null
  const goal = placeSpot(destId)
  const path: Pt[] = [[x, z], ...pts.map((p): Pt => [p[0], p[1]])]
  if (goal) path.push([goal.x, goal.z])
  return makeCourse({ id: `sprint-${destId}`, name: `To ${place.label}`, blurb: 'Your own sprint.', icon: '🏁', kind: 'sprint', laps: 1 }, path)
}

/** A named course's start line as a place the GPS can lead you to (registered once; arrows and map then work as for any place). `inside` keeps it out of "park here" and the place lists. */
export function startPlaceId(course: Course) {
  const id = `race-start-${course.id}`
  const def = COURSE_DEFS.find((d) => d.id === course.id)
  if (def && !ROAD_PLACES.some((p) => p.id === id)) {
    ROAD_PLACES.push({ id, label: `${course.name}: start`, road: def.road, s: def.from, side: Math.sign(def.to - def.from) || 1, inside: 'race' })
  }
  return id
}

/* —— timing —— */

/** 1:02.45 (minutes:seconds.hundredths), or 45.12 under a minute. */
export function formatRaceTime(ms: number) {
  const total = Math.max(0, Math.round(ms / 10))
  const cs = total % 100
  const s = Math.floor(total / 100) % 60
  const m = Math.floor(total / 6000)
  const two = (n: number) => String(n).padStart(2, '0')
  return m > 0 ? `${m}:${two(s)}.${two(cs)}` : `${s}.${two(cs)}`
}

/** "+1.20" or "-0.45": how far behind (+) or ahead (-) a time is. */
export function formatGap(ms: number) {
  return `${ms < 0 ? '-' : '+'}${(Math.abs(ms) / 1000).toFixed(2)}`
}

export const kmLabel = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`)

export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`

/* —— tracking a racer along the path —— */

export type Tracker = {
  /** How far along the run the racer is (m); never goes back. */
  progress: number
  /** How many checkpoints are cleared (the last one is the finish). */
  passed: number
  /** Time (ms from the green light) each checkpoint was cleared. */
  splits: number[]
  finished: boolean
  /** Distance from the racing line (m): large means off course. */
  off: number
  idx: number
}

/** How close to a checkpoint's point counts as clearing it (m): a few lanes wide. */
export const CHECKPOINT_REACH = 30
/** More than this far from the path and your progress stops counting. */
export const OFF_COURSE = 60

export const newTracker = (): Tracker => ({ progress: 0, passed: 0, splits: [], finished: false, off: 0, idx: 0 })

/** The point at a distance along the path. */
export function pointOnCourse(course: Pick<Course, 'pts' | 'at'>, d: number): Pt {
  const { pts, at } = course
  if (d <= 0) return pts[0]!
  if (d >= at[at.length - 1]!) return pts[pts.length - 1]!
  let lo = 0
  let hi = at.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (at[mid]! <= d) lo = mid
    else hi = mid
  }
  const t = (d - at[lo]!) / (at[hi]! - at[lo]! || 1)
  return [pts[lo]![0] + (pts[hi]![0] - pts[lo]![0]) * t, pts[lo]![1] + (pts[hi]![1] - pts[lo]![1]) * t]
}

/**
 * Move a tracker to where the racer is now, `tMs` after the green light. Progress follows the nearest
 * point just ahead of the last one (never behind, never a huge jump), so cutting across or turning
 * round cannot skip checkpoints, and a checkpoint counts only in order and only when you are at it.
 */
export function advance(course: Course, t: Tracker, x: number, z: number, tMs: number): Tracker {
  if (t.finished) return t
  const { pts, at } = course
  let best = t.idx
  let bestD = Infinity
  const last = Math.min(pts.length - 1, t.idx + 90)
  for (let i = Math.max(0, t.idx - 3); i <= last; i++) {
    const d = Math.hypot(pts[i]![0] - x, pts[i]![1] - z)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  const next: Tracker = { ...t, off: bestD, splits: t.splits.slice() }
  if (bestD > OFF_COURSE) return next
  next.idx = best
  next.progress = Math.max(t.progress, at[best]!)
  while (next.passed < course.checkpoints.length) {
    const cp = course.checkpoints[next.passed]!
    const [px, pz] = pointOnCourse(course, cp)
    if (next.progress < cp - CHECKPOINT_REACH * 0.5 || Math.hypot(px - x, pz - z) > CHECKPOINT_REACH) break
    next.splits.push(Math.max(0, Math.round(tMs)))
    next.passed += 1
  }
  next.finished = next.passed >= course.checkpoints.length
  return next
}

/** Order racers: finished ones by finish time, the rest by how far they have got. Returns indexes, first place first. */
export function rankRacers(racers: { progress: number; finishedAt: number | null }[]) {
  return racers
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      if (a.r.finishedAt !== null && b.r.finishedAt !== null) return a.r.finishedAt - b.r.finishedAt
      if (a.r.finishedAt !== null) return -1
      if (b.r.finishedAt !== null) return 1
      return b.r.progress - a.r.progress
    })
    .map((x) => x.i)
}
