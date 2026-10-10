import { LOCATIONS } from './content'

export type Rect = { x: number; z: number; w: number; d: number }
export type Land = Rect & { name: string; shade?: 'dark'; empty?: boolean }

export const WATER_LEVEL = -0.35

export const LANDS: Land[] = [
  { name: 'mainland', x: -4, z: 0, w: 92, d: 78 },
  { name: 'medicine', x: -66, z: -12, w: 30, d: 38, shade: 'dark' },
  { name: 'front', x: 2, z: 56, w: 64, d: 26, shade: 'dark', empty: true },
]

export const LAND_CENTER = { x: -10, z: 12 }

const CHANNELS: Rect[] = [
  { x: -50.5, z: -10, w: 1.6, d: 32 },
  { x: 0, z: 41, w: 70, d: 3.6 },
]

export const ROADS: Rect[] = [
  { x: -4, z: 4, w: 78, d: 2.6 },
  { x: 8, z: 2, w: 3.2, d: 68 },
  { x: -8, z: -1, w: 2.4, d: 10 },
  { x: -52, z: -8, w: 14, d: 2.4 },
  { x: 4, z: 40, w: 3, d: 10 },
]

export const CAMPUS_ZONE: Rect = { x: -8, z: -16, w: 44, d: 28 }
export const MED_ZONE: Rect = { x: -66, z: -12, w: 16, d: 18 }

function intersect(a: Rect, b: Rect): Rect | null {
  const left = Math.max(a.x - a.w / 2, b.x - b.w / 2)
  const right = Math.min(a.x + a.w / 2, b.x + b.w / 2)
  const back = Math.max(a.z - a.d / 2, b.z - b.d / 2)
  const front = Math.min(a.z + a.d / 2, b.z + b.d / 2)
  if (right <= left || front <= back) return null
  return { x: (left + right) / 2, z: (back + front) / 2, w: right - left, d: front - back }
}

export type Bridge = Rect & { alongX: boolean }

export const BRIDGES: Bridge[] = ROADS.flatMap((road) =>
  CHANNELS.flatMap((channel) => {
    const span = intersect(road, channel)
    return span ? [{ ...span, alongX: road.w > road.d }] : []
  }),
)

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
export type Tree = { x: number; z: number; s: number; tone: number; palm: boolean }
export type RockSpot = { x: number; y: number; z: number; s: number }

const WALLS = ['#ffffff', '#fff1c1', '#ffd3c4', '#c9ecff', '#d4f5cf', '#e9dcff', '#ffd9ea', '#fde2a8']
const ACCENTS = ['#ff6b4a', '#2f80ed', '#f2b705', '#9b51e0', '#1fb978', '#eb5757', '#00b8a9', '#ff8fab']

function pickStyle(roll: number): HouseStyle {
  if (roll < 0.16) return 'tower'
  if (roll < 0.42) return 'duplex'
  if (roll < 0.62) return 'villa'
  return 'block'
}

export function generateTown() {
  const rand = mulberry32(2026)
  const rockRand = mulberry32(4242)
  const houses: House[] = []
  const trees: Tree[] = []
  const rocks: RockSpot[] = []

  const onEmptyLand = (x: number, z: number) => LANDS.some((land) => land.empty && inRect(x, z, land, -1))

  for (let x = -84; x <= 48; x += 4.4) {
    for (let z = -44; z <= 72; z += 4.4) {
      const jx = x + (rand() - 0.5) * 1.4
      const jz = z + (rand() - 0.5) * 1.4
      const roll = rand()
      const styleRoll = rand()
      if (!onLand(jx, jz, 1.6)) continue
      if (onEmptyLand(jx, jz)) {
        if (roll < 0.22) trees.push({ x: jx, z: jz, s: 0.7 + rand() * 0.5, tone: rand(), palm: rand() < 0.3 })
        continue
      }
      if (onRoad(jx, jz, 1.8) || nearLandmark(jx, jz, 2.2)) {
        if (!onRoad(jx, jz, 0.9) && !nearLandmark(jx, jz, 0.8) && roll < 0.3) {
          trees.push({ x: jx, z: jz, s: 0.6 + rand() * 0.4, tone: rand(), palm: rand() < 0.4 })
        }
        continue
      }
      if (inRect(jx, jz, CAMPUS_ZONE, -1) || inRect(jx, jz, MED_ZONE, -1)) {
        if (roll < 0.4) trees.push({ x: jx, z: jz, s: 0.8 + rand() * 0.5, tone: rand(), palm: rand() < 0.3 })
        continue
      }
      if (roll < 0.4) {
        const style = pickStyle(styleRoll)
        const tall = style === 'tower'
        houses.push({
          x: jx,
          z: jz,
          w: tall ? 1.8 + rand() * 0.6 : 2.1 + rand() * 0.9,
          d: tall ? 1.8 + rand() * 0.6 : 2 + rand() * 0.8,
          h: tall ? 3.2 + rand() * 2 : 1.1 + rand() * 0.9,
          style,
          wall: WALLS[Math.floor(rand() * WALLS.length)]!,
          accent: ACCENTS[Math.floor(rand() * ACCENTS.length)]!,
          rot: rand() < 0.5 ? 0 : Math.PI / 2,
        })
      } else if (roll < 0.66) {
        trees.push({ x: jx, z: jz, s: 0.7 + rand() * 0.5, tone: rand(), palm: rand() < 0.35 })
      } else if (roll < 0.9) {
        const count = 2 + Math.floor(rockRand() * 2)
        for (let i = 0; i < count; i++) {
          const s = i === 0 ? 0.65 + rockRand() * 0.35 : 0.35 + rockRand() * 0.3
          rocks.push({ x: jx + (rockRand() - 0.5) * 1.6, y: 0, z: jz + (rockRand() - 0.5) * 1.6, s })
        }
      }
    }
  }
  return { houses, trees, rocks }
}
