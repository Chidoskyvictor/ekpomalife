import { Color } from 'three'
import { HALF, ROADS, dividerOpen, ROAD_DIMS, ROAD_PLACES, SCENE_ROADS, locateOn, pointAt, roadsNear, spotAt, type Road, type RoadKind } from '@/lib/game/drive-road'
import { mulberry32 } from '@/lib/game/world-layout'

/*
 * Where every building, lamp and landmark of the town stands. Building lots come from the real
 * OpenStreetMap footprints (turned to face the nearest road and set flush against the pavement,
 * big footprints split into several storefronts); stretches of road with no footprints get
 * shop, block and bungalow fillers so the frontage stays continuous. Our places stand at their
 * real spots with their name on the front. Everything is plain data: the streamer in
 * street-town.tsx decides what to draw.
 */

export const TILE_SIZE = 250

/** One placed building (or lamp). `v` is the kit variant it draws as; `far` is its plain-block size for the distance. */
export type Lot = {
  v: string
  x: number
  z: number
  yaw: number
  sx: number
  sy: number
  sz: number
  tint: number
  /** Plain block for the distance: width, height, depth in metres. */
  far: [number, number, number]
  /** Draw it as a plain block even up close (back rows, sheds). */
  plain?: boolean
  /** When it first appeared (s), for the fade-in; -1 while not drawn. */
  born: number
  /** How far away it still draws as a detailed building. */
  near: number
  /** Which streaming pass last drew it. */
  gen?: number
}

/** Painted plaster: weathered creams, pastel greens and blues, the odd pink, yellow and terracotta. */
export const WALLS = ['#e8e2d4', '#d6e3cc', '#bfd6e8', '#efd2cc', '#efe2a8', '#f1efe9', '#cfcfc8', '#dcae90', '#b9ddd6', '#d9ccE4', '#e3dccb', '#c9d3c4'].map((c) => new Color(c))

const rectOf = (tx: number, tz: number) => ({ x0: tx * TILE_SIZE, z0: tz * TILE_SIZE, x1: (tx + 1) * TILE_SIZE, z1: (tz + 1) * TILE_SIZE })

/* —— the place landmarks —— */

type LandmarkKind = 'church' | 'mosque' | 'station' | 'club' | 'academic' | 'gateway' | 'shop' | 'block'
export type Landmark = { id: string; label: string; kind: LandmarkKind; v: string; x: number; z: number; yaw: number; depth: number; width: number }

const CLUBS = new Set(['sazza', 'forbes', 'playchill-climax', 'dubious', 'spot-rite', 'denco', 'anonymous-zone', 'wise-gourmet'])
const GATEWAYS = new Set(['keke-park', 'park', 'shuttle-park', 'cattle-market', 'market-square', 'relaxation-centre', 'sports-complex'])
const ACADEMIC = new Set(['college-of-medicine', 'innovation-hub', 'admin-block', 'ict-exams', 'education', 'mass-comm', 'students-centre', 'law-campus', 'engineering', 'physical-science', 'social-science', 'life-science', 'management-science', 'clinic'])
const HALLS = new Set(['cordelia-hall', 'twin-hall', 'etf-hall', 'hall-100', 'hall-200', 'mls-hall', 'off-campus-hostels', 'school-hostels-1', 'school-hostels-2'])

const BASE: Record<LandmarkKind, [number, number]> = { church: [14, 18], mosque: [14, 14], station: [14, 15], club: [14, 10], academic: [22, 14], gateway: [13, 8], shop: [9, 8], block: [12, 9] }

export const LANDMARKS: Landmark[] = (() => {
  const out: Landmark[] = []
  for (const p of ROAD_PLACES) {
    if (p.id === 'aau-gate') continue
    let kind: LandmarkKind = 'shop'
    if (p.id.includes('church')) kind = 'church'
    else if (CLUBS.has(p.id)) kind = 'club'
    else if (GATEWAYS.has(p.id)) kind = 'gateway'
    else if (ACADEMIC.has(p.id)) kind = 'academic'
    else if (HALLS.has(p.id)) kind = 'block'
    else if (p.id === 'magmus-autos') kind = 'station'
    const [w, d] = BASE[kind]
    const road = ROADS.find((r) => r.id === p.road)
    if (!road) continue
    const dims = ROAD_DIMS[road.kind]
    const off = p.side * (HALF[road.kind] + dims.kerb + dims.pave + 0.6 + d / 2)
    const s = Math.max(w / 2 + 4, Math.min(road.length - w / 2 - 4, p.s))
    const spot = spotAt(road.id, s, off)
    out.push({ id: p.id, label: p.label, kind, v: `lm:${p.id}`, x: spot.x, z: spot.z, yaw: Math.atan2(spot.dz * p.side, -spot.dx * p.side), depth: d, width: w })
  }
  return out
})()

