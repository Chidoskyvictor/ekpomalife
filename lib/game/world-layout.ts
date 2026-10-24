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
  /** Kenney model key, `admin-block`, `hostel-block`, `aau-gate`, `parking-lot`, `football-stadium`, or `pad` */
  model: string
  /** Ground footprint w × d */
  footprint: [number, number]
  /** Uniform scale for Kenney GLBs */
  scale?: number
  /** Multiplies Kenney colormap toward an earth tone */
  tint?: string
  /** Extra Y on the model root (baked from zone debug). */
  modelY?: number
  /** Multiplies fit scale after layout `scale` (baked from zone debug). */
  scaleMul?: number
  /** Which slab the zone sits on (default: first). Second-slab zones are tappable. */
  slab?: 'south'
  /** Several models in one zone (offsets in zone-local units, before zone rotation). */
  parts?: ZonePart[]
  /** No building: a ground plot with props (still tappable). */
  open?: OpenZoneKind
}

export type OpenZoneKind = 'park' | 'plot' | 'plaza'

/** One model inside a multi-building zone. `model` is a Kenney key or `parking-lot`. */
export type ZonePart = {
  model: string
  dx: number
  dz: number
  rotation?: number
  /** Kenney scale (default 4.9); for `parking-lot`, the [w, d] it is stretched to via `size`. */
  scale?: number
  size?: [number, number]
  tint?: string
  /** Skip the cement pad (props like parasols). */
  noPad?: boolean
  /** Put a cross sign on this part's roof. */
  cross?: boolean
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

/** Narrow gap between the main south slab and its east extension (visible demarcation). */
export const FRONT_SLAB_GAP = 2.4

const FRONT_SLAB_EXT_W = Math.max(0, FIRST_W - FRONT_SLAB.w - FRONT_SLAB_GAP)

/** East extension so the south island matches the first slab width (two green pieces + gap). */
export const FRONT_SLAB_EXT: Slab = {
  name: 'south-ext',
  x: FRONT_SLAB.x + FRONT_SLAB.w / 2 + FRONT_SLAB_GAP + FRONT_SLAB_EXT_W / 2,
  z: FRONT_SLAB.z,
  w: FRONT_SLAB_EXT_W,
  d: FRONT_SLAB.d,
  h: SLAB_H,
  radius: SLAB_R,
  tone: 'land',
}

/** East-extension hostel grid (8×5 with 4.5% / 5% margins) — the spacing every hostel slab copies. */
export const HOSTEL_GRID = {
  marginX: FRONT_SLAB_EXT.w * 0.045,
  marginZ: FRONT_SLAB_EXT.d * 0.05,
  pitchX: (FRONT_SLAB_EXT.w * (1 - 2 * 0.045)) / 8,
  pitchZ: (FRONT_SLAB_EXT.d * (1 - 2 * 0.05)) / 5,
}
export const REAR_HOSTEL_COLS = 16
export const REAR_HOSTEL_ROWS = 7

const REAR_SLAB_GAP = 3.2
const REAR_SLAB_W = REAR_HOSTEL_COLS * HOSTEL_GRID.pitchX + 2 * HOSTEL_GRID.marginX
const REAR_SLAB_D = REAR_HOSTEL_ROWS * HOSTEL_GRID.pitchZ + 2 * HOSTEL_GRID.marginZ

/** Hostel district north of the campus slab, sized to fit its grid at east-extension spacing. */
export const REAR_HOSTEL_SLAB: Slab = {
  name: 'north-hostels',
  x: FIRST_SLAB.x,
  z: FIRST_NORTH - REAR_SLAB_GAP - REAR_SLAB_D / 2,
  w: REAR_SLAB_W,
  d: REAR_SLAB_D,
  h: SLAB_H,
  radius: SLAB_R,
  tone: 'residential',
}

export const IHUMUDUMU_SLAB: Slab = FRONT_SLAB
export const EMAUDO_SLAB: Slab = FRONT_SLAB
export const SCHOOL_SLAB: Slab = FRONT_SLAB
export const UKE_SLAB = FRONT_SLAB
export const OUTSKIRTS_SLAB = FRONT_SLAB
export const RESIDENTIAL_SLAB = FIRST_SLAB

export const SLABS: Slab[] = [REAR_HOSTEL_SLAB, FIRST_SLAB, FRONT_SLAB, FRONT_SLAB_EXT]

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

/** Inverse of {@link firstSlabXZ} for debug export (u, v in 0–1). */
export function firstSlabUV(x: number, z: number): [number, number] {
  return [(x - FIRST_WEST) / FIRST_W, (z - FIRST_NORTH) / FIRST_D]
}

const FRONT_WEST = FRONT_SLAB.x - FRONT_SLAB.w / 2
const FRONT_NORTH = FRONT_SLAB.z - FRONT_SLAB.d / 2

/** Local 0–1 on the second (south) slab → world XZ */
export function frontSlabXZ(u: number, v: number): [number, number] {
  return [FRONT_WEST + u * FRONT_SLAB.w, FRONT_NORTH + v * FRONT_SLAB.d]
}

/** Inverse of {@link frontSlabXZ} for debug export (u, v in 0–1). */
export function frontSlabUV(x: number, z: number): [number, number] {
  return [(x - FRONT_WEST) / FRONT_SLAB.w, (z - FRONT_NORTH) / FRONT_SLAB.d]
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

/** School gate UV on the first slab (sync with zone debug export). */
export const AAU_GATE_U = 0.5803
export const AAU_GATE_V = 0.8821

export const ROAD_GAPS: RoadGap[] = [
  // Bottom main road
  roadH('bottom-main', 0.04, 0.96, 0.93),
  // Town verticals (left of fence)
  roadV('town-halls', 0.18, 0.12, 0.9),
  roadV('amos-jack', 0.28, 0.12, 0.9),
  // Annotated red-X road (old admin–cordelia / mid campus vertical) removed —
  // opens the Twin Hall ↔ Engineering strip for the big parking lot.
  // Top campus road into extended area
  roadH('campus-top', FENCE_U + 0.02, 0.96, 0.14),
  // Far-right vertical only
  roadV('ext-eng', 0.92, 0.12, 0.9),
]

export const ROAD_FRAME: Rect[] = []

const FRONT_TOTAL_W = FRONT_SLAB.w + FRONT_SLAB_GAP + FRONT_SLAB_EXT_W

const WORLD_NORTH_Z = REAR_HOSTEL_SLAB.z - REAR_HOSTEL_SLAB.d / 2
const WORLD_SOUTH_Z = FRONT_SLAB.z + FRONT_SLAB.d / 2

export const WORLD: Rect = {
  x: FIRST_SLAB.x,
  z: (WORLD_NORTH_Z + WORLD_SOUTH_Z) / 2,
  w: Math.max(FIRST_W, FRONT_TOTAL_W) + 24,
  d: WORLD_SOUTH_Z - WORLD_NORTH_Z + 48,
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
  extras?: Pick<MapZone, 'modelY' | 'scaleMul'>,
): MapZone {
  const [x, z] = firstSlabXZ(u, v)
  return { id, label, position: [x, z], rotation, model, footprint, scale, tint, ...extras }
}

const { original, earth, sand, clay, purple, plum, lilac } = BUILDING_TINT

/**
 * First-slab places from the annotated sketch.
 * Edit `position` / `rotation` / `model` here to rearrange.
 */
/**
 * Road UV rails (keep buildings in the green between these):
 *   V: 0.18 · 0.28 · 0.92
 *   H: 0.14 (campus-top, east of fence) · 0.93 (bottom)
 */
/**
 * Off-campus plots use the same Kenney scale / footprint band as AAU campus
 * (~4.9–5.1, ~10×8) so heights match. Layout = two sides + open walk lane,
 * not a single straight column and not random scatter.
 */
const FIRST_ZONES: MapZone[] = [
  // —— COLLEGE OF MEDICINE plot (west of town-halls u=0.18) ——
  // Walk lane down the middle (u≈0.085). West row + east row face the yard.
  // West row (slab edge)
  zone('animal-house-1', 'Animal House', 0.055, 0.12, 'building-c', [10, 8], 0, 4.9, original),
  zone('bamssa', 'BAMSSA', 0.055, 0.3, 'building-e', [10, 8], 0, 4.9, clay),
  zone('relaxation-centre', 'Relaxation Centre', 0.055, 0.48, 'building-f', [10, 8], 0, 4.9, sand),
  zone('etf-hall', 'ETF Hall', 0.055, 0.66, 'building-g', [10.5, 8.5], 0, 5, purple),
  // East row (toward town-halls road — still clear of u=0.18)
  zone('anatomy-secretariat', 'Anatomy Secretariat', 0.115, 0.18, 'building-d', [10, 8], Math.PI, 4.9, earth),
  zone('hall-200', '200 Level Hall', 0.115, 0.36, 'building-i', [10.5, 8.5], Math.PI, 5, plum),
  zone('hall-100', '100 Level Hall', 0.115, 0.54, 'building-h', [10.5, 8.5], Math.PI, 5, original),
  zone('mls-hall', 'MLS Hall', 0.115, 0.7, 'building-skyscraper-b', [10, 8], Math.PI, 5, lilac),
  // South head of the yard — faces north into the precinct
  zone('college-of-medicine', 'College of Medicine', 0.085, 0.8, 'building-k', [11.5, 9], Math.PI, 5.1, clay),

  // —— Mid plot between town-halls (0.18) and amos-jack (0.28) ——
  // Open spine u≈0.23; buildings on west / east flanks so you can walk through.
  zone('ict-lab', 'ICT Lab', 0.205, 0.18, 'building-a', [10, 8], 0, 4.9, lilac),
  zone('town-shop-1', 'Shop', 0.245, 0.28, 'building-b', [10, 8], Math.PI, 4.9, sand),
  zone('town-shop-2', 'Shop', 0.205, 0.4, 'building-c', [10, 8], 0, 4.9, purple),
  zone('town-shop-3', 'House', 0.245, 0.52, 'building-d', [10, 8], Math.PI, 4.9, original),
  zone('town-shop-4', 'Shop', 0.205, 0.64, 'building-e', [10, 8], 0, 4.9, earth),
  zone('bukka', 'Mama Amina Bukka', 0.245, 0.76, 'building-f', [10, 8], Math.PI, 4.9, sand),

  // —— East plot between amos-jack (0.28) and fence (~0.39) ——
  zone('off-campus-hostels', 'Off-campus Hostels', 0.32, 0.12, 'hostel-block', [11.5, 9], 0, 5.1),
  zone('animal-house-2', 'Animal House', 0.355, 0.26, 'building-b', [10, 8], Math.PI, 4.9, clay),
  zone('cattle-market', 'Cattle Market', 0.32, 0.42, 'building-j', [11, 8.5], 0, 5, original),
  // Hand-made GLB (public/models/sazza.glb) on a cement pad. Placed in the debug panel at
  // x 0.25, z -67.5, scaleMul 2.75 with the old dirt-lot model; converted for the building-only model.
  zone('sazza', 'Sazza', 0.3596, 0.6467, 'sazza', [10, 8], 0, undefined, undefined, { modelY: 0.12, scaleMul: 2.007 }),

  // —— GATE —— main entrance (bottom-main road approaches from v≈0.93)
  zone('aau-gate', 'AAU School Gate', AAU_GATE_U, AAU_GATE_V, 'aau-gate', [22, 6], 0, 4.65, undefined, {
    scaleMul: 1,
  }),

  // —— CAMPUS —— west lawn: clinic + pitch fully east of fence (inside campus)
  zone('clinic', 'Clinic', FENCE_U + 0.06, 0.2, 'building-d', [8, 6.5], 0, 4.3, original),
  // Inside campus, ≥2 tiles clear of the fence; clear of Admin / Mass Comm / Education
  zone('sports-complex', 'Sports Complex', FENCE_U + 0.08, 0.4584, 'football-stadium', [15, 12], 0),

  // Main column (north→south): ICT → Education → Mass Comm → Admin
  zone('ict-exams', 'ICT', FENCE_U + 0.14, 0.26, 'building-skyscraper-d', [11, 10], 0, 5, lilac),
  zone('education', 'Education', FENCE_U + 0.14, 0.38, 'building-i', [10, 8], 0, 4.9, earth),
  // Shifted east + north so it is not sitting on the Admin Block
  zone('mass-comm', 'Mass Comm', FENCE_U + 0.2, 0.46, 'building-j', [10.5, 8.5], 0, 5, plum),
  // Large pad under the whole L; courtyard parking is nested in AdminZone (not a separate pad)
  zone('admin-block', 'Admin Block', FENCE_U + 0.14, 0.72, 'admin-block', [20, 17], Math.PI / 2, 3.4),

  // Faculty row just BELOW campus-top (v=0.14): Physical → Social → Life (toward ext-eng)
  zone('physical-science', 'Physical Science', FENCE_U + 0.3, 0.24, 'building-h', [10, 8], 0, 4.9, original),
  zone('social-science', 'Social Science', 0.76, 0.21, 'building-g', [10, 8], 0, 4.9, sand),
  zone('life-science', 'Life Science', 0.835, 0.21, 'building-f', [10, 8], 0, 4.9, original),
  zone('law-campus', 'Law', FENCE_U + 0.3, 0.38, 'building-l', [10, 8], 0, 5, original),
  zone('students-centre', "Students' Centre", 0.7289, 0.4859, 'building-k', [10.5, 8.5], -1.5816, 5.75, lilac),
  zone('cordelia-hall', 'Cordelia Agbebaku Hall', 0.6929, 0.743, 'building-m', [11.5, 8.5], -0.0016, 5.1, clay),
  zone('twin-hall', 'Twin Hall', 0.8056, 0.7623, 'building-n', [11.5, 8.5], -0.0092, 5.355, purple),

  // School hostels removed from the map (gameplay places kept in places.ts for lodging).
  zone('law-ext', 'Law', 0.6, 0.28, 'building-l', [10.5, 8.5], 0, 5.1, sand),
  // Pulled west off ext-eng (u=0.92) into the campus lawn
  zone('management-science', 'Management Science', 0.84, 0.34, 'building-m', [11.5, 9], 0, 5.2, original),
  // Story building (not the skyscraper — that mesh moved to ICT)
  zone('engineering', 'Engineering', 0.84, 0.58, 'building-m', [12, 9.5], 0, 5.2, purple),
  // Annotated red square — Twin Hall ↔ Engineering strip, enlarged to fill the lawn
  zone('parking-ext', 'Parking Lot', 0.72, 0.52, 'parking-lot', [36, 30], 0),
  // Bottom-right: north of bottom-main (v=0.93), east of ext-eng — not sitting in the lane
  zone('shuttle-park', 'Shuttle Park', 0.975, 0.84, 'parking-lot', [16, 14], 0),

  // Near gate / campus edge — same height band as faculty blocks
  zone('keke-park', 'Keke Park', FENCE_U + 0.07, 0.74, 'building-g', [10, 8], 0, 4.9, sand),

  // —— Billboards (the five marked spots). Ad face turns toward the default camera at rotation 0;
  // tapping one opens the ad viewer. Fine-tune in the zone debug panel.
  zone('billboard-1', 'Billboard 1', 0.155, 0.4985, 'billboard-pack', [7, 3], 0, undefined, undefined, { modelY: 0.5, scaleMul: 1.8 }),
  zone('billboard-2', 'Billboard 2', 0.3983, 0.4139, 'billboard1', [7, 3], -3.1416, undefined, undefined, { modelY: 0.5, scaleMul: 1.8 }),
  zone('billboard-3', 'Billboard 3', 0.605, 0.6468, 'billboard-pack', [7, 3], -3.1416, undefined, undefined, { modelY: 0, scaleMul: 1.9 }),
  zone('billboard-4', 'Billboard 4', 0.145, 0.83, 'billboard1', [7, 3], -3.1416, undefined, undefined, { modelY: 0, scaleMul: 1.9 }),
  zone('billboard-5', 'Billboard 5', 0.8768, 0.875, 'billboard-pack', [7, 3], 0, undefined, undefined, { modelY: 0, scaleMul: 2.3 }),
]

/** Second-slab zone. `model` is the main Kenney key (or 'cluster' / 'open' / 'label'). */
function southZone(
  id: string,
  label: string,
  u: number,
  v: number,
  model: string,
  footprint: [number, number],
  opts: Pick<MapZone, 'rotation' | 'scale' | 'tint' | 'parts' | 'open'> = {},
): MapZone {
  const [x, z] = frontSlabXZ(u, v)
  const { rotation = 0, ...rest } = opts
  return { id, label, position: [x, z], rotation, model, footprint, slab: 'south', ...rest }
}

/**
 * Second slab (south of the AAU slab), from the annotated sketch — left→right, top→bottom.
 * Same Kenney models / scale band / tints as the first slab. Open zones have no building.
 */
const SOUTH_ZONES: MapZone[] = [
  // —— TOP ROW ——
  southZone('market-square', 'Market Square', 0.06, 0.25, 'cluster', [10, 18], {
    parts: [
      { model: 'building-b', dx: 0, dz: -4.6, tint: clay },
      { model: 'building-e', dx: 0, dz: 4.6, tint: sand, rotation: Math.PI },
    ],
  }),
  southZone('dubious', 'Dubious', 0.17, 0.2, 'open', [14, 10], { open: 'plot' }),
  southZone('innovation-hub', 'Innovation Hub', 0.29, 0.2, 'building-l', [10, 8], { scale: 4.9, tint: lilac }),
  // Mechanic: small workshop + a stretch of the parking-lot model (it has cars) as the yard
  southZone('magmus-autos', 'Magmus Autos', 0.41, 0.14, 'cluster', [14, 8], {
    parts: [
      { model: 'building-a', dx: -3.2, dz: 0, scale: 4.3, tint: earth },
      { model: 'parking-lot', dx: 4, dz: 0, size: [6, 6.5], noPad: true },
    ],
  }),
  // No Kenney church exists — two plain buildings, the taller one wears a cross
  southZone('above-the-hills-church', 'Above the Hills Church', 0.41, 0.33, 'cluster', [16, 9], {
    parts: [
      { model: 'building-c', dx: -3.6, dz: 0, tint: original, cross: true },
      { model: 'building-d', dx: 3.8, dz: 0, scale: 4.3, tint: sand },
    ],
  }),
  // Landmark name on the slab (no road drawn)
  southZone('poultry-road', 'Poultry Road', 0.73, 0.27, 'label', [1, 1]),
  // Restaurant with parasols out front
  southZone('wise-gourmet', 'Wise Gourmet', 0.9, 0.14, 'cluster', [12, 9], {
    parts: [
      { model: 'building-f', dx: 0, dz: -1.2, tint: sand },
      { model: 'detail-parasol-a', dx: -3, dz: 4, scale: 2.6, noPad: true },
      { model: 'detail-parasol-b', dx: 2.6, dz: 4, scale: 2.6, noPad: true },
    ],
  }),

  // —— MIDDLE ROW ——
  southZone('park', 'Park', 0.06, 0.58, 'open', [12, 14], { open: 'park' }),
  southZone('shop-mid-1', 'Shop', 0.16, 0.5, 'building-b', [9, 7], { scale: 4.3, tint: purple }),
  southZone('shop-mid-2', 'Shop', 0.24, 0.5, 'building-e', [9, 7], { scale: 4.3, tint: earth }),
  southZone('forbes', 'Forbes', 0.45, 0.55, 'open', [30, 16], { open: 'plaza' }),
  // Tall blue glass towers (Kenney skyscrapers, untinted)
  southZone('spot-rite', 'Spot Rite', 0.9, 0.52, 'cluster', [22, 10], {
    parts: [
      { model: 'building-skyscraper-c', dx: -6.5, dz: 0, scale: 4.8 },
      { model: 'building-skyscraper-a', dx: 0, dz: 0, scale: 5.6 },
      { model: 'building-skyscraper-e', dx: 6.5, dz: 0, scale: 4.8 },
    ],
  }),

  // —— BOTTOM ROW ——
  southZone('shop-low-1', 'Shop', 0.06, 0.82, 'building-c', [9, 7], { scale: 4.3, tint: sand }),
  southZone('shop-low-2', 'Shop', 0.13, 0.82, 'building-d', [9, 7], { scale: 4.3, tint: clay }),
  southZone('shop-low-3', 'Shop', 0.2, 0.82, 'building-h', [9, 7], { scale: 4.3, tint: original }),
  southZone('anonymous-zone', 'Anonymous Zone', 0.42, 0.8, 'open', [16, 10], { open: 'plot' }),
  southZone('denco', 'Denco', 0.56, 0.8, 'cluster', [20, 9], {
    parts: [
      { model: 'building-g', dx: -5, dz: 0, tint: plum },
      { model: 'building-i', dx: 5, dz: 0, tint: original },
    ],
  }),
  southZone('playchill-climax', 'Playchill Climax', 0.72, 0.66, 'cluster', [26, 9], {
    parts: [
      { model: 'building-j', dx: -8.5, dz: 0, tint: purple },
      { model: 'building-k', dx: 0, dz: 0, tint: lilac },
      { model: 'building-n', dx: 8.5, dz: 0, tint: original },
    ],
  }),
]

export const MAP_ZONES: MapZone[] = [...FIRST_ZONES, ...SOUTH_ZONES]

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

/**
 * Calm pine pairs on the first slab only (12 pines = 6 pairs).
 * Never on roads, pads, lots, or building footprints.
 */
export const TREE_SPOTS: TreeSpot[] = (() => {
  const spots: TreeSpot[] = []
  const rand = mulberry32(7701)

  /** Two pines at a UV centre, slightly offset, scale 0.9–1.1. */
  const pair = (u: number, v: number, du = 0.012, dv = 0.008) => {
    for (const [uu, vv] of [
      [u - du, v - dv],
      [u + du, v + dv],
    ] as const) {
      const [x, z] = firstSlabXZ(uu, vv)
      spots.push({
        x,
        z,
        s: 0.9 + rand() * 0.2,
        kind: 'pine',
        rot: rand() * Math.PI * 2,
      })
    }
  }

  // b. Beside the Clinic
  pair(FENCE_U + 0.12, 0.2)
  // c. Between Sports Complex and the fence
  pair(FENCE_U + 0.04, 0.56)
  // d. In front of Admin Block, by the road
  pair(FENCE_U + 0.22, 0.78)
  // e. Grass corner by Management Science
  pair(0.94, 0.36)
  // f. Beside Shuttle Park, between lot and slab edge
  pair(0.995, 0.86)

  // Second-slab parks: a loose ring of shade trees inside the plot (benches sit in the middle)
  for (const zone of SOUTH_ZONES) {
    if (zone.open !== 'park') continue
    const [w, d] = zone.footprint
    for (const [fx, fz] of [
      [-0.32, -0.36],
      [0.3, -0.3],
      [-0.3, 0.34],
      [0.34, 0.3],
      [0, -0.42],
    ] as const) {
      spots.push({
        x: zone.position[0] + fx * w,
        z: zone.position[1] + fz * d,
        s: 0.85 + rand() * 0.3,
        kind: 'tree',
        rot: rand() * Math.PI * 2,
      })
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
