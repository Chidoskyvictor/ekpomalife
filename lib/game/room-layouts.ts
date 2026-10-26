import type { RoomView } from './room-camera'
import type { FurnitureId } from './room-furniture'
import type { LodgingId } from './room-types'
import ROOM_SHIFTS from './room-shifts.json'

/*
 * The three homes the room screen can show. All numbers are in each GLB's own
 * coordinates (floor at y 0, x right, z toward the camera). blender/build-rooms.py
 * lays the self-con and one bedroom out at the single room's size and then grows them;
 * the layouts below are written at that small size too and grown the same way here,
 * using room-shifts.json (where the build moved each piece of furniture).
 */

export type RoomLayoutId = 'single-room' | 'selfcon' | 'one-bedroom' | 'hostel' | 'club-sazza'

/** [minX, minZ, maxX, maxZ] */
export type Rect = [number, number, number, number]

export type FurnitureSpot = {
  /** Where the character stands before using it */
  approach: [number, number]
  /** Where the character sits / lies / crouches */
  at: [number, number, number]
  heading: number
}

type TapBox = [number, number, number, number, number, number]

export type RoomLayout = {
  id: RoomLayoutId
  label: string
  glb: string
  /** Where the character's centre may go (already kept clear of the outer walls). Overlap at doorways. */
  floors: Rect[]
  /** Furniture and inside walls, before adding the character's radius. */
  blocks: Rect[]
  start: [number, number]
  spots: Partial<Record<FurnitureId, FurnitureSpot>>
  /** Invisible tap boxes over each piece: [minX, minY, minZ, maxX, maxY, maxZ]. */
  tapBoxes: Partial<Record<FurnitureId, TapBox>>
  /** Where the owner stands when you visit. */
  host: { position: [number, number, number]; rotation: number }
  /** Which way the camera looks in (the open side of the house). */
  view: RoomView
  /** Camera distance multiplier: bigger homes pull the camera back. */
  cameraScale: number
  /** Walking speed (m/s); faster in bigger homes so crossing them doesn't drag. */
  speed: number
  /** Clubs keep their own dark neon lighting whatever the time of day. */
  mood?: 'club'
}

/* —— Layout at the single room's size, before growing —— */

/** A block that follows a piece of furniture (by GLB object name), or a wall when `of` is unset. */
type Block = { rect: Rect; of?: string }

type SmallLayout = Omit<RoomLayout, 'blocks'> & {
  blocks: Block[]
  /** GLB object each piece of furniture follows when the home grows. */
  pieces: Partial<Record<FurnitureId, string>>
}

const BED: Block = { rect: [-3.4, 0.5, -1.5, 2.6], of: 'BedBase' }
const SHELF: Block = { rect: [-3.1, -3.3, -1.9, -2.7], of: 'ShelfPost' }
const TABLE: Block = { rect: [-2.0, -3.1, -0.3, -2.3], of: 'TableTop' } // + wooden chair
const COOLER: Block = { rect: [0.0, -3.1, 1.1, -2.4], of: 'CoolerBody' }
const RED_CHAIR: Block = { rect: [-0.05, 0.6, 0.6, 1.2], of: 'RedChair_Seat' }

const BED_SPOT: FurnitureSpot = { approach: [-1.1, 1.7], at: [-2.45, 0.54, 2.4], heading: 0 }
const RED_CHAIR_SPOT: FurnitureSpot = { approach: [0.35, 1.65], at: [0.28, -0.25, 0.86], heading: 0.245 }
const DESK_CHAIR_SPOT: FurnitureSpot = { approach: [-1.75, -1.9], at: [-1.75, -0.28, -2.62], heading: 0 }

const BED_TAP: TapBox = [-3.4, 0, 0.5, -1.5, 0.6, 2.6]
const RED_CHAIR_TAP: TapBox = [-0.05, 0, 0.6, 0.6, 1.3, 1.2]
const DESK_CHAIR_TAP: TapBox = [-2.05, 0, -2.85, -1.45, 1.3, -2.35]