/* —— helpers —— */

/** How near to a road's edge (m) this point is, ignoring `skip`. */
function clearOfRoads(x: number, z: number, skip: Road | null) {
  let best = Infinity
  for (const road of roadsNear(x, z, 90)) {
    if (road === skip) continue
    const g = locateOn(road, x, z).gap - HALF[road.kind]
    if (g < best) best = g
  }
  return best
}

const SCENE = new Set(SCENE_ROADS.map((r) => r.id))

/** The s-ranges of a road that lie within a rectangle (grown by `grow`). */
function rangesIn(road: Road, r: { x0: number; z0: number; x1: number; z1: number }, grow: number): [number, number][] {
  const out: [number, number][] = []
  let open = -1
  for (let i = 1; i < road.pts.length; i++) {
    const a = road.pts[i - 1]!
    const b = road.pts[i]!
    const hit = Math.max(a[0], b[0]) > r.x0 - grow && Math.min(a[0], b[0]) < r.x1 + grow && Math.max(a[1], b[1]) > r.z0 - grow && Math.min(a[1], b[1]) < r.z1 + grow
    if (hit && open < 0) open = road.at[i - 1]!
    if (!hit && open >= 0) {
      out.push([open, road.at[i - 1]!])
      open = -1
    }
  }
  if (open >= 0) out.push([open, road.length])
  return out
}

/* —— real footprints —— */

/** Smallest rectangle round a footprint: centre, axis angle, and its two side lengths. */
function obb(ring: number[]) {
  const n = ring.length / 2
  let best = { area: Infinity, cx: 0, cz: 0, ang: 0, a: 0, b: 0 }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const ang = Math.atan2(ring[j * 2 + 1]! - ring[i * 2 + 1]!, ring[j * 2]! - ring[i * 2]!)
    const c = Math.cos(ang)
    const s = Math.sin(ang)
    let minU = Infinity
    let maxU = -Infinity
    let minV = Infinity
    let maxV = -Infinity
    for (let k = 0; k < n; k++) {
      const u = ring[k * 2]! * c + ring[k * 2 + 1]! * s
      const v = -ring[k * 2]! * s + ring[k * 2 + 1]! * c
      if (u < minU) minU = u
      if (u > maxU) maxU = u
      if (v < minV) minV = v
      if (v > maxV) maxV = v
    }
    const area = (maxU - minU) * (maxV - minV)
    if (area < best.area) {
      const mu = (minU + maxU) / 2
      const mv = (minV + maxV) / 2
      best = { area, cx: mu * c - mv * s, cz: mu * s + mv * c, ang, a: maxU - minU, b: maxV - minV }
    }
  }
  return best
}

function hash(a: number, b: number) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const SHOP_VARIANTS = 12
const makeLot = (v: string, x: number, z: number, yaw: number, sx: number, sy: number, sz: number, tint: number, far: [number, number, number], near = 140, plain = false): Lot => ({ v, x, z, yaw, sx, sy, sz, tint, far, born: -1, near, plain })

/**
 * Lots from one tile's real footprints. Each building turns to face the nearest road and slides
 * against the pavement; wide ones are split into storefronts.
 */
