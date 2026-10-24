export type BodyId = 'woman' | 'man'
export type HairId =
  | 'lowcut'
  | 'bald'
  | 'curls'
  | 'afro'
  | 'locs'
  | 'braids'
  | 'classic'
  | 'bun'
  | 'ponytail'
  | 'long'
  | 'gele'
export type OutfitId = 'casual' | 'office' | 'corporate' | 'hoodie' | 'chiller' | 'sitework' | 'owambe'

export type Appearance = {
  body: BodyId
  hair: HairId
  outfit: OutfitId
  skin: string
  hairColor: string
  topColor: string
  bottomColor: string
}

export const SKIN_TONES = [
  '#C68642',
  '#A56C3A',
  '#8D4E2A',
  '#6B3F28',
  '#5C3317',
  '#3E2414',
  '#2A160C',
] as const

export const HAIR_COLORS = [
  '#0D0D0D',
  '#2C1810',
  '#4A2C14',
  '#8B5A2B',
  '#A66D3A',
  '#D4B483',
  '#6B3FA0',
] as const

export const CLOTH_COLORS = [
  '#2B7FFF',
  '#22A85A',
  '#E23D3D',
  '#F08A2A',
  '#8B5CFF',
  '#E85D9A',
  '#1DB8A6',
  '#12151F',
  '#F3F0E6',
  '#C9A227',
] as const

export const SKIN = SKIN_TONES[3]
export const HAIR_COLOR = HAIR_COLORS[0]
export const SHOE_COLOR = '#8B1E1E'

export const DEFAULT_APPEARANCE: Appearance = {
  body: 'woman',
  hair: 'braids',
  outfit: 'casual',
  skin: SKIN,
  hairColor: HAIR_COLORS[3],
  topColor: CLOTH_COLORS[3],
  bottomColor: CLOTH_COLORS[7],
}

const FABRIC_COLORS: Record<string, { top: string; bottom: string }> = {
  'ankara-rose': { top: '#E85D9A', bottom: '#F3F0E6' },
  'ankara-gold': { top: '#C9A227', bottom: '#F3F0E6' },
  'ankara-sky': { top: '#2B7FFF', bottom: '#F3F0E6' },
  'plain-cream': { top: '#F3F0E6', bottom: '#F3F0E6' },
  'plain-navy': { top: '#12151F', bottom: '#12151F' },
}

export const BODIES: { id: BodyId; label: string }[] = [
  { id: 'woman', label: 'Woman' },
  { id: 'man', label: 'Man' },
]

export const HAIR_BY_BODY: Record<BodyId, { id: HairId; label: string }[]> = {
  man: [
    { id: 'lowcut', label: 'Low cut' },
    { id: 'bald', label: 'Bald' },
    { id: 'curls', label: 'Curls' },
    { id: 'afro', label: 'Afro' },
    { id: 'locs', label: 'Locs' },
    { id: 'braids', label: 'Braids' },
    { id: 'classic', label: 'Classic' },
  ],
  woman: [
    { id: 'braids', label: 'Braids' },
    { id: 'afro', label: 'Afro' },
    { id: 'bun', label: 'Bun' },
    { id: 'ponytail', label: 'Ponytail' },
    { id: 'long', label: 'Long' },
    { id: 'locs', label: 'Locs' },
    { id: 'lowcut', label: 'Low cut' },
    { id: 'classic', label: 'Classic' },
  ],
}

const OUTFITS: { id: OutfitId; label: string }[] = [
  { id: 'casual', label: 'Casual' },
  { id: 'office', label: 'Office' },
  { id: 'corporate', label: 'Corporate' },
]

export const OUTFIT_BY_BODY: Record<BodyId, { id: OutfitId; label: string }[]> = {
  man: OUTFITS,
  woman: OUTFITS,
}

function normalizeHex(value: string | undefined, fallback: string) {
  if (!value) return fallback
  const hex = value.trim()
  if (/^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return hex.toUpperCase()
  return fallback
}

export function normalizeAppearance(input?: Partial<Appearance> & { fabric?: string } | null): Appearance {
  const body = input?.body === 'man' ? 'man' : 'woman'
  const hairOptions = HAIR_BY_BODY[body]
  const outfitOptions = OUTFIT_BY_BODY[body]
  const hair = hairOptions.some((item) => item.id === input?.hair) ? input!.hair! : hairOptions[0]!.id
  const outfit = outfitOptions.some((item) => item.id === input?.outfit) ? input!.outfit! : outfitOptions[0]!.id
  const fromFabric = input?.fabric ? FABRIC_COLORS[input.fabric] : undefined
  return {
    body,
    hair,
    outfit,
    skin: normalizeHex(input?.skin, DEFAULT_APPEARANCE.skin),
    hairColor: normalizeHex(input?.hairColor, DEFAULT_APPEARANCE.hairColor),
    topColor: normalizeHex(input?.topColor, fromFabric?.top ?? DEFAULT_APPEARANCE.topColor),
    bottomColor: normalizeHex(input?.bottomColor, fromFabric?.bottom ?? DEFAULT_APPEARANCE.bottomColor),
  }
}

/**
 * How characters are imported
 *
 * 1. Drop body GLBs in `public/models/` as male.glb and female.glb.
 *    Hair GLBs go in `public/models/hair/` and are listed in hair-config.ts.
 * 2. `useGLTF` from `@react-three/drei` loads them (see CharacterFigure).
 * 3. If a file is missing, the built-in low-poly figure is used instead.
 *
 * Good free sources: Quaternius Ultimate Modular packs (CC0) from
 * quaternius.com or poly.pizza. Keep our own outfits/hair so the look
 * stays Ekpoma, not a copy of another game.
 */
export const CHARACTER_GLB: Record<BodyId, string> = {
  man: '/models/male-rigged.glb',
  woman: '/models/female-rigged.glb',
}

export { HAIR_CONFIG, hairFitFor } from '@/lib/game/hair-config'
export { OUTFIT_COLORS, outfitColorsFor } from '@/lib/game/outfit-config'
