import { LOCATIONS } from './content'
import { BUILDING_TINT, HOUSE_ROOFS, HOUSE_WALLS } from './map-theme'

export type Rect = { x: number; z: number; w: number; d: number }
export type Land = Rect & { name: string; shade?: 'light'; empty?: boolean }

export type Slab = Rect & {
  name: string
  h: number
  radius: number
  tone?: 'land' | 'residential' | 'first'
  color?: string
}

/** Named place on the first slab — move these to tweak the layout. */
export type MapZone = {
  id: string
  label: string
  /** World XZ centre */
  position: [number, number]
  /** Yaw radians */
  rotation: number
  /** Kenney model key, `admin-block`, `parking-lot`, `football-stadium`, or `pad` */
  model: string
  /** Ground footprint w × d */
  footprint: [number, number]
  /** Uniform scale for Kenney GLBs */
  scale?: number
  /** Multiplies Kenney colormap toward an earth tone */
  tint?: string
}

export type TreeSpot = {
  x: number
  z: number
  /** Relative size multiplier */
  s: number
  /** Which GLB — `tree.glb` or `pinetree.glb` */
  kind: 'tree' | 'pine'
  /** Yaw for variety */
  rot?: number
}

const WORLD_W = 180
const WORLD_D = 148
const LAYOUT_Z = -32
const WEST = -WORLD_W / 2
const NORTH = -WORLD_D / 2
export const SLAB_H = 0.42
const SLAB_R = 1.8

const xFromWest = (pct: number) => WEST + (pct / 100) * WORLD_W
const zFromNorth = (pct: number) => NORTH + (pct / 100) * WORLD_D

function slabFromPct(
  name: string,
  westPct: number,
  eastPct: number,
  northPct: number,
  southPct: number,
  tone: Slab['tone'] = 'land',
  color?: string,
): Slab {
  const x0 = xFromWest(westPct)
  const x1 = xFromWest(eastPct)
  const z0 = zFromNorth(northPct)
  const z1 = zFromNorth(southPct)
  return {
    name,
    x: (x0 + x1) / 2,
    z: (z0 + z1) / 2 + LAYOUT_Z,
    w: x1 - x0,
    d: z1 - z0,
    h: SLAB_H,
    radius: SLAB_R,
    tone,
    color,
  }
}

// —— Original first-slab extents (before extension) ——
const ORIG_WEST = xFromWest(1)
const ORIG_EAST = xFromWest(99)
const ORIG_NORTH = zFromNorth(1) + LAYOUT_Z
const ORIG_SOUTH = zFromNorth(45) + LAYOUT_Z
const ORIG_W = ORIG_EAST - ORIG_WEST
const ORIG_D = ORIG_SOUTH - ORIG_NORTH

// +40% width to the RIGHT, +25% depth at the TOP
const FIRST_WEST = ORIG_WEST
const FIRST_EAST = ORIG_EAST + ORIG_W * 0.4
const FIRST_NORTH = ORIG_NORTH - ORIG_D * 0.25
const FIRST_SOUTH = ORIG_SOUTH
const FIRST_W = FIRST_EAST - FIRST_WEST
const FIRST_D = FIRST_SOUTH - FIRST_NORTH

/** AAU fence — a bit right of the middle of the *original* slab */
export const FENCE_X = ORIG_WEST + ORIG_W * 0.55

export const FIRST_SLAB: Slab = {
  name: 'north',
  x: (FIRST_WEST + FIRST_EAST) / 2,
  z: (FIRST_NORTH + FIRST_SOUTH) / 2,
  w: FIRST_W,
  d: FIRST_D,
  h: SLAB_H,
  radius: SLAB_R,
  tone: 'first',
  color: 'rgb(157, 183, 131)',
}

export const LEFT_SLAB: Slab = FIRST_SLAB
export const CAMPUS_SLAB: Slab = FIRST_SLAB

export const FRONT_SLAB: Slab = slabFromPct('south', 1, 99, 54, 97)
export const IHUMUDUMU_SLAB: Slab = FRONT_SLAB
export const EMAUDO_SLAB: Slab = FRONT_SLAB
export const SCHOOL_SLAB: Slab = FRONT_SLAB
export const UKE_SLAB = FRONT_SLAB
export const OUTSKIRTS_SLAB = FRONT_SLAB
export const RESIDENTIAL_SLAB = FIRST_SLAB

