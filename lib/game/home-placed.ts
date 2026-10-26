import { HOME_GRID, HOME_TILE } from './home-grid'
import { homeFootprint, homeTiles, type HomePlacement, type HomeShape, type HomeSpec, type HomeSpot } from './home-buy-rules'
import type { HomeItem } from './home-buy-api'
import type { FurnitureId } from './room-furniture'
import type { FurnitureSpot, Rect, RoomLayout, SpotKey } from './room-layouts'
import { normalizeLodging } from './home-lodging'

/*
 * Where bought furniture sits in the 3D home. Tiles (home-grid.ts) map onto the GLB's own
 * floor coordinates; placed pieces also block the character and the ones with a `uses`
 * (bed, chair, cooker...) become tappable with the existing furniture actions.
 */

export { HOME_TILE }

export const placedKey = (id: string): SpotKey => `placed:${id}`
export const placedIdOf = (key: string) => (key.startsWith('placed:') ? key.slice('placed:'.length) : null)

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
  if (use === 'bed') return height + 0.03
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
): RoomLayout {
  if (!spec || placements.length === 0) return layout
  const byId = new Map(catalog.map((item) => [item.id, item]))
  const taken = new Set<string>()
  for (const p of placements) {
    const item = byId.get(p.itemId)
    if (item && !item.wall) for (const [x, z] of homeTiles(item, p)) taken.add(`${x},${z}`)
  }
  const free = (x: number, z: number) =>
    spec.floor[z]?.[x] === '1' && spec.blocked[z]?.[x] !== '1' && !taken.has(`${x},${z}`)

  const blocks: Rect[] = [...layout.blocks]
  const spots: RoomLayout['spots'] = { ...layout.spots }
  const tapBoxes: RoomLayout['tapBoxes'] = { ...layout.tapBoxes }

  for (const p of placements) {
    const item = byId.get(p.itemId)
    if (!item || item.wall) continue
    const rect = pieceRect(spec, item, p)
    blocks.push(rect)
    const use = furnitureUse(item)
    if (!use) continue

    // A free tile beside it: the side facing the camera first
    const { w, d } = homeFootprint(item, p.rot)
    const candidates: [number, number][] = []
    for (let i = 0; i < w; i++) candidates.push([p.x + i, p.z + d], [p.x + i, p.z - 1])
    for (let j = 0; j < d; j++) candidates.push([p.x + w, p.z + j], [p.x - 1, p.z + j])
    const side = candidates.find(([x, z]) => free(x, z))
    if (!side) continue
    const approach: [number, number] = [spec.ox + (side[0] + 0.5) * HOME_TILE, spec.oz + (side[1] + 0.5) * HOME_TILE]
    const cx = (rect[0] + rect[2]) / 2
    const cz = (rect[1] + rect[3]) / 2
    const heading = Math.atan2(approach[0] - cx, approach[1] - cz)
    const standing = use === 'bucket' || use === 'cooker'
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
