/*
 * The furniture each home comes with (built into the room's GLB). Every player owns these as
 * normal placements (free, item ids "starter-…"), so Buy mode can move or remove them. The 3D
 * model stays the GLB's own: its objects are hidden and a copy is drawn where the piece sits.
 * Bath and kitchen pieces (toilet, bucket, cooker…) are starters too.
 * The same file lives in lib/game and backend/src/game: keep the two identical.
 */

type Rect = [number, number, number, number]
type Spot = { x: number; z: number; rot: 0 }
type Grid = { ox: number; oz: number; cols: number; rows: number }

export type StarterDef = {
  /** Catalogue item id (home_furniture, starter = true) */
  item: string
  /** Where it stands in the GLB, in floor coordinates [minX, minZ, maxX, maxZ] (its walking block) */
  rect: Rect
  /** GLB object names (an exact name also takes its numbered copies: "TableLeg" → "TableLeg.001"…) */
  nodes: string[]
  /** The room action it gives (its spot in room-layouts moves with it) */
  /** Tiles to shift its seed spot by when the nearest tiles touch a wall (the model stays put) */
  nudge?: [number, number]
  use: 'bed' | 'red-chair' | 'desk-chair' | 'sofa' | 'toilet' | 'bucket' | 'cooker' | null
}

/** Size of each starter piece in tiles (same in every home). */
export const STARTER_SIZE: Record<string, { w: number; d: number }> = {
  'starter-bed': { w: 3, d: 4 },
  'starter-shelf': { w: 2, d: 1 },
  'starter-desk': { w: 3, d: 1 },
  'starter-cooler': { w: 2, d: 1 },
  'starter-drum': { w: 3, d: 2 },
  'starter-red-chair': { w: 1, d: 1 },
  'starter-sofa': { w: 2, d: 4 },
  'starter-low-table': { w: 1, d: 1 },
  'starter-tv': { w: 1, d: 3 },
  'starter-toilet': { w: 1, d: 1 },
  'starter-bucket': { w: 1, d: 2 },
  'starter-cooker': { w: 1, d: 5 },
  'starter-gas': { w: 1, d: 1 },
  'starter-barrel': { w: 1, d: 1 },
  'starter-jerrycans': { w: 1, d: 1 },
}

const BED_NODES = ['BedBase', 'Mattress', 'Pillow', 'PillowEdge']
const SHELF_NODES = ['ShelfBoard', 'ShelfPost']
const DESK_NODES = ['TableTop', 'TableApron', 'TableLeg', 'WoodChair']
const COOLER_NODES = ['CoolerBody', 'CoolerLid']
const TOILET_NODES = ['ToiletBase', 'ToiletBowl', 'ToiletRim', 'ToiletSeatHole', 'ToiletTank', 'ToiletTankLid']
const BUCKET_NODES = ['Bucket', 'BucketRim', 'BucketWater', 'RedBasin', 'RedBasinIn']
// The pot sits on the cooker in the self-con and one bedroom
const COOKER_NODES = ['Counter', 'CounterTop', 'Cooker', 'Burner', 'PotBase', 'PotBody', 'PotLid']
const GAS_NODES = ['GasBottle', 'GasBottleTop']
const BARREL_NODES = ['Barrel', 'BarrelRim', 'BarrelWater']
const JERRY_NODES = ['Jerrycan', 'JerryCap', 'JerryHandle']