export function lotsFromFootprints(rings: number[][], tx: number, tz: number): Lot[] {
  const out: Lot[] = []
  rings.forEach((ring, idx) => {
    if (ring.length < 6) return
    const o = obb(ring)
    const area = o.a * o.b
    if (area < 22) return
    const roll = hash(Math.round(o.cx * 10), Math.round(o.cz * 10))
    // Which road is it on, and which way is the road
    let best: { road: Road; gap: number; s: number; off: number } | null = null
    for (const road of roadsNear(o.cx, o.cz, 80)) {
      const p = locateOn(road, o.cx, o.cz)
      if (!best || p.gap < best.gap) best = { road, gap: p.gap, s: p.s, off: p.off }
    }
    const tint = Math.floor(roll * 977) % WALLS.length
    const h = area < 60 ? 3.2 : area < 220 ? 3.8 + roll * 3 : 6.5 + roll * 6.5
    if (!best) {
      out.push(makeLot('far', o.cx, o.cz, o.ang, o.a, h / 10, o.b, tint, [o.a, h, o.b], 0, true))
      return
    }
    const kind: RoadKind = best.road.kind
    const q = pointAt(best.road, best.s)
    // Face the road: the footprint side whose outward normal points at it
    const toward = Math.atan2(q.x - o.cx, q.z - o.cz)
    let yaw = 0
    let bestDot = -2
    let depth = o.b
    let width = o.a
    for (let k = 0; k < 4; k++) {
      const nx = Math.cos(o.ang + (k * Math.PI) / 2)
      const nz = Math.sin(o.ang + (k * Math.PI) / 2)
      const dot = nx * Math.sin(toward) + nz * Math.cos(toward)
      if (dot > bestDot) {
        bestDot = dot
        yaw = Math.atan2(nx, nz)
        // Facing along the first axis: its length is the depth
        depth = k % 2 === 0 ? o.a : o.b
        width = k % 2 === 0 ? o.b : o.a
      }
    }
    const dims = ROAD_DIMS[kind]
    const target = HALF[kind] + dims.kerb + dims.pave + 0.6
    const front = best.gap - depth / 2
    if (front < HALF[kind] + 0.5) return
    let x = o.cx
    let z = o.cz
    const shift = front - target
    if (shift > 0 && shift < 10 && best.gap < 40) {
      // Slide it against the pavement
      const len = Math.hypot(q.x - o.cx, q.z - o.cz) || 1
      x += ((q.x - o.cx) / len) * shift
      z += ((q.z - o.cz) / len) * shift
    }
    // Skip it if it would sit on top of another road
    if (clearOfRoads(x, z, best.road) < depth * 0.4 - 1.5) return
    const frontRow = best.gap < 36
    const fx = Math.sin(yaw)
    const fz = Math.cos(yaw)
    // Along the facade (right of the front direction)
    const ax = fz
    const az = -fx
    if (!frontRow || area < 46) {
      out.push(makeLot('far', x, z, yaw, width, h / 10, depth, tint, [width, h, depth], 0, true))
      return
    }
    const commercial = kind !== 'street'
    let base: string
    let bw = 9
    let bd = 8
    let floors = 1
    if (area < 70) {
      base = kind === 'street' ? 'bungalow' : 'kiosk'
      ;[bw, bd] = base === 'kiosk' ? [4, 4] : [14, 14]
    } else if (area > 330 && roll < 0.08 && best.gap > 12) {
      base = 'church'
      ;[bw, bd] = [14, 18]
    } else if (area > 200 && roll > 0.93) {
      base = 'mosque'
      ;[bw, bd] = [14, 14]
    } else if (area > 230 || (!commercial && roll < 0.55)) {
      base = 'block'
      floors = area > 340 && roll > 0.4 ? 3 : 2
      ;[bw, bd] = [12, 9]
    } else if (commercial || roll < 0.3) {
      base = 'shop'
      floors = roll > 0.62 ? 2 : 1
    } else {
      base = 'bungalow'
      ;[bw, bd] = [14, 14]
    }
    const n = base === 'church' || base === 'mosque' ? 1 : Math.max(1, Math.round(width / bw))
    const unit = width / n
    const sxm = Math.max(0.7, Math.min(1.5, unit / bw))
    const szm = Math.max(0.7, Math.min(1.35, depth / bd))
    for (let m = 0; m < n; m++) {
      const along = (m - (n - 1) / 2) * unit
      const r2 = hash(idx * 31 + m, Math.round(o.cx))
      const variant = Math.floor(r2 * 997)
      const v =
        base === 'shop'
          ? `shop:${variant % SHOP_VARIANTS}:${floors}`
          : base === 'block'
            ? `block:${variant % 4}:${floors}`
            : base === 'kiosk'
              ? `kiosk:${variant % 3}`
              : base === 'bungalow'
                ? `bungalow:${variant % 4}`
                : base
      const hh = base === 'shop' ? 4.3 + (floors - 1) * 3.1 : base === 'block' ? 3.9 + (floors - 1) * 3.2 : 4
      out.push(makeLot(v, x + ax * along, z + az * along, yaw, sxm, 1, szm, tint + m, [unit, hh, depth], base === 'church' || base === 'mosque' ? 220 : 140))
    }
    // A deep plot behind its storefront: a plain block fills the rest so the back is not hollow
    if (depth > bd * szm + 4) {
      const rest = depth - bd * szm - 0.6
      const cx = x - fx * (depth / 2 - rest / 2 - 0.2)
      const cz = z - fz * (depth / 2 - rest / 2 - 0.2)
      out.push(makeLot('far', cx, cz, yaw, width, h / 10, rest, tint, [width, h * 0.9, rest], 0, true))
    }
  })
  return out.filter((l) => l.x >= tx * TILE_SIZE - 30 && l.x < (tx + 1) * TILE_SIZE + 30)
}

