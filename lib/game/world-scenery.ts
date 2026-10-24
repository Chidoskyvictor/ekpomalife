import { extSlabHostelSlots, rearHostelSlabSlots } from './hostel-slab-layout'
import { inRect, MAP_ZONES, mulberry32, ROAD_GAPS, ROAD_W, ROADS, SLABS, TREE_SPOTS, type Rect } from './world-layout'

/** Palm / bush instance — `s` is a size multiplier, `tint` 0–1 picks a shade. */
export type SceneryProp = { x: number; z: number; s: number; rot: number; tint: number }
export type StreetLamp = { x: number; z: number; rot: number }

/** Axis-aligned bounds of everything already standing on the slabs. */
function obstacles(): Rect[] {
  const rects: Rect[] = []
  for (const zone of MAP_ZONES) {
    const [w, d] = zone.footprint
    const c = Math.abs(Math.cos(zone.rotation))
    const s = Math.abs(Math.sin(zone.rotation))
    rects.push({ x: zone.position[0], z: zone.position[1], w: c * w + s * d, d: s * w + c * d })
  }
  for (const slot of [...rearHostelSlabSlots(), ...extSlabHostelSlots()]) {
    rects.push({ x: slot.x, z: slot.z, w: slot.cellW, d: slot.cellD })
  }
  for (const tree of TREE_SPOTS) rects.push({ x: tree.x, z: tree.z, w: 1.6, d: 1.6 })
  return rects
}

let cachedObstacles: Rect[] | null = null
const blocked = (x: number, z: number, pad: number) => {
  cachedObstacles ??= obstacles()
  return cachedObstacles.some((rect) => inRect(x, z, rect, pad))
}
const onRoad = (x: number, z: number, pad: number) => ROADS.some((road) => inRect(x, z, road, pad))
const onSlab = (x: number, z: number, inset: number) => SLABS.some((slab) => inRect(x, z, slab, -inset))

/** Points walking the inside edge of each slab, `inset` from the shore. */
function shoreline(inset: number, step: number, rand: () => number) {
  const points: { x: number; z: number }[] = []
  for (const slab of SLABS) {
    const x0 = slab.x - slab.w / 2 + inset
    const x1 = slab.x + slab.w / 2 - inset
    const z0 = slab.z - slab.d / 2 + inset
    const z1 = slab.z + slab.d / 2 - inset
    const edges: [number, number, number, number][] = [
      [x0, z0, x1, z0],
      [x1, z0, x1, z1],
      [x1, z1, x0, z1],
      [x0, z1, x0, z0],
    ]
    for (const [ax, az, bx, bz] of edges) {
      const length = Math.hypot(bx - ax, bz - az)
      // Skip the rounded corners
      for (let t = 3; t < length - 3; t += step * (0.75 + rand() * 0.5)) {
        const k = t / length
        points.push({ x: ax + (bx - ax) * k, z: az + (bz - az) * k })
      }
    }
  }
  return points
}

/** Coconut palms ringing every island. */
export const PALM_SPOTS: SceneryProp[] = (() => {
  const rand = mulberry32(5150)
  const out: SceneryProp[] = []
  for (const p of shoreline(2.4, 6.5, rand)) {
    if (rand() > 0.78) continue
    const x = p.x + (rand() - 0.5) * 1.2
    const z = p.z + (rand() - 0.5) * 1.2
    if (!onSlab(x, z, 1.4) || onRoad(x, z, 1.2) || blocked(x, z, 1.2)) continue
    out.push({ x, z, s: 0.8 + rand() * 0.45, rot: rand() * Math.PI * 2, tint: rand() })
  }
  return out
})()

/** Low shrubs: a soft hedge along the shore and both sides of every road. */
export const BUSH_SPOTS: SceneryProp[] = (() => {
  const rand = mulberry32(6262)
  const out: SceneryProp[] = []
  const push = (x: number, z: number) => {
    if (!onSlab(x, z, 0.8) || onRoad(x, z, 0.35) || blocked(x, z, 0.5)) return
    if (PALM_SPOTS.some((palm) => Math.abs(palm.x - x) < 0.9 && Math.abs(palm.z - z) < 0.9)) return
    out.push({ x, z, s: 0.55 + rand() * 0.6, rot: rand() * Math.PI * 2, tint: rand() })
  }

  for (const p of shoreline(1.2, 2.6, rand)) {
    if (rand() > 0.55) continue
    push(p.x + (rand() - 0.5) * 0.6, p.z + (rand() - 0.5) * 0.6)
  }

  for (const road of ROAD_GAPS) {
    const horizontal = road.w > road.d
    const length = horizontal ? road.w : road.d
    const off = ROAD_W / 2 + 0.85
    for (let along = -length / 2 + 2; along < length / 2 - 2; along += 3.4) {
      for (const side of [-1, 1]) {
        if (rand() > 0.5) continue
        const jitter = (rand() - 0.5) * 1.2
        push(
          horizontal ? road.x + along + jitter : road.x + side * off,
          horizontal ? road.z + side * off : road.z + along + jitter,
        )
      }
    }
  }
  return out
})()

/** Street lamps staggered along both kerbs, heads leaning over the road. */
export const STREET_LAMPS: StreetLamp[] = (() => {
  const out: StreetLamp[] = []
  for (const road of ROAD_GAPS) {
    const horizontal = road.w > road.d
    const length = horizontal ? road.w : road.d
    const off = ROAD_W / 2 + 0.45
    let i = 0
    for (let along = -length / 2 + 6; along < length / 2 - 4; along += 12, i++) {
      const side = i % 2 === 0 ? 1 : -1
      const x = horizontal ? road.x + along : road.x + side * off
      const z = horizontal ? road.z + side * off : road.z + along
      if (onRoad(x, z, 0.1) || blocked(x, z, 0.2)) continue
      // Head points back across the road
      const rot = horizontal ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : side > 0 ? Math.PI : 0
      out.push({ x, z, rot })
    }
  }
  return out
})()