export const SLABS: Slab[] = [FIRST_SLAB, FRONT_SLAB]

export const UKE_LATERITE: Rect = {
  x: xFromWest(18),
  z: zFromNorth(72) + LAYOUT_Z,
  w: 24,
  d: 20,
}

/** Local 0–1 on the first slab → world XZ */
export function firstSlabXZ(u: number, v: number): [number, number] {
  return [FIRST_WEST + u * FIRST_W, FIRST_NORTH + v * FIRST_D]
}

/** Lane width in world units — City Bits tiles are scaled to this. */
export const ROAD_W = 3.2

function roadH(name: string, u0: number, u1: number, v: number, dashed = true): RoadGap {
  const [x0] = firstSlabXZ(u0, v)
  const [x1] = firstSlabXZ(u1, v)
  const [, z] = firstSlabXZ((u0 + u1) / 2, v)
  return { name, x: (x0 + x1) / 2, z, w: Math.abs(x1 - x0), d: ROAD_W, dashed }
}

function roadV(name: string, u: number, v0: number, v1: number, dashed = true): RoadGap {
  const [, z0] = firstSlabXZ(u, v0)
  const [, z1] = firstSlabXZ(u, v1)
  const [x] = firstSlabXZ(u, (v0 + v1) / 2)
  return { name, x, z: (z0 + z1) / 2, w: ROAD_W, d: Math.abs(z1 - z0), dashed }
}

export type RoadGap = Rect & { name: string; dashed?: boolean }

/**
 * Roads on the first slab (u = west→east, v = north→south).
 * Fence ≈ u = ORIG_W/FIRST_W * 0.55 ≈ 0.39
 */
const FENCE_U = (FENCE_X - FIRST_WEST) / FIRST_W

export const ROAD_GAPS: RoadGap[] = [
  // Bottom main road
  roadH('bottom-main', 0.04, 0.96, 0.93),
  // Town verticals (left of fence)
  roadV('town-halls', 0.18, 0.12, 0.9),
  roadV('amos-jack', 0.28, 0.12, 0.9),
  // Between Admin column (~+0.14) and Cordelia/Law column (~+0.28) — straight down
  roadV('admin-cordelia', FENCE_U + 0.21, 0.1, 0.9),
  // Top campus road into extended area
  roadH('campus-top', FENCE_U + 0.02, 0.96, 0.14),
  // Extended verticals
  roadV('ext-law-mgmt', 0.78, 0.12, 0.9),
  roadV('ext-eng', 0.88, 0.12, 0.9),
]

export const ROAD_FRAME: Rect[] = []

export const WORLD: Rect = {
  x: FIRST_SLAB.x,
  z: (FIRST_SLAB.z + FRONT_SLAB.z) / 2,
  w: Math.max(FIRST_W, FRONT_SLAB.w) + 24,
  d: FIRST_D + FRONT_SLAB.d + 40,
}

export const LANDS: Land[] = SLABS.map(({ name, x, z, w, d, tone }) => ({
  name,
  x,
  z,
  w,
  d,
  shade: tone === 'residential' ? 'light' : undefined,
}))

export const LAND_CENTER = { x: FIRST_SLAB.x, z: FIRST_SLAB.z }

export const ROADS: Rect[] = ROAD_GAPS.map(({ x, z, w, d }) => ({ x, z, w, d }))

export const CAMPUS_ZONE: Rect = {
  x: (FENCE_X + FIRST_EAST) / 2,
  z: FIRST_SLAB.z,
  w: FIRST_EAST - FENCE_X,
  d: FIRST_D,
}
export const MED_ZONE: Rect = { x: 0, z: 0, w: 0, d: 0 }

function zone(
  id: string,
  label: string,
  u: number,
  v: number,
  model: string,
  footprint: [number, number],
  rotation = 0,
  scale?: number,
  tint?: string,
): MapZone {
  const [x, z] = firstSlabXZ(u, v)
  return { id, label, position: [x, z], rotation, model, footprint, scale, tint }
}

const { original, earth, sand, clay, purple, plum, lilac } = BUILDING_TINT

/**
 * First-slab places from the annotated sketch.
 * Edit `position` / `rotation` / `model` here to rearrange.
 */
/**
 * Road UV rails (keep buildings in the green between these):
 *   V: 0.18 · 0.28 · ~0.60 (admin–cordelia) · 0.78 · 0.88
 *   H: 0.14 (campus-top, east of fence) · 0.93 (bottom)
 */
