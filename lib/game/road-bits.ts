import { ROAD_GAPS, ROAD_W, type RoadGap } from './world-layout'

export type RoadBitName =
  | 'road_straight'
  | 'road_corner'
  | 'road_corner_curved'
  | 'road_junction'
  | 'road_tsplit'
  | 'road_straight_crossing'

export type RoadBitPlacement = {
  bit: RoadBitName
  x: number
  z: number
  /** Yaw radians */
  rot: number
}

const N = 1
const E = 2
const S = 4
const W = 8

/**
 * City Bits tiles after node scale: 2×2. We scale to ROAD_W.
 * After lay-flat (rotX −90°), dashes run along local Z — so a north–south
 * road uses rot 0 (tiles chain front-to-front), east–west uses π/2.
 * (The old E–W@0 mapping laid dashes across the lane → “solar panel” look.)
 */
function bitFromMask(mask: number): { bit: RoadBitName; rot: number } {
  switch (mask) {
    case N | E | S | W:
      return { bit: 'road_junction', rot: 0 }
    // T-splits — missing side is the open top of the T
    case E | S | W: // missing N
      return { bit: 'road_tsplit', rot: Math.PI / 2 }
    case N | S | W: // missing E
      return { bit: 'road_tsplit', rot: Math.PI }
    case N | E | W: // missing S
      return { bit: 'road_tsplit', rot: -Math.PI / 2 }
    case N | E | S: // missing W
      return { bit: 'road_tsplit', rot: 0 }
    // Corners
    case S | E:
      return { bit: 'road_corner', rot: Math.PI / 2 }
    case S | W:
      return { bit: 'road_corner', rot: Math.PI }
    case N | W:
      return { bit: 'road_corner', rot: -Math.PI / 2 }
    case N | E:
      return { bit: 'road_corner', rot: 0 }
    // Straights — dashes along the lane, tiles end-to-end
    case N | S:
      return { bit: 'road_straight', rot: 0 }
    case E | W:
      return { bit: 'road_straight', rot: Math.PI / 2 }
    case N:
    case S:
      return { bit: 'road_straight', rot: 0 }
    case E:
    case W:
      return { bit: 'road_straight', rot: Math.PI / 2 }
    default:
      return { bit: 'road_straight', rot: 0 }
  }
}

function collectCells(gaps: RoadGap[], tile: number) {
  const cells = new Map<string, { x: number; z: number }>()
  const key = (x: number, z: number) => `${x},${z}`

  const add = (x: number, z: number) => {
    const sx = Math.round(x / tile) * tile
    const sz = Math.round(z / tile) * tile
    cells.set(key(sx, sz), { x: sx, z: sz })
  }

  for (const gap of gaps) {
    const alongZ = gap.d > gap.w
    const length = alongZ ? gap.d : gap.w
    const count = Math.max(1, Math.round(length / tile))
    const start = -((count - 1) * tile) / 2
    for (let i = 0; i < count; i++) {
      const along = start + i * tile
      add(alongZ ? gap.x : gap.x + along, alongZ ? gap.z + along : gap.z)
    }
  }

  // Ensure exact H×V crossings land on the grid (avoids double-straights)
  const horizontals = gaps.filter((g) => g.w >= g.d)
  const verticals = gaps.filter((g) => g.d > g.w)
  for (const h of horizontals) {
    for (const v of verticals) {
      const inH = v.x >= h.x - h.w / 2 - tile * 0.1 && v.x <= h.x + h.w / 2 + tile * 0.1
      const inV = h.z >= v.z - v.d / 2 - tile * 0.1 && h.z <= v.z + v.d / 2 + tile * 0.1
      if (inH && inV) add(v.x, h.z)
    }
  }

  return cells
}

/** One City Bits piece per snapped cell — no overlapping straights through junctions. */
export function planRoadBits(gaps: RoadGap[] = ROAD_GAPS, tile = ROAD_W): RoadBitPlacement[] {
  const cells = collectCells(gaps, tile)
  const key = (x: number, z: number) => `${x},${z}`
  const pieces: RoadBitPlacement[] = []

  for (const { x, z } of cells.values()) {
    const n = cells.has(key(x, z - tile))
    const e = cells.has(key(x + tile, z))
    const s = cells.has(key(x, z + tile))
    const w = cells.has(key(x - tile, z))
    const mask = (n ? N : 0) | (e ? E : 0) | (s ? S : 0) | (w ? W : 0)
    if (mask === 0) continue
    const { bit, rot } = bitFromMask(mask)
    pieces.push({ bit, x, z, rot })
  }

  return pieces
}