/* Bath + kitchen strip in front (z 3.5 … 6.5), shared by self-con and one bedroom */
const STRIP_BLOCKS: Block[] = [
  { rect: [-3.5, 3.44, -2.25, 3.56] }, // front inside wall, bath door at x −2.25 … −1.3
  { rect: [-1.3, 3.44, 0.9, 3.56] }, // kitchen opening at x 0.9 … 2.45
  { rect: [2.45, 3.44, 3.5, 3.56] },
  { rect: [-0.06, 3.5, 0.06, 6.5] }, // bath | kitchen
  { rect: [-3.4, 3.6, -2.6, 4.4], of: 'Barrel' },
  { rect: [-3.1, 5.1, -2.3, 6.2], of: 'Bucket' }, // + basin
  { rect: [-0.75, 5.25, -0.05, 5.95], of: 'ToiletBowl' },
  { rect: [2.74, 3.62, 3.4, 6.4], of: 'Counter' }, // + cooker
  { rect: [2.25, 5.85, 2.6, 6.25], of: 'GasBottle' },
  { rect: [0.2, 5.8, 0.95, 6.25], of: 'Jerrycan' },
]
const STRIP_SPOTS: Partial<Record<FurnitureId, FurnitureSpot>> = {
  toilet: { approach: [-1.3, 5.6], at: [-0.45, -0.18, 5.6], heading: -Math.PI / 2 },
  bucket: { approach: [-1.6, 5.4], at: [-1.95, 0, 5.4], heading: -Math.PI / 2 },
  cooker: { approach: [2.15, 5.0], at: [2.3, 0, 5.0], heading: Math.PI / 2 },
}
const STRIP_TAPS: Partial<Record<FurnitureId, TapBox>> = {
  toilet: [-0.78, 0, 5.25, -0.05, 1.05, 5.95],
  bucket: [-3.1, 0, 5.05, -2.25, 0.7, 6.25],
  cooker: [2.74, 0, 4.4, 3.4, 1.35, 5.7],
}
const STRIP_PIECES: Partial<Record<FurnitureId, string>> = { toilet: 'ToiletBowl', bucket: 'Bucket', cooker: 'Cooker' }

const SINGLE_ROOM: RoomLayout = {
  id: 'single-room',
  label: 'Single room',
  glb: '/models/single-room.glb',
  floors: [[-3.12, -3.12, 3.12, 3.12]],
  blocks: [
    BED.rect,
    SHELF.rect,
    TABLE.rect,
    COOLER.rect,
    [1.9, -3.4, 3.6, -2.4], // barrel + jerrycans
    RED_CHAIR.rect,
    [2.2, 0.3, 2.9, 1.4], // bucket + basin
    [2.7, 1.3, 3.4, 1.9], // toilet
  ],
  start: [1.2, 2.3],
  spots: {
    bed: BED_SPOT,
    'red-chair': RED_CHAIR_SPOT,
    'desk-chair': DESK_CHAIR_SPOT,
    toilet: { approach: [2.15, 2.0], at: [2.95, -0.18, 1.6], heading: -Math.PI / 2 },
    bucket: { approach: [1.6, 0.6], at: [1.95, 0, 0.6], heading: Math.PI / 2 },
  },
  tapBoxes: {
    bed: BED_TAP,
    'red-chair': RED_CHAIR_TAP,
    'desk-chair': DESK_CHAIR_TAP,
    toilet: [2.65, 0, 1.25, 3.35, 1.05, 1.95],
    bucket: [2.15, 0, 0.25, 2.95, 0.7, 1.45],
  },
  host: { position: [-0.6, 0, -1.4], rotation: Math.PI / 5 },
  view: 'corner',
  cameraScale: 1,
  speed: 1.7,
}

/** School hostel dorm (blender build_hostel): bunks on both side walls, your bunk front-left. */
const HOSTEL: RoomLayout = {
  id: 'hostel',
  label: 'Hostel room',
  glb: '/models/hostel-room.glb',
  floors: [[-2.82, -4.62, 2.82, 4.62]],
  blocks: [
    [-3.15, -4.8, -2.2, -2.8], // left bunks + lockers
    [-3.12, -2.72, -2.58, -2.13],
    [-3.15, -2.05, -2.2, -0.05], // your bunk
    [-3.12, 0.03, -2.58, 0.62],
    [2.2, -4.8, 3.15, -2.8], // right bunks + lockers
    [2.58, -2.72, 3.12, -2.13],
    [2.2, -2.05, 3.15, -0.05],
    [2.58, 0.03, 3.12, 0.62],
    [-2.95, 3.35, -2.45, 3.85], // bucket
    [-3.05, 3.95, -2.45, 4.55], // basin
    [2.3, 1.8, 3.1, 2.6], // reading table
    [1.73, 2.0, 2.15, 2.4], // plastic chair
  ],
  start: [0, 3.2],
  spots: {
    bed: { approach: [-1.75, -1.0], at: [-2.67, 0.65, -0.35], heading: 0 },
    'desk-chair': { approach: [1.35, 2.2], at: [1.95, -0.32, 2.2], heading: Math.PI / 2 },
    bucket: { approach: [-1.8, 3.6], at: [-2.15, 0, 3.6], heading: -Math.PI / 2 },
  },
  tapBoxes: {
    bed: [-3.15, 0, -2.05, -2.2, 0.75, -0.05],
    'desk-chair': [1.7, 0, 1.95, 2.2, 1.0, 2.45],
    bucket: [-3.05, 0, 3.3, -2.4, 0.7, 4.6],
  },
  host: { position: [0.5, 0, -1.2], rotation: 0 },
  view: 'front',
  cameraScale: 1.4,
  speed: 1.8,
}

