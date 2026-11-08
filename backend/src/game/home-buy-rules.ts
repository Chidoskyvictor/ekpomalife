/*
 * Buy-mode placement rules. Pure and import-free so the game and the API run the exact same code:
 * scripts/gen-home-grid.ts copies this file to backend/src/game/home-buy-rules.ts (edit it here).
 */

export type HomeRotation = 0 | 90 | 180 | 270

/** One home's tile grid (home-grid.ts). Rows are z, columns are x; '1' marks a tile. */
export type HomeSpec = {
  ox: number
  oz: number
  cols: number
  rows: number
  /** '1' = inside the house. Wall items live on row 0 of this. */
  floor: string[]
  /** '1' = already taken by the house's own furniture, walls, or the door. */
  blocked: string[]
  start: [number, number]
}

export type HomeShape = { id: string; w: number; d: number; wall: boolean; maxPerHome: number }
export type HomePlacement = { id: string; itemId: string; x: number; z: number; rot: HomeRotation }
export type HomeSpot = { x: number; z: number; rot: HomeRotation }

export type HomeCheck =
  | { ok: true }
  | { ok: false; code: 'UNKNOWN_ITEM' | 'BAD_ROTATION' | 'OUT_OF_BOUNDS' | 'WALL_ONLY' | 'OVERLAP' | 'BLOCKS_PATH' | 'TOO_MANY'; error: string }

export const MAX_HOME_PIECES = 40

export function homeFootprint(shape: Pick<HomeShape, 'w' | 'd'>, rot: HomeRotation) {
  return rot === 90 || rot === 270 ? { w: shape.d, d: shape.w } : { w: shape.w, d: shape.d }
}

export function homeTiles(shape: Pick<HomeShape, 'w' | 'd'>, spot: HomeSpot): [number, number][] {
  const { w, d } = homeFootprint(shape, spot.rot)
  const tiles: [number, number][] = []
  for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) tiles.push([spot.x + dx, spot.z + dz])
  return tiles
}

const key = (x: number, z: number) => z * 1000 + x
const at = (rows: string[], x: number, z: number) => rows[z]?.[x] === '1'

/** Tiles you can still walk to from the door, with the given tiles taken. */
function reachable(spec: HomeSpec, taken: Set<number>) {
  const seen = new Set<number>()
  const queue: [number, number][] = [spec.start]
  seen.add(key(...spec.start))
  while (queue.length) {
    const [x, z] = queue.pop()!
    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]] as const) {
      const k = key(nx, nz)
      if (seen.has(k) || !at(spec.floor, nx, nz) || at(spec.blocked, nx, nz) || taken.has(k)) continue
      seen.add(k)
      queue.push([nx, nz])
    }
  }
  return seen
}

/**
 * Can `spot` hold `shape` in this home? `others` is everything already placed (leave the piece
 * you are moving out of it). Floor pieces need free floor tiles and must not wall anything off
 * from the door; wall pieces need a stretch of the back wall row.
 */
export function checkHomePlacement(
  spec: HomeSpec,
  shapes: Map<string, HomeShape>,
  others: HomePlacement[],
  itemId: string,
  spot: HomeSpot,
): HomeCheck {
  const shape = shapes.get(itemId)
  if (!shape) return { ok: false, code: 'UNKNOWN_ITEM', error: 'That item is not sold.' }
  if (spot.rot !== 0 && spot.rot !== 90 && spot.rot !== 180 && spot.rot !== 270) {
    return { ok: false, code: 'BAD_ROTATION', error: 'Pick a valid turn.' }
  }
  if (others.length >= MAX_HOME_PIECES) {
    return { ok: false, code: 'TOO_MANY', error: 'Your home is full. Sell something first.' }
  }
  if (others.filter((p) => p.itemId === itemId).length >= shape.maxPerHome) {
    return { ok: false, code: 'TOO_MANY', error: `You can only keep ${shape.maxPerHome} of those at home.` }
  }
  if (!Number.isInteger(spot.x) || !Number.isInteger(spot.z)) {
    return { ok: false, code: 'OUT_OF_BOUNDS', error: 'That spot is outside your home.' }
  }

  const tiles = homeTiles(shape, spot)

  if (shape.wall) {
    if (spot.rot !== 0) return { ok: false, code: 'BAD_ROTATION', error: 'Wall pieces cannot turn.' }
    if (spot.z !== 0 || shape.d !== 1) return { ok: false, code: 'WALL_ONLY', error: 'That one goes on the wall.' }
    if (!tiles.every(([x, z]) => at(spec.floor, x, z))) {
      return { ok: false, code: 'OUT_OF_BOUNDS', error: 'There is no wall there.' }
    }
    const used = new Set<number>()
    for (const p of others) {
      const other = shapes.get(p.itemId)
      if (other?.wall) for (const [x, z] of homeTiles(other, p)) used.add(key(x, z))
    }
    if (tiles.some(([x, z]) => used.has(key(x, z)))) {
      return { ok: false, code: 'OVERLAP', error: 'Something is already on that bit of wall.' }
    }
    return { ok: true }
  }

  if (!tiles.every(([x, z]) => at(spec.floor, x, z) && !at(spec.blocked, x, z))) {
    return { ok: false, code: 'OUT_OF_BOUNDS', error: 'That spot is not free floor.' }
  }
  const taken = new Set<number>()
  for (const p of others) {
    const other = shapes.get(p.itemId)
    if (other && !other.wall) for (const [x, z] of homeTiles(other, p)) taken.add(key(x, z))
  }
  if (tiles.some(([x, z]) => taken.has(key(x, z)))) {
    return { ok: false, code: 'OVERLAP', error: 'Something is already there.' }
  }

  const before = reachable(spec, taken)
  const after = reachable(spec, new Set([...taken, ...tiles.map(([x, z]) => key(x, z))]))
  const cut = [...before].some((k) => !after.has(k) && !tiles.some(([x, z]) => key(x, z) === k))
  if (cut) return { ok: false, code: 'BLOCKS_PATH', error: 'That would block the way through your home.' }
  return { ok: true }
}

/** First free spot for a new piece, starting near the middle of the floor (null when full). */
export function firstFreeHomeSpot(
  spec: HomeSpec,
  shapes: Map<string, HomeShape>,
  others: HomePlacement[],
  itemId: string,
): HomeSpot | null {
  const cx = spec.cols / 2
  const cz = spec.rows / 2
  const spots: HomeSpot[] = []
  for (const rot of [0, 90] as HomeRotation[]) {
    for (let z = 0; z < spec.rows; z++) for (let x = 0; x < spec.cols; x++) spots.push({ x, z, rot })
  }
  spots.sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz) || a.rot - b.rot)
  for (const spot of spots) {
    if (checkHomePlacement(spec, shapes, others, itemId, spot).ok) return spot
  }
  return null
}

/** Selling a piece back pays half of what it cost. */
export const sellBackPrice = (paid: number) => Math.floor(paid / 2)
