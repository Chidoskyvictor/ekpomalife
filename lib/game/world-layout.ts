import { LOCATIONS } from './content'

export type Rect = { x: number; z: number; w: number; d: number }

export const ROADS: Rect[] = [
  { x: 0, z: 0, w: 96, d: 4 },
  { x: 10, z: 0, w: 3.6, d: 72 },
  { x: -8, z: -15, w: 2.6, d: 30 },
  { x: -2, z: 17, w: 70, d: 2.6 },
  { x: -24, z: -6, w: 2.4, d: 12 },
]

export const CAMPUS_ZONE: Rect = { x: -12, z: -18, w: 40, d: 26 }
export const MED_ZONE: Rect = { x: 22, z: -20, w: 16, d: 14 }

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

const inRect = (x: number, z: number, rect: Rect, pad = 0) =>
  Math.abs(x - rect.x) < rect.w / 2 + pad && Math.abs(z - rect.z) < rect.d / 2 + pad

const nearLandmark = (x: number, z: number, pad: number) =>
  LOCATIONS.some(({ position, size }) => Math.abs(x - position[0]) < size[0] / 2 + pad && Math.abs(z - position[1]) < size[2] / 2 + pad)

const onRoad = (x: number, z: number, pad: number) => ROADS.some((road) => inRect(x, z, road, pad))

export type House = { x: number; z: number; w: number; d: number; h: number; wall: string; roof: string; rot: number }
export type Tree = { x: number; z: number; s: number; tone: number }

const WALLS = ['#f3ead8', '#efe2cc', '#f6f1e6', '#e9dcc6', '#f1e6e0', '#e6ece4']
const ROOFS = ['#a9b1b5', '#b5654a', '#8e979c', '#c27a52', '#7f8f87', '#a35a45']

export function generateTown() {
  const rand = mulberry32(2026)
  const houses: House[] = []
  const trees: Tree[] = []

  for (let x = -44; x <= 44; x += 4.6) {
    for (let z = -36; z <= 36; z += 4.6) {
      const jx = x + (rand() - 0.5) * 1.6
      const jz = z + (rand() - 0.5) * 1.6
      const roll = rand()
      if (onRoad(jx, jz, 1.6) || nearLandmark(jx, jz, 2.2)) {
        if (!onRoad(jx, jz, 0.8) && !nearLandmark(jx, jz, 0.6) && roll < 0.25) {
          trees.push({ x: jx, z: jz, s: 0.6 + rand() * 0.5, tone: rand() })
        }
        continue
      }
      const inCampus = inRect(jx, jz, CAMPUS_ZONE, -1) || inRect(jx, jz, MED_ZONE, -1)
      if (inCampus) {
        if (roll < 0.45) trees.push({ x: jx, z: jz, s: 0.8 + rand() * 0.6, tone: rand() })
        continue
      }
      if (roll < 0.62) {
        houses.push({
          x: jx,
          z: jz,
          w: 2 + rand() * 1.4,
          d: 2 + rand() * 1.2,
          h: 1 + rand() * 1.1,
          wall: WALLS[Math.floor(rand() * WALLS.length)]!,
          roof: ROOFS[Math.floor(rand() * ROOFS.length)]!,
          rot: rand() < 0.5 ? 0 : Math.PI / 2,
        })
      } else if (roll < 0.9) {
        trees.push({ x: jx, z: jz, s: 0.7 + rand() * 0.7, tone: rand() })
      }
    }
  }
  return { houses, trees }
}