export const MAP_ZONES: MapZone[] = [
  // —— TOWN (left of fence) —— west strip u≈0.08, mid strip u≈0.23, east strip u≈0.34
  zone('animal-house-1', 'Animal House', 0.08, 0.08, 'building-c', [5.5, 5], 0, 3.2),
  zone('anatomy-secretariat', 'Anatomy Secretariat', 0.08, 0.22, 'building-d', [6, 5], Math.PI / 2, 3.3),
  zone('bamssa', 'BAMSSA', 0.08, 0.34, 'building-e', [5.5, 5], 0, 3.2),
  zone('hall-200', '200 Level Hall', 0.08, 0.48, 'building-i', [7, 5.5], 0, 3.5),
  zone('relaxation-centre', 'Relaxation Centre', 0.08, 0.6, 'building-f', [5.5, 5], 0, 3.3),
  zone('hall-100', '100 Level Hall', 0.08, 0.72, 'building-h', [7, 5.5], 0, 3.5),
  zone('etf-hall', 'ETF Hall', 0.08, 0.82, 'building-g', [6, 5.5], 0, 3.4),
  zone('mls-hall', 'MLS Hall', 0.12, 0.82, 'building-skyscraper-b', [5, 5], 0, 3.8),
  zone('college-of-medicine', 'College of Medicine', 0.08, 0.8, 'building-k', [9, 6], Math.PI / 2, 3.5),
  // Between town-halls (0.18) and amos-jack (0.28)
  zone('ict-lab', 'ICT Lab', 0.23, 0.22, 'building-a', [5.5, 5], 0, 3.2),
  zone('town-shop-1', 'Shop', 0.23, 0.36, 'low-detail-building-a', [3.8, 3.8], 0, 2.4),
  zone('town-shop-2', 'Shop', 0.23, 0.48, 'low-detail-building-b', [3.8, 3.8], 0, 2.4),
  zone('town-shop-3', 'House', 0.23, 0.6, 'low-detail-building-c', [3.8, 3.8], 0, 2.4),
  zone('town-shop-4', 'Shop', 0.23, 0.72, 'low-detail-building-d', [3.8, 3.8], 0, 2.4),
  // Between amos-jack (0.28) and fence (~0.39)
  zone('animal-house-2', 'Animal House', 0.34, 0.22, 'building-b', [5.5, 5], 0, 3.2),
  zone('off-campus-hostels', 'Off-campus Hostels', 0.34, 0.08, 'low-detail-building-wide-a', [11, 6], 0, 2.8),
  zone('cattle-market', 'Cattle Market', 0.34, 0.42, 'low-detail-building-j', [10, 8], 0, 2.6),
  zone('sazza', 'Sazza', 0.34, 0.58, 'building-c', [5, 5], 0, 3.1),

  // —— GATE —— clear of bottom road (v=0.93) and spine
  zone('aau-gate', 'AAU School Gate', FENCE_U + 0.04, 0.84, 'building-a', [7, 4], Math.PI, 3.3),

  // —— CAMPUS —— west lawn: clinic + pitch fully east of fence (inside campus)
  zone('clinic', 'Clinic', FENCE_U + 0.06, 0.22, 'building-d', [5.5, 5], 0, 3.2, original),
  zone('sports-complex', 'Sports Complex', FENCE_U + 0.1, 0.4, 'football-stadium', [14, 11], 0),
  // North of campus-top (v=0.14)
  zone('life-science', 'Life Science', FENCE_U + 0.16, 0.06, 'building-f', [6.5, 5.5], 0, 3.3, original),
  zone('social-science', 'Social Science', FENCE_U + 0.28, 0.06, 'building-g', [6.5, 5.5], 0, 3.3, sand),

  // Main column (north→south): ICT → Education → Mass Comm → Admin (Admin in old Cordelia slot)
  zone('ict-exams', 'ICT', FENCE_U + 0.14, 0.28, 'building-skyscraper-d', [9, 8], 0, 4, lilac),
  zone('education', 'Education', FENCE_U + 0.14, 0.42, 'building-i', [6.5, 5.5], 0, 3.3, earth),
  zone('mass-comm', 'Mass Comm', FENCE_U + 0.14, 0.56, 'building-j', [7, 6], 0, 3.5, plum),
  // Large pad under the whole L; courtyard parking is nested in AdminZone (not a separate pad)
  zone('admin-block', 'Admin Block', FENCE_U + 0.14, 0.68, 'admin-block', [18, 16], Math.PI / 2, 3.2),

  // Next column — Cordelia takes a former Law plot; Law shifts to Education’s old plot
  zone('physical-science', 'Physical Science', FENCE_U + 0.28, 0.26, 'building-h', [6.5, 5.5], 0, 3.3, original),
  zone('law-campus', 'Law', FENCE_U + 0.28, 0.4, 'building-l', [6.5, 5.5], 0, 3.4, original),
  zone('students-centre', "Students' Centre", FENCE_U + 0.28, 0.56, 'building-k', [7, 6], 0, 3.4, lilac),
  zone('cordelia-hall', 'Cordelia Agbebaku Hall', FENCE_U + 0.28, 0.68, 'building-m', [8, 6], Math.PI / 2, 3.5, clay),
  zone('twin-hall', 'Twin Hall', FENCE_U + 0.34, 0.56, 'building-n', [8, 6], Math.PI / 2, 3.5, purple),

  // —— EXTENDED ——
  zone('school-hostels-1', 'School Hostels', 0.7, 0.06, 'low-detail-building-wide-a', [11, 5.5], 0, 2.9, original),
  zone('school-hostels-2', 'School Hostels', 0.83, 0.06, 'low-detail-building-wide-b', [11, 5.5], 0, 2.9, earth),
  zone('school-hostels-3', 'School Hostels', 0.94, 0.06, 'building-c', [7, 5.5], 0, 3.2, plum),
  zone('law-ext', 'Law', 0.7, 0.28, 'building-l', [7, 6], 0, 3.5, sand),
  zone('management-science', 'Management Science', 0.83, 0.28, 'building-m', [8, 6.5], 0, 3.6, original),
  // Story building (not the skyscraper — that mesh moved to ICT)
  zone('engineering', 'Engineering', 0.83, 0.52, 'building-m', [9, 7], 0, 3.6, purple),
  zone('parking-ext', 'Parking Lot', 0.94, 0.52, 'parking-lot', [14, 10], 0),
  // Annotated far-right lawn — big shuttle / parking
  zone('shuttle-park', 'Shuttle Park', 0.94, 0.78, 'parking-lot', [24, 16], 0),

  // Gameplay places (placeholder Kenney models)
  zone('bukka', 'Mama Amina Bukka', 0.23, 0.84, 'low-detail-building-e', [4.5, 4], 0, 2.6, sand),
  zone('keke-park', 'Keke Park', FENCE_U + 0.06, 0.78, 'low-detail-building-f', [5, 4], 0, 2.5, original),
  zone('market', 'Ekpoma Market', 0.34, 0.72, 'low-detail-building-wide-b', [10, 6], 0, 2.7, clay),
]

