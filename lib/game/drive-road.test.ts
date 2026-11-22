import { describe, expect, it } from 'vitest'
import { GANTRIES, ROADS, ROAD_PLACES, ROAD_SCALE, SCENE_ROADS, driveStartFrom, drivable, guide, pointAt, routeAhead } from './drive-road'

/* The whole town is ~600 km of road: test the long roads and a fixed sample of streets. */
const SAMPLE = ROADS.filter((r, i) => r.kind !== 'street' || i % 150 === 0)

/* The road arrows must never point two ways at once, and must not flip as the car drives on. */

const angleGap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))

/** Every few metres along every road, facing both ways. */
function spots(step = 307) {
  const out: { x: number; z: number; h: number; road: string; s: number; dir: number }[] = []
  for (const road of SAMPLE) {
    for (let s = 12; s < road.length - 12; s += step) {
      const p = pointAt(road, s)
      for (const dir of [1, -1]) out.push({ x: p.x, z: p.z, h: Math.atan2(p.dx * dir, p.dz * dir), road: road.id, s, dir })
    }
  }
  return out
}

const goals = ROAD_PLACES.filter((p, i) => !p.inside && i % 6 === 0).map((p) => p.id)

describe('route arrows', { timeout: 180_000 }, () => {
  it('never point back against the way they lead (no two directions at once)', () => {
    const bad: string[] = []
    for (const goal of goals) {
      for (const at of spots()) {
        const pts = routeAhead(at.x, at.z, at.h, goal, 9, 330)
        // Along the arrows, the way they point should not suddenly reverse
        for (let i = 1; i < pts.length; i++) {
          const [x0, z0] = pts[i - 1]!
          const [x1, z1, h1] = pts[i]!
          const step = Math.hypot(x1 - x0, z1 - z0)
          if (step < 0.5) continue
          // Arrow heading vs the line from the previous arrow: an arrow pointing back at the last one is wrong
          const travel = Math.atan2(x1 - x0, z1 - z0)
          if (angleGap(travel, h1) > 2.4 && step > 3) {
            bad.push(`${goal} from ${at.road}@${Math.round(at.s)} dir ${at.dir}: arrow ${i}`)
            break
          }
        }
      }
    }
    expect(bad.slice(0, 10)).toEqual([])
  })

  // Passing a turn can rightly change the plan once (missed it: now turn around). What must not
  // happen is flip-flopping: plan A, then B, then A again a few metres on.
  it('does not flip-flop between ahead and behind as the car drives on', () => {
    const flips: string[] = []
    for (const goal of goals) {
      for (const road of SAMPLE) {
        for (let s = 20; s < road.length - 30; s += 211) {
          for (const dir of [1, -1]) {
            const at = [0, 4, 8].map((k) => pointAt(road, s + dir * k))
            const h = Math.atan2(at[0]!.dx * dir, at[0]!.dz * dir)
            const g = at.map((q) => guide(q.x, q.z, h, goal))
            if (g.some((x) => !x)) continue
            const back = g.map((x) => x!.turn === 'uturn')
            if (back[0] === back[2] && back[0] !== back[1]) flips.push(`${goal} on ${road.id}@${s} dir ${dir}: ${g.map((x) => x!.turn).join(' -> ')}`)
          }
        }
      }
    }
    expect(flips.slice(0, 10)).toEqual([])
  })
})

describe('map data', () => {
  it('is real scale and every place is reachable by road from the expressway', () => {
    const start = pointAt(ROADS.find((r) => r.id === 'expressway')!, 1000)
    expect(ROAD_SCALE).toBe(1)
    for (const p of ROAD_PLACES) expect(guide(start.x, start.z, 0, p.id), p.id).not.toBeNull()
  })

  it('starts every drive on tarmac', () => {
    for (const p of ROAD_PLACES) {
      const at = driveStartFrom(p.id)
      expect(drivable(at.x, at.z), p.id).toBe(true)
    }
  })

  it('keeps the drawn scene small and has a gantry for every area', () => {
    expect(SCENE_ROADS.reduce((sum, r) => sum + r.length, 0)).toBeLessThan(80_000)
    for (const area of ['IRUEKPEN', 'UJEMEN', 'EKPOMA', 'AKHIA', 'EGORO', 'AAU MAIN GATE']) expect(GANTRIES.some((g) => g.text === area), area).toBe(true)
  })
})