/** Sazza (blender build_club): bar left, dance floor middle, DJ at the back, VIP lounge right. */
const CLUB_SAZZA: RoomLayout = {
  id: 'club-sazza',
  label: 'Sazza',
  glb: '/models/club-sazza.glb',
  floors: [[-5.62, -7.62, 5.62, 7.62]],
  blocks: [
    [-5.95, -3.05, -3.85, 5.05], // bar + back-bar
    [-3.75, -2.55, -3.25, 4.45], // bar stools
    [-2.8, -7.95, 2.8, -5.6], // DJ stage
    [-3.7, -7.7, -2.9, -6.7], // speakers
    [2.9, -7.7, 3.7, -6.7],
    [3.25, -4.5, 5.95, 4.5], // VIP platform
  ],
  start: [0, 6.2],
  spots: {
    'dance-floor': { approach: [0, -0.5], at: [0, 0.1, -0.5], heading: Math.PI },
    'bar-stool': { approach: [-2.85, 0.3], at: [-3.5, 0.04, 0.3], heading: -Math.PI / 2 },
    'vip-sofa': { approach: [4.1, 5.4], at: [5.35, 0.02, 0.2], heading: -Math.PI / 2 },
  },
  tapBoxes: {},
  host: { position: [0, 0, 0], rotation: 0 },
  view: 'corner',
  cameraScale: 2.1,
  speed: 2.6,
  mood: 'club',
}

const SELFCON_SMALL: SmallLayout = {
  id: 'selfcon',
  label: 'Self-con',
  glb: '/models/selfcon.glb',
  floors: [[-3.12, -3.12, 3.12, 6.12]],
  blocks: [BED, SHELF, TABLE, COOLER, RED_CHAIR, ...STRIP_BLOCKS],
  start: [1.2, 2.3],
  spots: { bed: BED_SPOT, 'red-chair': RED_CHAIR_SPOT, 'desk-chair': DESK_CHAIR_SPOT, ...STRIP_SPOTS },
  tapBoxes: { bed: BED_TAP, 'red-chair': RED_CHAIR_TAP, 'desk-chair': DESK_CHAIR_TAP, ...STRIP_TAPS },
  pieces: { bed: 'BedBase', 'red-chair': 'RedChair_Seat', 'desk-chair': 'WoodChair_Seat', ...STRIP_PIECES },
  host: { position: [-0.6, 0, -1.4], rotation: Math.PI / 5 },
  view: 'corner',
  cameraScale: 1.42,
  speed: 2.1,
}

const ONE_BEDROOM_SMALL: SmallLayout = {
  id: 'one-bedroom',
  label: 'One bedroom',
  glb: '/models/one-bedroom.glb',
  floors: [
    [-3.12, -3.12, 3.12, 6.12], // parlour + bath/kitchen strip
    [-7.12, -3.12, -3.0, 3.12], // bedroom (reaches into the doorway)
  ],
  blocks: [
    { rect: [-7.4, -3.4, -5.5, -1.25], of: 'BedBase' },
    { rect: [-5.1, -3.3, -3.83, -2.7], of: 'ShelfPost' },
    { rect: [-3.56, -3.5, -3.44, 1.05] }, // bedroom wall, door at z 1.05 … 2.05
    { rect: [-3.56, 2.05, -3.44, 3.5] },
    TABLE,
    COOLER,
    { rect: [-1.35, -0.45, -0.45, 1.75], of: 'SofaBase' },
    { rect: [0.55, 0.25, 1.35, 1.05], of: 'LowTable' },
    { rect: [2.95, -0.25, 3.41, 1.55], of: 'TvStand' },
    ...STRIP_BLOCKS,
  ],
  start: [1.8, 2.4],
  spots: {
    bed: { approach: [-5.1, -2.15], at: [-6.45, 0.54, -1.5], heading: 0 },
    sofa: { approach: [0.0, 1.1], at: [-0.8, -0.28, 1.1], heading: Math.PI / 2 },
    'desk-chair': DESK_CHAIR_SPOT,
    ...STRIP_SPOTS,
  },
  tapBoxes: {
    bed: [-7.4, 0, -3.4, -5.5, 0.6, -1.25],
    sofa: [-1.35, 0, -0.45, -0.45, 0.9, 1.75],
    'desk-chair': DESK_CHAIR_TAP,
    ...STRIP_TAPS,
  },
  pieces: { bed: 'BedBase', sofa: 'SofaBase', 'desk-chair': 'WoodChair_Seat', ...STRIP_PIECES },
  host: { position: [1.9, 0, -1.5], rotation: -Math.PI / 4 },
  view: 'corner',
  cameraScale: 1.72,
  speed: 2.4,
}