export const MAP_LOCATION_IDS = [
  'aau_campus',
  'aau_library',
  'mbc',
  'sports_complex',
  'college_of_medicine',
  'campus_shop',
  'keke_park',
  'roadside_bukka',
  'viewing_centre',
  'ekpoma_market',
  'innovation_hub',
  'church',
  'mosque',
  'igbinedion_hostel',
  'maryvale_hostel',
] as const
export type MapLocationId = (typeof MAP_LOCATION_IDS)[number]
export const isMapLocation = (id: string): id is MapLocationId =>
  (MAP_LOCATION_IDS as readonly string[]).includes(id)

export function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const inRect = (x: number, z: number, rect: Rect, pad = 0) =>
  Math.abs(x - rect.x) < rect.w / 2 + pad && Math.abs(z - rect.z) < rect.d / 2 + pad

/** Dense tree cover on first-slab greens — uses `tree.glb` + `pinetree.glb`. */
export const TREE_SPOTS: TreeSpot[] = (() => {
  const spots: TreeSpot[] = []
  const rand = mulberry32(4242)
  const nearRoad = (x: number, z: number, pad: number) =>
    ROAD_GAPS.some((road) => inRect(x, z, road, pad))
  const nearZone = (x: number, z: number, pad: number) =>
    MAP_ZONES.some(({ position, footprint }) => {
      const [fw, fd] = footprint
      return Math.abs(x - position[0]) < fw / 2 + pad && Math.abs(z - position[1]) < fd / 2 + pad
    })

  const pushWorld = (x: number, z: number, s: number, kind: TreeSpot['kind']) => {
    if (!inRect(x, z, FIRST_SLAB, -2.5)) return
    if (nearRoad(x, z, 2.2)) return
    if (nearZone(x, z, 2.8)) return
    spots.push({ x, z, s, kind, rot: rand() * Math.PI * 2 })
  }

  const push = (u: number, v: number, s = 1, kind: TreeSpot['kind'] = 'tree') => {
    const [x, z] = firstSlabXZ(u, v)
    pushWorld(x, z, s, kind)
  }

  // Sparse clusters only — a handful per green pocket
  const clusters: [number, number, number, TreeSpot['kind']][] = [
    [FENCE_U + 0.02, 0.32, 2, 'pine'],
    [FENCE_U + 0.05, 0.18, 2, 'tree'],
    [FENCE_U + 0.2, 0.5, 2, 'pine'],
    [FENCE_U + 0.32, 0.62, 2, 'tree'],
    [0.7, 0.4, 2, 'pine'],
    [0.9, 0.58, 2, 'tree'],
    [0.22, 0.48, 1, 'pine'],
    [0.34, 0.7, 1, 'tree'],
  ]
  for (const [u, v, n, kind] of clusters) {
    for (let i = 0; i < n; i++) {
      push(u + (rand() - 0.5) * 0.04, v + (rand() - 0.5) * 0.05, 0.85 + rand() * 0.35, kind)
    }
  }

  return spots
})()