/** By lodging (the same keys as HOME_GRID). */
export const STARTERS: Record<string, StarterDef[]> = {
  'single-poultry': [
    { item: 'starter-bed', rect: [-3.4, 0.5, -1.5, 2.6], nodes: BED_NODES, use: 'bed' },
    { item: 'starter-shelf', rect: [-3.1, -3.3, -1.9, -2.7], nodes: SHELF_NODES, use: null },
    // The pot sits on the table in the single room
    { item: 'starter-desk', rect: [-2, -3.1, -0.3, -2.3], nodes: [...DESK_NODES, 'PotBase', 'PotBody', 'PotLid'], use: 'desk-chair' },
    { item: 'starter-cooler', rect: [0, -3.1, 1.1, -2.4], nodes: COOLER_NODES, use: null },
    { item: 'starter-drum', rect: [1.9, -3.4, 3.6, -2.4], nodes: ['Barrel', 'BarrelRim', 'BarrelWater', 'Jerrycan', 'JerryCap', 'JerryHandle'], use: null },
    { item: 'starter-red-chair', rect: [-0.05, 0.6, 0.6, 1.2], nodes: ['RedChair'], use: 'red-chair' },
    { item: 'starter-bucket', rect: [2.2, 0.3, 2.9, 1.4], nodes: BUCKET_NODES, use: 'bucket' },
    { item: 'starter-toilet', rect: [2.7, 1.3, 3.4, 1.9], nodes: TOILET_NODES, use: 'toilet' },
  ],
  'selfcon-g2': [
    { item: 'starter-bed', rect: [-4.8, 1.13, -2.9, 3.23], nodes: BED_NODES, use: 'bed' },
    { item: 'starter-shelf', rect: [-4.5, -4.7, -3.3, -4.1], nodes: SHELF_NODES, use: null },
    { item: 'starter-desk', rect: [-3.4, -4.5, -1.7, -3.7], nodes: DESK_NODES, use: 'desk-chair' },
    { item: 'starter-cooler', rect: [0, -4.2, 1.1, -3.5], nodes: COOLER_NODES, use: null },
    { item: 'starter-red-chair', rect: [-0.05, 0.96, 0.6, 1.56], nodes: ['RedChair'], use: 'red-chair' },
    { item: 'starter-barrel', rect: [-4.8, 5, -4, 5.8], nodes: BARREL_NODES, use: null },
    { item: 'starter-bucket', rect: [-4.174, 7.7, -3.374, 8.8], nodes: BUCKET_NODES, use: 'bucket' },
    { item: 'starter-toilet', rect: [-0.75, 7.49, -0.05, 8.19], nodes: TOILET_NODES, nudge: [-1, 0], use: 'toilet' },
    { item: 'starter-cooker', rect: [4.14, 6.22, 4.8, 9], nodes: COOKER_NODES, use: 'cooker' },
    { item: 'starter-gas', rect: [3.218, 8.45, 3.568, 8.85], nodes: GAS_NODES, use: null },
    { item: 'starter-jerrycans', rect: [0.2, 8.4, 0.95, 8.85], nodes: JERRY_NODES, use: null },
  ],
  'onebed-ojo': [
    { item: 'starter-bed', rect: [-11.9, -5.5, -10, -3.35], nodes: BED_NODES, use: 'bed' },
    { item: 'starter-shelf', rect: [-7.2, -5.4, -5.93, -4.8], nodes: SHELF_NODES, use: null },
    { item: 'starter-desk', rect: [-2, -5.2, -0.3, -4.4], nodes: DESK_NODES, use: 'desk-chair' },
    { item: 'starter-cooler', rect: [0, -4.75, 1.1, -4.05], nodes: COOLER_NODES, use: null },
    {
      item: 'starter-sofa',
      rect: [-1.02, -0.06, -0.12, 2.14],
      nodes: ['SofaBase', 'SofaBack', 'SofaArm', 'SofaCushion', 'SofaLeg'],
      use: 'sofa',
    },
    { item: 'starter-low-table', rect: [0.88, 0.64, 1.68, 1.44], nodes: ['LowTable', 'LowTableLeg', 'Rug', 'RugInner'], use: null },
    { item: 'starter-tv', rect: [5.05, -0.07, 5.51, 1.73], nodes: ['Tv', 'TvFoot', 'TvStand'], use: null },
    { item: 'starter-barrel', rect: [-5.5, 5.7, -4.7, 6.5], nodes: BARREL_NODES, use: null },
    { item: 'starter-bucket', rect: [-4.711, 9, -3.911, 10.1], nodes: BUCKET_NODES, use: 'bucket' },
    { item: 'starter-toilet', rect: [-0.75, 8.61, -0.05, 9.31], nodes: TOILET_NODES, nudge: [-1, 0], use: 'toilet' },
    { item: 'starter-cooker', rect: [4.84, 7.52, 5.5, 10.3], nodes: COOKER_NODES, use: 'cooker' },
    { item: 'starter-gas', rect: [3.702, 9.75, 4.052, 10.15], nodes: GAS_NODES, use: null },
    { item: 'starter-jerrycans', rect: [0.2, 9.7, 0.95, 10.15], nodes: JERRY_NODES, nudge: [1, 0], use: null },
  ],
}

/** The starters every home was given before bath and kitchen pieces joined (home_starters.items NULL). */
export const FIRST_STARTERS = [
  'starter-bed', 'starter-shelf', 'starter-desk', 'starter-cooler', 'starter-drum',
  'starter-red-chair', 'starter-sofa', 'starter-low-table', 'starter-tv',
]

/**
 * Starters a player in this home should get now: never given before (`given` NULL means the first
 * nine) and not already placed. A piece the player removed stays in `given`, so it never comes back.
 */
export function startersToAdd(defs: StarterDef[], given: string[] | null, placed: string[]): StarterDef[] {
  const had = new Set([...(given ?? FIRST_STARTERS), ...placed])
  return defs.filter((def) => !had.has(def.item))
}

export const isStarterItem = (itemId: string) => itemId.startsWith('starter-')

/** Does a GLB object belong to this piece? */
export function starterOwnsNode(def: StarterDef, name: string): boolean {
  return def.nodes.some((n) => name === n || (name.startsWith(`${n}.`) && /^\d+$/.test(name.slice(n.length + 1))))
}

/** The tile spot a starter piece is given (where it already stands in the GLB). */
export function starterSeedSpot(grid: Grid, def: StarterDef): Spot {
  const size = STARTER_SIZE[def.item] ?? { w: 1, d: 1 }
  const cx = (def.rect[0] + def.rect[2]) / 2
  const cz = (def.rect[1] + def.rect[3]) / 2
  // Centre the footprint on the piece, kept inside the grid
  const x = Math.round((cx - grid.ox) / 0.6 - size.w / 2) + (def.nudge?.[0] ?? 0)
  const z = Math.round((cz - grid.oz) / 0.6 - size.d / 2) + (def.nudge?.[1] ?? 0)
  return {
    x: Math.max(0, Math.min(grid.cols - size.w, x)),
    z: Math.max(0, Math.min(grid.rows - size.d, z)),
    rot: 0,
  }
}
