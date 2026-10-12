import type { BodyId, HairId } from '@/lib/game/look'

export type HairFit = {
  file: string
  scale: number
  offset: [number, number, number]
  rotation: [number, number, number]
  paint?: boolean
}

export const DEFAULT_HAIR_FIT: Omit<HairFit, 'file'> = {
  scale: 1,
  offset: [0, 0, 0],
  rotation: [0, 0, 0],
}

export const HAIR_CONFIG: Record<BodyId, Partial<Record<HairId, HairFit>>> = {
  woman: {
    braids: {
      file: '/models/hair/braids.glb',
      scale: 0.95,
      offset: [-0.005, -0.04, -0.055],
      rotation: [(2 * Math.PI) / 180, 0, (-1 * Math.PI) / 180],
    },
    afro: {
      file: '/models/hair/afro.glb',
      scale: 1.11,
      offset: [0, -0.005, -0.025],
      rotation: [0, 0, Math.PI],
    },
    bun: {
      file: '/models/hair/bun.glb',
      scale: 0.88,
      offset: [0, -0.015, 0],
      rotation: [0, 0, 0],
      paint: true,
    },
    classic: {
      file: '/models/hair/classic.glb',
      scale: 0.94,
      offset: [0, -0.045, -0.005],
      rotation: [0, 0, 0],
      paint: true,
    },
  },
  man: {
    braids: {
      file: '/models/hair/braids.glb',
      scale: 1.4,
      offset: [0, -0.01, -0.02],
      rotation: [0, Math.PI, 0],
    },
    afro: {
      file: '/models/hair/afro.glb',
      scale: 1.22,
      offset: [0, -0.03, -0.01],
      rotation: [0, 0, 0],
    },
  },
}

export function hairFitFor(body: BodyId, hair: HairId): HairFit | null {
  return HAIR_CONFIG[body][hair] ?? null
}

export function formatHairFit(fit: HairFit): string {
  const round = (n: number) => Number(n.toFixed(4))
  return JSON.stringify(
    {
      file: fit.file,
      scale: round(fit.scale),
      offset: fit.offset.map(round),
      rotation: fit.rotation.map(round),
    },
    null,
    2,
  )
}
