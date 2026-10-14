import type { BodyId, OutfitId } from '@/lib/game/look'

export type OutfitColors = {
  top: string
  bottom: string
}

export const OUTFIT_COLORS: Partial<Record<OutfitId, OutfitColors>> = {
  office: {
    top: '#12151F',
    bottom: '#12151F',
  },
  corporate: {
    top: '#F3F0E6',
    bottom: '#12151F',
  },
}

export function outfitColorsFor(_body: BodyId, outfit: OutfitId): OutfitColors | null {
  return OUTFIT_COLORS[outfit] ?? null
}
