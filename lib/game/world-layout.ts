import { LOCATIONS } from './content'
import { HOUSE_ROOFS, HOUSE_WALLS } from './map-theme'

export type Rect = { x: number; z: number; w: number; d: number }
export type Land = Rect & { name: string; shade?: 'light'; empty?: boolean }

export type Slab = Rect & { name: string; h: number; radius: number }

const SLAB = { w: 36, d: 26, h: 0.42, radius: 2.1 }
const SLAB_GAP = 5

export const CAMPUS_SLAB: Slab = { name: 'campus', x: -10, z: -18, ...SLAB }
export const FRONT_SLAB: Slab = { name: 'front', x: CAMPUS_SLAB.x, z: CAMPUS_SLAB.z + SLAB.d + SLAB_GAP, ...SLAB }
export const LEFT_SLAB: Slab = {
  name: 'left',
  x: CAMPUS_SLAB.x - SLAB.w - SLAB_GAP,
  z: (CAMPUS_SLAB.z + FRONT_SLAB.z) / 2,
  w: SLAB.w,
  d: SLAB.d * 2 + SLAB_GAP,
  h: SLAB.h,
  radius: SLAB.radius,
}
export const SCHOOL_SLAB: Slab = {
  name: 'school',
  x: (LEFT_SLAB.x + CAMPUS_SLAB.x) / 2,
  z: FRONT_SLAB.z + SLAB.d / 2 + SLAB_GAP + (SLAB.d * 2) / 2,
  w: SLAB.w * 2 + SLAB_GAP,
  d: SLAB.d * 2,
  h: SLAB.h,
  radius: 2.6,
}
export const SLABS: Slab[] = [CAMPUS_SLAB, LEFT_SLAB, FRONT_SLAB, SCHOOL_SLAB]

export const WORLD: Rect = { x: SCHOOL_SLAB.x, z: 20, w: 140, d: 150 }

export const LANDS: Land[] = SLABS.map(({ name, x, z, w, d }) => ({ name, x, z, w, d }))

export const LAND_CENTER = { x: SCHOOL_SLAB.x, z: 20 }

export const ROADS: Rect[] = []

export const CAMPUS_ZONE: Rect = { x: CAMPUS_SLAB.x, z: CAMPUS_SLAB.z, w: CAMPUS_SLAB.w, d: CAMPUS_SLAB.d }
export const MED_ZONE: Rect = { x: 0, z: 0, w: 0, d: 0 }

export const MAP_LOCATION_IDS = ['aau_campus'] as const
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

export const onLand = (x: number, z: number, pad = 0) => LANDS.some((land) => inRect(x, z, land, -pad))

const nearLandmark = (x: number, z: number, pad: number) =>
  LOCATIONS.some(({ position, size }) => Math.abs(x - position[0]) < size[0] / 2 + pad && Math.abs(z - position[1]) < size[2] / 2 + pad)

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
