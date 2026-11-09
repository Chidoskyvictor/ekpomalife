import { HOME_GRID, HOME_TILE } from './home-grid'
import { homeFootprint, homeTiles, type HomePlacement, type HomeShape, type HomeSpec, type HomeSpot } from './home-buy-rules'
import type { HomeItem } from './home-buy-api'
import type { FurnitureId } from './room-furniture'
import type { FurnitureSpot, Rect, RoomLayout, SpotKey } from './room-layouts'
import { normalizeLodging } from './home-lodging'
import { seatSuffix, seatsFor, SEAT_TAP } from './furniture-seats'
import { STARTERS, starterSeedSpot, type StarterDef } from './home-starters'

/*
 * Where bought furniture sits in the 3D home. Tiles (home-grid.ts) map onto the GLB's own
 * floor coordinates; placed pieces also block the character and the ones with a `uses`
 * (bed, chair, cooker...) become tappable with the existing furniture actions.
 */

export { HOME_TILE }

/** Which way each turn faces (x, z): 0 toward the camera, then a quarter turn each. */
export const FRONT: Record<0 | 90 | 180 | 270, [number, number]> = {
  0: [0, 1],
  90: [-1, 0],
  180: [0, -1],
  270: [1, 0],
}

export const placedKey = (id: string): SpotKey => `placed:${id}`
/** A piece with several seats (a sofa) has `placed:<id>` for its first and `placed:<id>#1`, `#2`… for the others. */
export const placedIdOf = (key: string) => (key.startsWith('placed:') ? key.slice('placed:'.length).split('#')[0]! : null)

export const homeSpecFor = (lodgingId: string | null | undefined): HomeSpec | null =>
  HOME_GRID[normalizeLodging(lodgingId)] ?? null

export const shapeOf = (item: HomeItem): HomeShape => ({
  id: item.id,
  w: item.w,
  d: item.d,
  wall: item.wall,
  maxPerHome: item.maxPerHome,
})

export const shapeMap = (catalog: HomeItem[]) => new Map(catalog.map((item) => [item.id, shapeOf(item)]))

/** World rectangle a piece covers: [minX, minZ, maxX, maxZ]. */
export function pieceRect(spec: HomeSpec, item: Pick<HomeItem, 'w' | 'd'>, spot: HomeSpot): Rect {
  const { w, d } = homeFootprint(item, spot.rot)
  const x0 = spec.ox + spot.x * HOME_TILE
  const z0 = spec.oz + spot.z * HOME_TILE
  return [x0, z0, x0 + w * HOME_TILE, z0 + d * HOME_TILE]
}

/** The tile under a world point (not clamped). */
export function tileAt(spec: HomeSpec, x: number, z: number): [number, number] {
  return [Math.floor((x - spec.ox) / HOME_TILE), Math.floor((z - spec.oz) / HOME_TILE)]
}

/** Spot that centres a piece under a point; wall pieces stick to the wall row. */
export function spotUnder(spec: HomeSpec, item: Pick<HomeItem, 'w' | 'd' | 'wall'>, rot: HomeSpot['rot'], x: number, z: number): HomeSpot {
  const { w, d } = homeFootprint(item, rot)
  const [tx, tz] = tileAt(spec, x, z)
  const sx = Math.min(spec.cols - w, Math.max(0, tx - Math.floor((w - 1) / 2)))
  const sz = item.wall ? 0 : Math.min(spec.rows - d, Math.max(0, tz - Math.floor((d - 1) / 2)))
  return { x: sx, z: sz, rot: item.wall ? 0 : rot }
}

/** Standing height of the character's origin when using a piece, by the furniture action it gives. */
function seatY(use: FurnitureId, height: number) {
  // Lie on the mattress, not on top of the headboard (a family bed is 1.05 m tall with it)
  if (use === 'bed') return Math.min(height, 0.52) + 0.03
  if (use === 'toilet') return -0.2
  if (use === 'bucket' || use === 'cooker') return 0
  return Math.min(0, height - 0.77)
}

const USES = new Set<string>(['bed', 'red-chair', 'desk-chair', 'sofa', 'toilet', 'bucket', 'cooker'])
export const furnitureUse = (item: HomeItem | undefined): FurnitureId | null =>
  item?.uses && USES.has(item.uses) ? (item.uses as FurnitureId) : null