/* —— Growing (mirrors grow() in blender/build-rooms.py) —— */

const LINES_X = [-7.5, -3.5, 0, 3.5]
const LINES_Z = [-3.5, 3.5, 6.5]

/** Next to a wall line a coordinate keeps its distance from that wall; elsewhere it scales out. */
function snap(v: number, lines: number[], k: number) {
  const line = lines.reduce((best, l) => (Math.abs(l - v) < Math.abs(best - v) ? l : best))
  return Math.abs(v - line) <= 0.6 ? line * k + (v - line) : v * k
}

const growRect = ([x0, z0, x1, z1]: Rect, k: number): Rect => [
  snap(x0, LINES_X, k),
  snap(z0, LINES_Z, k),
  snap(x1, LINES_X, k),
  snap(z1, LINES_Z, k),
]

/** Walls get longer but keep their thickness. */
function growWall(rect: Rect, k: number): Rect {
  const [x0, z0, x1, z1] = rect
  if (x1 - x0 < z1 - z0) {
    const c = snap((x0 + x1) / 2, LINES_X, k)
    return [c - (x1 - x0) / 2, snap(z0, LINES_Z, k), c + (x1 - x0) / 2, snap(z1, LINES_Z, k)]
  }
  const c = snap((z0 + z1) / 2, LINES_Z, k)
  return [snap(x0, LINES_X, k), c - (z1 - z0) / 2, snap(x1, LINES_X, k), c + (z1 - z0) / 2]
}

type Grown = { k: number; shifts: Record<string, number[]> }

function grow(small: SmallLayout, { k, shifts }: Grown): RoomLayout {
  const shift = (name: string | undefined): [number, number] => {
    const s = name ? shifts[name] : undefined
    return s ? [s[0], s[1]] : [0, 0]
  }
  const spots: RoomLayout['spots'] = {}
  const tapBoxes: RoomLayout['tapBoxes'] = {}
  for (const id of Object.keys(small.spots) as FurnitureId[]) {
    const [dx, dz] = shift(small.pieces[id])
    const spot = small.spots[id]!
    spots[id] = {
      approach: [spot.approach[0] + dx, spot.approach[1] + dz],
      at: [spot.at[0] + dx, spot.at[1], spot.at[2] + dz],
      heading: spot.heading,
    }
    const tap = small.tapBoxes[id]
    if (tap) tapBoxes[id] = [tap[0] + dx, tap[1], tap[2] + dz, tap[3] + dx, tap[4], tap[5] + dz]
  }
  return {
    ...small,
    floors: small.floors.map((f) => growRect(f, k)),
    blocks: small.blocks.map(({ rect, of }) => {
      if (!of) return growWall(rect, k)
      const [dx, dz] = shift(of)
      return [rect[0] + dx, rect[1] + dz, rect[2] + dx, rect[3] + dz]
    }),
    start: [snap(small.start[0], LINES_X, k), snap(small.start[1], LINES_Z, k)],
    spots,
    tapBoxes,
    host: {
      position: [snap(small.host.position[0], LINES_X, k), 0, snap(small.host.position[2], LINES_Z, k)],
      rotation: small.host.rotation,
    },
    cameraScale: small.cameraScale * k,
  }
}

export const ROOM_LAYOUTS: Record<RoomLayoutId, RoomLayout> = {
  'single-room': SINGLE_ROOM,
  selfcon: grow(SELFCON_SMALL, ROOM_SHIFTS.selfcon),
  'one-bedroom': grow(ONE_BEDROOM_SMALL, ROOM_SHIFTS['one-bedroom']),
  hostel: HOSTEL,
  'club-sazza': CLUB_SAZZA,
}

/** The 3D scene for a club, by venue id. */
export const CLUB_LAYOUTS: Record<string, RoomLayout> = { sazza: CLUB_SAZZA }

/** Which home each lodging gets (chosen at sign-up; the hostel is the campus dorm). */
export function layoutForLodging(lodgingId: LodgingId | string | null | undefined): RoomLayout {
  if (lodgingId === 'hostel-poultry') return ROOM_LAYOUTS.hostel
  if (lodgingId === 'selfcon-g2') return ROOM_LAYOUTS.selfcon
  if (lodgingId === 'onebed-ojo') return ROOM_LAYOUTS['one-bedroom']
  return ROOM_LAYOUTS['single-room']
}