/* —— filler where the map has no footprints —— */

const SLOT = 12.2
const AREA = 450

const FILL: Record<RoadKind, [string, number][]> = {
  highway: [['shop', 4], ['block', 3], ['station', 0.5], ['bungalow', 1]],
  road: [['shop', 3.5], ['block', 2], ['bungalow', 2.5], ['kiosk', 1.5], ['church', 0.25], ['mosque', 0.2]],
  street: [['block', 2.5], ['bungalow', 3.5], ['kiosk', 1.2], ['shop', 1.2], ['church', 0.15]],
}

function fillStyle(roadIndex: number, area: number) {
  const rand = mulberry32(9001 + roadIndex * 131 + area * 17)
  const walls = Array.from({ length: 4 }, () => Math.floor(rand() * WALLS.length))
  return { walls, bias: Array.from({ length: 8 }, () => 0.2 + rand() * 1.8), empty: 0.04 + rand() * 0.16 }
}

/** Filler lots along the scene roads inside one tile, skipping slots that real footprints or landmarks already cover. */
export function fillerLots(tx: number, tz: number, covered: (x: number, z: number, r: number) => boolean): Lot[] {
  const rect = rectOf(tx, tz)
  const out: Lot[] = []
  const cx = (rect.x0 + rect.x1) / 2
  const cz = (rect.z0 + rect.z1) / 2
  for (const road of roadsNear(cx, cz, TILE_SIZE * 0.75)) {
    if (!SCENE.has(road.id)) continue
    const index = ROADS.indexOf(road)
    const dims = ROAD_DIMS[road.kind]
    const edge = HALF[road.kind] + dims.kerb + dims.pave + 0.6
    for (const [a, b] of rangesIn(road, rect, 20)) {
      const k0 = Math.max(1, Math.floor(a / SLOT))
      const k1 = Math.floor(Math.min(b, road.length - 8) / SLOT)
      for (let k = k0; k <= k1; k++) {
        const s = k * SLOT + SLOT / 2
        if (s < 8 || s > road.length - 8) continue
        for (const side of [-1, 1]) {
          const r = mulberry32(hash(index * 7 + side, k) * 4e9)
          const area = Math.floor(s / AREA)
          const style = fillStyle(index, area)
          if (r() < style.empty) continue
          const mix = FILL[road.kind]
          const weights = mix.map(([, w], i) => w * style.bias[i % 8]!)
          let left = r() * weights.reduce((p, w) => p + w, 0)
          let kind = mix[0]![0]
          for (let i = 0; i < mix.length; i++) {
            left -= weights[i]!
            if (left <= 0) {
              kind = mix[i]![0]
              break
            }
          }
          const roll = r()
          const spec = { shop: [9, 8, 4.3], block: [12, 9, 6], bungalow: [14, 14, 5.5], kiosk: [4, 4, 3.2], station: [14, 15, 8], church: [14, 18, 14], mosque: [14, 14, 12] }[kind] as [number, number, number]
          const [bw, bd, bh] = spec
          // Big kinds take a longer stretch: only start them on every second slot
          if ((kind === 'church' || kind === 'station' || kind === 'mosque') && k % 2) continue
          const jitter = 0.94 + r() * 0.12
          const sxm = kind === 'kiosk' ? 1 : Math.min(1.45, (SLOT * 0.97 * jitter) / bw)
          const szm = kind === 'kiosk' ? 1 : 0.9 + r() * 0.25
          const floors = kind === 'shop' ? (roll > 0.6 ? 2 : 1) : kind === 'block' ? (roll > 0.5 ? 3 : 2) : 1
          const v =
            kind === 'shop'
              ? `shop:${Math.floor(r() * SHOP_VARIANTS)}:${floors}`
              : kind === 'block'
                ? `block:${Math.floor(r() * 4)}:${floors}`
                : kind === 'kiosk'
                  ? `kiosk:${Math.floor(r() * 3)}`
                  : kind === 'bungalow'
                    ? `bungalow:${Math.floor(r() * 4)}`
                    : kind
          const wide = kind === 'church' || kind === 'station' || kind === 'mosque' ? 1 : sxm
          const sp = spotAt(road.id, s, side * (edge + (bd * szm) / 2))
          if (sp.x < rect.x0 || sp.x >= rect.x1 || sp.z < rect.z0 || sp.z >= rect.z1) continue
          if (covered(sp.x, sp.z, Math.max(bw * wide, bd * szm) * 0.5 + 1)) continue
          if (clearOfRoads(sp.x, sp.z, road) < bd * szm * 0.6 + 2) continue
          const hh = kind === 'shop' ? 4.3 + (floors - 1) * 3.1 : kind === 'block' ? 3.9 + (floors - 1) * 3.2 : bh
          out.push(makeLot(v, sp.x, sp.z, Math.atan2(sp.dz * side, -sp.dx * side), wide, 1, kind === 'kiosk' ? 1 : szm, style.walls[Math.floor(r() * 4)]!, [bw * wide, hh, bd * szm], kind === 'church' || kind === 'mosque' ? 220 : 140))
        }
      }
    }
  }
  return out
}