export const onLand = (x: number, z: number, pad = 0) => LANDS.some((land) => inRect(x, z, land, -pad))

const nearLandmark = (x: number, z: number, pad: number) =>
  LOCATIONS.some(
    ({ position, size }) =>
      Math.abs(x - position[0]) < size[0] / 2 + pad && Math.abs(z - position[1]) < size[2] / 2 + pad,
  )

const onRoad = (x: number, z: number, pad: number) => ROADS.some((road) => inRect(x, z, road, pad))

export type HouseStyle = 'block' | 'tower' | 'duplex' | 'villa'
export type House = {
  x: number
  z: number
  w: number
  d: number
  h: number
  style: HouseStyle
  wall: string
  accent: string
  rot: number
}
export type Lamp = { x: number; z: number }

function pickStyle(roll: number): HouseStyle {
  if (roll < 0.14) return 'tower'
  if (roll < 0.4) return 'duplex'
  if (roll < 0.58) return 'villa'
  return 'block'
}

export function generateTown() {
  const rand = mulberry32(2026)
  const houses: House[] = []
  const lamps: Lamp[] = []

  const onEmptyLand = (x: number, z: number) => LANDS.some((land) => land.empty && inRect(x, z, land, -1))

  for (let x = -76; x <= 44; x += 6) {
    for (let z = -40; z <= 58; z += 6) {
      if (!onLand(x, z, 2.4)) continue
      if (onEmptyLand(x, z)) continue
      if (onRoad(x, z, 2.4) || nearLandmark(x, z, 2.8)) continue
      if (inRect(x, z, CAMPUS_ZONE, -0.4) || inRect(x, z, MED_ZONE, -0.4)) continue
      if (inRect(x, z, FIRST_SLAB, -2)) continue
      if (rand() > 0.32) continue
      const style = pickStyle(rand())
      const tall = style === 'tower'
      houses.push({
        x,
        z,
        w: tall ? 2 + rand() * 0.5 : 2.4 + rand() * 0.7,
        d: tall ? 2 + rand() * 0.4 : 2.2 + rand() * 0.6,
        h: tall ? 3.4 + rand() * 1.6 : 1.4 + rand() * 0.8,
        style,
        wall: HOUSE_WALLS[Math.floor(rand() * HOUSE_WALLS.length)]!,
        accent: HOUSE_ROOFS[Math.floor(rand() * HOUSE_ROOFS.length)]!,
        rot: rand() < 0.5 ? 0 : Math.PI / 2,
      })
    }
  }

  for (const road of ROADS) {
    const horizontal = road.w > road.d
    const length = horizontal ? road.w : road.d
    const half = (horizontal ? road.d : road.w) / 2 + 0.7
    for (let along = -length / 2 + 8; along < length / 2 - 4; along += 14) {
      const side = lamps.length % 2 === 0 ? 1 : -1
      lamps.push(
        horizontal
          ? { x: road.x + along, z: road.z + side * half }
          : { x: road.x + side * half, z: road.z + along },
      )
    }
  }

  return { houses, lamps }
}
