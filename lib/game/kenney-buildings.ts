import { LOCATIONS } from './content'
import { FRONT_SLAB, inRect, mulberry32, type Rect } from './world-layout'

export type KenneyPlacement = {
  id: string
  model: string
  x: number
  z: number
  rot: number
  scale: number
}

const DETAIL = [
  'building-a',
  'building-b',
  'building-c',
  'building-d',
  'building-e',
  'building-f',
  'building-g',
  'building-h',
  'building-i',
  'building-j',
  'building-k',
  'building-l',
  'building-m',
  'building-n',
] as const

const SKYS = [
  'building-skyscraper-a',
  'building-skyscraper-b',
  'building-skyscraper-c',
  'building-skyscraper-d',
  'building-skyscraper-e',
] as const

const LOW = [
  'low-detail-building-a',
  'low-detail-building-b',
  'low-detail-building-c',
  'low-detail-building-d',
  'low-detail-building-e',
  'low-detail-building-f',
  'low-detail-building-g',
  'low-detail-building-h',
  'low-detail-building-i',
  'low-detail-building-j',
  'low-detail-building-k',
  'low-detail-building-l',
  'low-detail-building-m',
  'low-detail-building-n',
  'low-detail-building-wide-a',
  'low-detail-building-wide-b',
] as const

export const kenneyUrl = (name: string) => `/models/kenney/${name}.glb`

const nearLandmark = (x: number, z: number, pad: number) =>
  LOCATIONS.some(
    ({ position, size }) =>
      Math.abs(x - position[0]) < size[0] / 2 + pad && Math.abs(z - position[1]) < size[2] / 2 + pad,
  )

function scatterSlab(
  slab: Rect,
  rand: () => number,
  models: readonly string[],
  opts: { step: number; chance: number; scale: [number, number]; pad: number; prefix: string },
): KenneyPlacement[] {
  const out: KenneyPlacement[] = []
  const minX = slab.x - slab.w / 2 + opts.pad
  const maxX = slab.x + slab.w / 2 - opts.pad
  const minZ = slab.z - slab.d / 2 + opts.pad
  const maxZ = slab.z + slab.d / 2 - opts.pad

  for (let x = minX; x <= maxX; x += opts.step) {
    for (let z = minZ; z <= maxZ; z += opts.step) {
      if (rand() > opts.chance) continue
      if (nearLandmark(x, z, 5.5)) continue
      if (!inRect(x, z, slab, -opts.pad)) continue
      const model = models[Math.floor(rand() * models.length)]!
      const jitterX = (rand() - 0.5) * opts.step * 0.35
      const jitterZ = (rand() - 0.5) * opts.step * 0.35
      const px = x + jitterX
      const pz = z + jitterZ
      if (nearLandmark(px, pz, 5)) continue
      out.push({
        id: `${opts.prefix}-${out.length}`,
        model,
        x: px,
        z: pz,
        rot: (Math.floor(rand() * 4) * Math.PI) / 2,
        scale: opts.scale[0] + rand() * (opts.scale[1] - opts.scale[0]),
      })
    }
  }
  return out
}

/** Kenney scatter only on the south slab — north is laid out via MAP_ZONES. */
export function generateKenneyTown(lowDetail = false): KenneyPlacement[] {
  const rand = mulberry32(lowDetail ? 4040 : 3030)
  const models = lowDetail ? LOW : DETAIL
  const south = scatterSlab(FRONT_SLAB, rand, models, {
    step: lowDetail ? 14 : 11,
    chance: lowDetail ? 0.42 : 0.52,
    scale: lowDetail ? [2.3, 3.1] : [2.5, 3.5],
    pad: 6,
    prefix: 's',
  })

  const skyModels = lowDetail ? LOW.slice(0, 5) : SKYS
  const skyline: KenneyPlacement[] = []
  const skySpots = [{ x: FRONT_SLAB.x + FRONT_SLAB.w * 0.32, z: FRONT_SLAB.z + FRONT_SLAB.d * 0.2 }]
  skySpots.forEach((spot, i) => {
    if (nearLandmark(spot.x, spot.z, 7)) return
    skyline.push({
      id: `sky-${i}`,
      model: skyModels[i % skyModels.length]!,
      x: spot.x,
      z: spot.z,
      rot: (i % 4) * (Math.PI / 2),
      scale: lowDetail ? 3.2 : 3.8,
    })
  })

  return [...south, ...skyline]
}

export const KENNEY_PRELOAD = [
  ...DETAIL.map(kenneyUrl),
  ...SKYS.map(kenneyUrl),
  ...LOW.map(kenneyUrl),
]
