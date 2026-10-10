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
export type OutfitId = 'casual' | 'hoodie' | 'office' | 'chiller' | 'sitework' | 'owambe'
export type FabricId = 'ankara-rose' | 'ankara-gold' | 'ankara-sky' | 'plain-cream' | 'plain-navy'

export type Appearance = {
  body: BodyId
  hair: HairId
  outfit: OutfitId
  fabric: FabricId
}

export const DEFAULT_APPEARANCE: Appearance = {
  body: 'man',
  hair: 'lowcut',
  outfit: 'casual',
  fabric: 'ankara-rose',
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
    { id: 'gele', label: 'Gele' },
    { id: 'classic', label: 'Classic' },
  ],
}

export const OUTFIT_BY_BODY: Record<BodyId, { id: OutfitId; label: string }[]> = {
  man: [
    { id: 'casual', label: 'Casual' },
    { id: 'hoodie', label: 'Hoodie' },
    { id: 'office', label: 'Office' },
    { id: 'chiller', label: 'Chiller' },
    { id: 'sitework', label: 'Site work' },
  ],
  woman: [
    { id: 'casual', label: 'Casual' },
    { id: 'office', label: 'Office' },
    { id: 'owambe', label: 'Owambe' },
  ],
}

export const FABRICS: { id: FabricId; label: string; a: string; b: string }[] = [
  { id: 'ankara-rose', label: 'Ankara rose', a: '#E8A0B8', b: '#F4D7E2' },
  { id: 'ankara-gold', label: 'Ankara gold', a: '#E6C35A', b: '#F6E7B0' },
  { id: 'ankara-sky', label: 'Ankara sky', a: '#5BA3D9', b: '#D6EAF8' },
  { id: 'plain-cream', label: 'Plain cream', a: '#F0EEE5', b: '#F0EEE5' },
  { id: 'plain-navy', label: 'Plain navy', a: '#1E3A5F', b: '#1E3A5F' },
]

export const SKIN = '#6B3F28'
export const HAIR_COLOR = '#1A1410'
export const SHOE_COLOR = '#8B1E1E'

export function fabricSwatch(id: FabricId) {
  return FABRICS.find((fabric) => fabric.id === id) ?? FABRICS[0]!
}

export function normalizeAppearance(input?: Partial<Appearance> | null): Appearance {
  const body = input?.body === 'woman' ? 'woman' : 'man'
  const hairOptions = HAIR_BY_BODY[body]
  const outfitOptions = OUTFIT_BY_BODY[body]
  const hair = hairOptions.some((item) => item.id === input?.hair) ? input!.hair! : hairOptions[0]!.id
  const outfit = outfitOptions.some((item) => item.id === input?.outfit) ? input!.outfit! : outfitOptions[0]!.id
  const fabric = FABRICS.some((item) => item.id === input?.fabric) ? input!.fabric! : DEFAULT_APPEARANCE.fabric
  return { body, hair, outfit, fabric }
}

/**
 * How characters are imported
 *
 * 1. Drop CC0 GLBs in `public/models/characters/` using these names:
 *    man.glb, woman.glb
 * 2. `useGLTF` from `@react-three/drei` loads them (see CharacterFigure).
 * 3. If a file is missing, the built-in low-poly figure is used instead.
 *
 * Good free sources: Quaternius Ultimate Modular packs (CC0) from
 * quaternius.com or poly.pizza. Keep our own outfits/hair so the look
 * stays Ekpoma, not a copy of another game.
 */
export const CHARACTER_GLB: Record<BodyId, string> = {
  man: '/models/characters/man.glb',
  woman: '/models/characters/woman.glb',
}