/**
 * Street lamps along the roads of one tile. On the expressway they stand in the middle, one pole
 * with an arm over each carriageway ('lamp2'); on the other roads, single lamps at the kerb,
 * staggered, arm reaching over the road.
 */
export function lampLots(tx: number, tz: number): Lot[] {
  const rect = rectOf(tx, tz)
  const out: Lot[] = []
  const cx = (rect.x0 + rect.x1) / 2
  const cz = (rect.z0 + rect.z1) / 2
  for (const road of roadsNear(cx, cz, TILE_SIZE * 0.75)) {
    if (!SCENE.has(road.id)) continue
    const dims = ROAD_DIMS[road.kind]
    const gap = road.kind === 'highway' ? 36 : road.kind === 'road' ? 38 : 44
    for (const [a, b] of rangesIn(road, rect, 10)) {
      for (let k = Math.max(1, Math.floor(a / gap)); k <= Math.floor(b / gap); k++) {
        const s = k * gap
        if (s < 14 || s > road.length - 14) continue
        if (road.kind === 'highway') {
          // Not in a gap of the divider (junctions, the ends); the kerb lamps below stand as well
          const mid = !dividerOpen(road, s)
          const sp = spotAt(road.id, s, 0)
          if (mid && sp.x >= rect.x0 && sp.x < rect.x1 && sp.z >= rect.z0 && sp.z < rect.z1) out.push(makeLot('lamp2', sp.x, sp.z, Math.atan2(sp.dz, -sp.dx), 1, 1, 1, 0, [1, 9, 1], 260))
        }
        for (const side of road.kind === 'street' ? [k % 2 ? 1 : -1] : [1, -1]) {
          const sp = spotAt(road.id, s + (side > 0 ? gap / 2 : 0), side * (HALF[road.kind] + dims.kerb + dims.pave * 0.45))
          if (sp.x < rect.x0 || sp.x >= rect.x1 || sp.z < rect.z0 || sp.z >= rect.z1) continue
          if (clearOfRoads(sp.x, sp.z, road) < 1.5) continue
          out.push(makeLot('lamp', sp.x, sp.z, Math.atan2(sp.dz * side, -sp.dx * side), 1, 1, 1, 0, [1, 8, 1], 260))
        }
      }
    }
  }
  return out
}

/** The landmark lots (one per place), built once. */
export function landmarkLots(): Lot[] {
  return LANDMARKS.map((l) => {
    const [bw, bd] = BASE[l.kind]
    return makeLot(l.v, l.x, l.z, l.yaw, 1, 1, 1, 0, [bw, 10, bd], 300)
  })
}
