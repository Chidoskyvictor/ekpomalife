import { HALF, JUNCTIONS, MEDIAN, OPENING, ROAD_DIMS, roadById, type Junction, type Road } from './drive-road'

/*
 * The road surfaces as flat buffers (no three.js in here, so it is easy to test): concrete slabs,
 * median, kerbs, pavements and painted lines, cut into 250 m chunks so the phone only draws what is
 * near. Highway: median, then three lanes each way: white dashes between the first two, a solid
 * yellow line before the outer one. Road: two lanes each way and a double yellow centre. Street: one
 * lane each way. Everything is double-sided with its own normals, so winding does not matter.
 */

export type Buf = { pos: number[]; nor: number[]; uv: number[]; col: number[]; idx: number[] }
export type Chunk = { slab: Buf; solid: Buf; line: Buf }

const CHUNK = 250
const newBuf = (): Buf => ({ pos: [], nor: [], uv: [], col: [], idx: [] })
const chunks = new Map<string, Chunk>()

const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255]
const lin = (v: number) => Math.pow(v, 2.2)

function chunkAt(x: number, z: number) {
  const key = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`
  let c = chunks.get(key)
  if (!c) chunks.set(key, (c = { slab: newBuf(), solid: newBuf(), line: newBuf() }))
  return c
}

type V = [number, number, number]

/** One quad (4 corners in order round it) into a buffer, with a flat normal and a colour. */
function quad(b: Buf, p: [V, V, V, V], uv: [number, number][], color: [number, number, number]) {
  const [a, bb, c] = p
  const ux = bb[0] - a[0], uy = bb[1] - a[1], uz = bb[2] - a[2]
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
  const len = Math.hypot(nx, ny, nz) || 1
  nx /= len; ny /= len; nz /= len
  // Floors face up; walls face whichever way the winding says
  if (Math.abs(ny) > 0.7 && ny < 0) { nx = -nx; ny = -ny; nz = -nz }
  const base = b.pos.length / 3
  for (let i = 0; i < 4; i++) {
    b.pos.push(p[i]![0], p[i]![1], p[i]![2])
    b.nor.push(nx, ny, nz)
    b.uv.push(uv[i]![0], uv[i]![1])
    b.col.push(color[0], color[1], color[2])
  }
  b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
}

/* —— points along a road, smoothed so bends have no gaps —— */

type Sample = { s: number; x: number; z: number; rx: number; rz: number }

function pointOn(road: Road, d: number) {
  const at = road.at
  let lo = 1, hi = at.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (at[mid]! < d) lo = mid + 1
    else hi = mid
  }
  const a = road.pts[lo - 1]!, b = road.pts[lo]!
  const seg = at[lo]! - at[lo - 1]! || 1
  const t = Math.max(0, Math.min(1, (d - at[lo - 1]!) / seg))
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t }
}

const SAMPLES = new Map<string, Map<number, Sample>>()
function sampleAt(road: Road, s: number): Sample {
  let cache = SAMPLES.get(road.id)
  if (!cache) SAMPLES.set(road.id, (cache = new Map()))
  const key = Math.round(s * 50)
  let hit = cache.get(key)
  if (!hit) cache.set(key, (hit = sampleRaw(road, s)))
  return hit
}

function sampleRaw(road: Road, s: number): Sample {
  const d = Math.max(0, Math.min(road.length, s))
  const p = pointOn(road, d)
  const a = pointOn(road, Math.max(0, d - 1.5))
  const b = pointOn(road, Math.min(road.length, d + 1.5))
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1
  const tx = (b.x - a.x) / len, tz = (b.z - a.z) / len
  return { s: d, x: p.x, z: p.z, rx: -tz, rz: tx }
}

/** Distances to sample between s0 and s1: every ~5 m, and at every bend of the line. */
function sampleStops(road: Road, s0: number, s1: number, step = 5) {
  const out = [s0]
  for (let s = Math.ceil((s0 + 0.01) / step) * step; s < s1 - 0.01; s += step) out.push(s)
  for (const at of road.at) if (at > s0 + 0.01 && at < s1 - 0.01) out.push(at)
  out.push(s1)
  return out.sort((a, b) => a - b).filter((v, i, all) => i === 0 || v - all[i - 1]! > 0.05)
}

const off = (p: Sample, o: number, y: number): V => [p.x + p.rx * o, y, p.z + p.rz * o]

/** Offsets as a function of distance along the road: a number, or a flared edge. */
type Off = number | ((s: number) => number)
const at = (o: Off, s: number) => (typeof o === 'number' ? o : o(s))

type Layer = 'slab' | 'solid' | 'line'

/** A floor strip between two offsets (right of the centre line), kept where `keep` says. */
function strip(road: Road, layer: Layer, from: Off, to: Off, y: number, s0: number, s1: number, color: string, opts: { keep?: (s: number) => boolean; uvPhase?: number; step?: number } = {}) {
  if (s1 - s0 < 0.05) return
  const col = hex(color).map(lin) as [number, number, number]
  const stops = sampleStops(road, s0, s1, opts.step)
  let prev = sampleAt(road, stops[0]!)
  for (let i = 1; i < stops.length; i++) {
    const cur = sampleAt(road, stops[i]!)
    if (!opts.keep || opts.keep((prev.s + cur.s) / 2)) {
      const f0 = at(from, prev.s), t0 = at(to, prev.s), f1 = at(from, cur.s), t1 = at(to, cur.s)
      const u = (o: number) => (o - (opts.uvPhase ?? 0)) / 7
      quad(chunkAt((prev.x + cur.x) / 2, (prev.z + cur.z) / 2)[layer], [off(prev, f0, y), off(prev, t0, y), off(cur, t1, y), off(cur, f1, y)], [[u(f0), prev.s / 20], [u(t0), prev.s / 20], [u(t1), cur.s / 20], [u(f1), cur.s / 20]], col)
    }
    prev = cur
  }
}

/** A wall along a road at one offset, from y0 up to y1 (the kerb's face, the median's sides). */
function wall(road: Road, o: Off, y0: number, y1: number, s0: number, s1: number, color: string, keep?: (s: number) => boolean) {
  if (s1 - s0 < 0.05) return
  const col = hex(color).map(lin) as [number, number, number]
  const stops = sampleStops(road, s0, s1, 6)
  let prev = sampleAt(road, stops[0]!)
  for (let i = 1; i < stops.length; i++) {
    const cur = sampleAt(road, stops[i]!)
    if (!keep || keep((prev.s + cur.s) / 2)) {
      quad(chunkAt((prev.x + cur.x) / 2, (prev.z + cur.z) / 2).solid, [off(prev, at(o, prev.s), y0), off(cur, at(o, cur.s), y0), off(cur, at(o, cur.s), y1), off(prev, at(o, prev.s), y1)], [[0, 0], [0, 0], [0, 0], [0, 0]], col)
    }
    prev = cur
  }
}

/** A dashed line: `dash` metres painted, `gap` metres bare. */
function dashes(road: Road, o: number, width: number, y: number, s0: number, s1: number, dash: number, gap: number, color: string) {
  for (let s = s0 + gap / 2; s + dash < s1; s += dash + gap) strip(road, 'line', o - width / 2, o + width / 2, y, s, s + dash, color, { step: dash })
}

/** How much of each end of a road lies on the road it meets (its own surface stops at that road's edge). */
export function trims(road: Road) {
  let s0 = 0
  let s1 = road.length
  for (const j of JUNCTIONS) {
    if (j.street !== road.id) continue
    const main = roadById(j.road)
    const reach = HALF[main.kind] - (main.kind === 'highway' ? 1.6 : 0.9)
    if (j.end === 'start') s0 = reach
    else if (j.end === 'end') s1 = road.length - reach
  }
  return [s0, s1] as const
}

const JUNCTIONS_BY_ROAD = (() => {
  const m = new Map<string, Junction[]>()
  for (const j of JUNCTIONS) {
    if (!m.has(j.road)) m.set(j.road, [])
    m.get(j.road)!.push(j)
  }
  return m
})()

/** Height of the carriageway: a side street lies a hair above the road it meets, so they never flicker. */
const SURFACE_Y = { highway: 0.04, road: 0.06, street: 0.08 }
export const KERB_HEIGHT = 0.2
const FLARE = { reach: 6, extra: 3.2 }

const C = { kerb: '#bdbab0', pave: '#8f8e88', median: '#c9c6bb', verge: '#587a3c', white: '#f3f1e6', yellow: '#f2b705' }

/** Build every road's surface into chunks (once). */
export function buildRoadChunks(roads: Road[]): Map<string, Chunk> {
  chunks.clear()
  SAMPLES.clear()
  for (const road of roads) {
    const d = ROAD_DIMS[road.kind]
    const edge = HALF[road.kind]
    const [s0, s1] = road.kind === 'highway' ? [0, road.length] : trims(road)
    const y = SURFACE_Y[road.kind]
    const juncs = JUNCTIONS_BY_ROAD.get(road.id) ?? []
    // Where a side street joins, the kerb and pavement stop and the street flows in
    const gapHalf = (j: Junction) => {
      const st = roadById(j.street)
      return HALF[st.kind] + (st.kind === 'street' ? FLARE.extra : 3) + 1.2
    }
    const gaps = juncs.map((j) => ({ j, s: j.s, half: gapHalf(j) }))
    const open = (side: number) => {
      const mine = gaps.filter((g) => g.j.end === 'mid' || g.j.side === side)
      return (s: number) => {
        for (const g of mine) if (Math.abs(g.s - s) < g.half) return false
        return true
      }
    }
    // A street widens into its junction, like a rounded corner
    const flare = (s: number) => {
      let e = 0
      if (road.kind !== 'highway') {
        if (s0 > 0 && s - s0 < FLARE.reach) e = Math.max(e, FLARE.extra * (1 - (s - s0) / FLARE.reach) ** 2)
        if (s1 < road.length && s1 - s < FLARE.reach) e = Math.max(e, FLARE.extra * (1 - (s1 - s) / FLARE.reach) ** 2)
      }
      return e
    }
    const wide = (side: number) => (s: number) => side * (edge + flare(s))

    // Concrete, laid in slabs (the texture carries the joints and the shade of each slab)
    strip(road, 'slab', (s) => -(edge + flare(s)), (s) => edge + flare(s), y, s0, s1, '#ffffff', { uvPhase: d.inner })

    for (const side of [1, -1]) {
      const keep = open(side)
      const out = (s: number) => edge + flare(s)
      const lo = (v: Off) => (side > 0 ? v : (s: number) => -at(v, s))
      // Kerb: a face and a top, then the pavement
      wall(road, wide(side), y, KERB_HEIGHT, s0, s1, C.kerb, keep)
      strip(road, 'solid', lo(out), lo((s) => out(s) + d.kerb), KERB_HEIGHT, s0, s1, C.kerb, { keep })
      strip(road, 'solid', lo((s) => out(s) + d.kerb), lo((s) => out(s) + d.kerb + d.pave), KERB_HEIGHT, s0, s1, C.pave, { keep })
      // Paint
      const ly = y + 0.014
      if (road.kind === 'highway') {
        const lane = d.lane
        strip(road, 'line', lo(d.inner + lane * 2 - 0.1), lo(d.inner + lane * 2 + 0.1), ly, s0, s1, C.yellow) // solid yellow before the outer lane
        dashes(road, side * (d.inner + lane), 0.16, ly, s0, s1, 3, 6, C.white) // white dashes between the first two
        strip(road, 'line', lo(edge - 0.38), lo(edge - 0.2), ly, s0, s1, C.white, { keep })
        strip(road, 'line', lo(d.inner + 0.2), lo(d.inner + 0.38), ly, s0, s1, C.white)
      } else if (road.kind === 'road') {
        strip(road, 'line', lo(0.12), lo(0.24), ly, s0 + 2, s1 - 2, C.yellow)
        dashes(road, side * (d.inner + d.lane), 0.14, ly, s0 + 2, s1 - 2, 3, 6, C.white)
        strip(road, 'line', lo(edge - 0.35), lo(edge - 0.2), ly, s0, s1, C.white, { keep })
      } else if (side > 0) {
        dashes(road, 0, 0.12, ly, s0 + 2, s1 - 2, 3, 6, C.white)
      }
    }

    // The median: a raised kerb with a grass strip, open at junctions and the ends so you can turn round
    if (road.kind === 'highway') {
      const closed = (s: number) => !(s < 26 || s > road.length - 26 || juncs.some((j) => Math.abs(j.s - s) < OPENING))
      const top = KERB_HEIGHT + 0.12
      strip(road, 'solid', -MEDIAN, MEDIAN, top, 0, road.length, C.median, { keep: closed })
      strip(road, 'solid', -MEDIAN + 0.45, MEDIAN - 0.45, top + 0.02, 0, road.length, C.verge, { keep: closed })
      wall(road, MEDIAN, y, top, 0, road.length, C.median, closed)
      wall(road, -MEDIAN, y, top, 0, road.length, C.median, closed)
    }
  }
  return new Map(chunks)
}