/**
 * The home's layout plus everything placed in it: floor pieces block walking, and pieces with a
 * `uses` get a spot (a free tile beside them to walk to) and a tap box.
 */
export function layoutWithPlaced(
  layout: RoomLayout,
  spec: HomeSpec | null,
  placements: HomePlacement[],
  catalog: HomeItem[],
  starters: StarterDef[] = [],
): RoomLayout {
  if (!spec || placements.length === 0) return layout
  const byId = new Map(catalog.map((item) => [item.id, item]))
  const starterOf = new Map(starters.map((def) => [def.item, def]))
  const taken = new Set<string>()
  for (const p of placements) {
    const item = byId.get(p.itemId)
    if (item && !item.wall) for (const [x, z] of homeTiles(item, p)) taken.add(`${x},${z}`)
  }
  const free = (x: number, z: number) =>
    spec.floor[z]?.[x] === '1' && spec.blocked[z]?.[x] !== '1' && !taken.has(`${x},${z}`)

  // Starter pieces that are placements now: their built-in block and spot give way to the placement
  const placedStarters = placements.filter((p) => starterOf.has(p.itemId))
  const same = (a: Rect, b: Rect) => a.every((v, i) => Math.abs(v - b[i]!) < 0.02)
  const blocks: Rect[] = layout.blocks.filter(
    (bl) => !placedStarters.some((p) => same(starterOf.get(p.itemId)!.rect, bl)),
  )
  const spots: RoomLayout['spots'] = { ...layout.spots }
  const tapBoxes: RoomLayout['tapBoxes'] = { ...layout.tapBoxes }
  for (const p of placedStarters) {
    const use = starterOf.get(p.itemId)!.use
    if (use) {
      delete spots[use]
      delete tapBoxes[use]
    }
  }

  for (const p of placements) {
    const item = byId.get(p.itemId)
    if (!item || item.wall) continue
    const rect = pieceRect(spec, item, p)
    blocks.push(rect)
    const def = starterOf.get(p.itemId)
    if (def) {
      // Its own spot (where you sit / lie) moves and turns with the piece
      const base = def.use ? layout.spots[def.use] : undefined
      const tap = def.use ? layout.tapBoxes[def.use] : undefined
      const move = starterMove(spec, item, def, p)
      if (base) {
        const approach = move.point(base.approach[0], base.approach[1])
        const at = move.point(base.at[0], base.at[2])
        spots[placedKey(p.id)] = { approach, at: [at[0], base.at[1], at[1]], heading: base.heading + move.angle }
        tapBoxes[placedKey(p.id)] = tap ? [rect[0], tap[1], rect[1], rect[2], tap[4], rect[3]] : [rect[0], 0, rect[1], rect[2], 1, rect[3]]
      }
      continue
    }
    const use = furnitureUse(item)
    if (!use) continue

    // A free tile beside it
    const { w, d } = homeFootprint(item, p.rot)
    const sides = {
      '0,1': Array.from({ length: w }, (_, i): [number, number] => [p.x + i, p.z + d]),
      '0,-1': Array.from({ length: w }, (_, i): [number, number] => [p.x + i, p.z - 1]),
      '1,0': Array.from({ length: d }, (_, j): [number, number] => [p.x + w, p.z + j]),
      '-1,0': Array.from({ length: d }, (_, j): [number, number] => [p.x - 1, p.z + j]),
    }
    // The side it faces first (so you stand and sit on its front), then the others
    const [fx, fz] = FRONT[p.rot]
    const candidates = [sides[`${fx},${fz}` as keyof typeof sides], ...Object.values(sides)].flat()
    const side = candidates.find(([x, z]) => free(x, z))
    if (!side) continue
    const tileCentre = ([tx, tz]: [number, number]): [number, number] => [spec.ox + (tx + 0.5) * HOME_TILE, spec.oz + (tz + 0.5) * HOME_TILE]

    // Per-model seat data (sofa seats, mattress height, which way a chair faces…), turned with the piece
    const placedSeats = seatsFor(item.model, [(rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2], p.rot)
    if (placedSeats) {
      const free_ = candidates.filter(([x, z]) => free(x, z))
      const topY = Math.max(item.height, 0.3)
      placedSeats.seats.forEach((seat, i) => {
        // Walk up to the free tile nearest this seat (the piece's front side wins a tie)
        const near = free_
          .map((tile) => {
            const c = tileCentre(tile)
            const front = tile[0] === side[0] && tile[1] === side[1] ? -0.01 : 0
            return { c, d: Math.hypot(c[0] - seat.floor[0], c[1] - seat.floor[1]) + front }
          })
          .sort((a, b) => a.d - b.d)[0]!.c
        const key = `${placedKey(p.id)}${seatSuffix(i)}` as SpotKey
        spots[key] = { approach: near, at: seat.at, heading: seat.heading }
        tapBoxes[key] =
          placedSeats.seats.length === 1
            ? [rect[0], 0, rect[1], rect[2], topY, rect[3]]
            : [
                Math.max(rect[0], seat.floor[0] - SEAT_TAP),
                0,
                Math.max(rect[1], seat.floor[1] - SEAT_TAP),
                Math.min(rect[2], seat.floor[0] + SEAT_TAP),
                topY,
                Math.min(rect[3], seat.floor[1] + SEAT_TAP),
              ]
      })
      continue
    }
    const approach: [number, number] = [spec.ox + (side[0] + 0.5) * HOME_TILE, spec.oz + (side[1] + 0.5) * HOME_TILE]
    const cx = (rect[0] + rect[2]) / 2
    const cz = (rect[1] + rect[3]) / 2
    const heading = Math.atan2(approach[0] - cx, approach[1] - cz)
    const standing = use === 'bucket' || use === 'cooker'
    if (use === 'bed') {
      // Lie along the bed's long side, centred on the mattress (feet ~0.85 m from the middle)
      const alongX = rect[2] - rect[0] > rect[3] - rect[1]
      const lieHeading = alongX ? Math.PI / 2 : 0 // head toward −x or −z
      const key = placedKey(p.id)
      spots[key] = {
        approach,
        at: [cx + Math.sin(lieHeading) * 0.85, seatY(use, item.height), cz + Math.cos(lieHeading) * 0.85],
        heading: lieHeading,
      }
      tapBoxes[key] = [rect[0], 0, rect[1], rect[2], Math.max(item.height, 0.3), rect[3]]
      continue
    }
    const spot: FurnitureSpot = {
      approach,
      at: standing ? [approach[0], 0, approach[1]] : [cx, seatY(use, item.height), cz],
      heading: standing ? heading + Math.PI : heading,
    }
    const key = placedKey(p.id)
    spots[key] = spot
    tapBoxes[key] = [rect[0], 0, rect[1], rect[2], Math.max(item.height, 0.3), rect[3]]
  }
  return { ...layout, blocks, spots, tapBoxes }
}

/** The starter pieces of a home (by lodging), for layoutWithPlaced and drawing. */
export const startersFor = (lodgingId: string | null | undefined): StarterDef[] => STARTERS[normalizeLodging(lodgingId)] ?? []

/**
 * How a starter piece moved from where the GLB has it: turned by `angle` (radians, about the
 * centre of its original tiles) and shifted to the centre of its tiles now.
 */
export function starterMove(spec: HomeSpec, item: Pick<HomeItem, 'w' | 'd'>, def: StarterDef, spot: HomeSpot) {
  const seed = pieceRect(spec, item, starterSeedSpot(spec, def))
  const now = pieceRect(spec, item, spot)
  const from: [number, number] = [(seed[0] + seed[2]) / 2, (seed[1] + seed[3]) / 2]
  const to: [number, number] = [(now[0] + now[2]) / 2, (now[1] + now[3]) / 2]
  // A quarter turn each step; rot 90 faces −x (see FRONT)
  const angle = (-spot.rot * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return {
    from,
    to,
    angle,
    point(x: number, z: number): [number, number] {
      const dx = x - from[0]
      const dz = z - from[1]
      return [to[0] + dx * cos + dz * sin, to[1] - dx * sin + dz * cos]
    },
  }
}
