export type TraitId = 'tech' | 'night-classer' | 'foodie' | 'leader'

export type Trait = {
  id: TraitId
  sticker: string
  label: string
  description: string
}

export const TRAIT_LIMIT = 2

export const TRAITS: Trait[] = [
  {
    id: 'tech',
    sticker: '/stickers/laptop.png',
    label: 'Tech bro or sis',
    description: 'Has three startup ideas before breakfast. Coding grows faster.',
  },
  {
    id: 'night-classer',
    sticker: '/stickers/moon.png',
    label: 'Night classer',
    description: 'Reads until the sun comes up. Study grows faster.',
  },
  {
    id: 'foodie',
    sticker: '/stickers/food.png',
    label: 'Foodie',
    description: 'Has a snack in every bag. Hunger drops slower.',
  },
  {
    id: 'leader',
    sticker: '/stickers/ballot.png',
    label: 'Leader',
    description: 'Speaks first in every class meeting. Support grows faster.',
  },
]

export function hasTrait(traits: readonly string[] | undefined, id: TraitId) {
  return Boolean(traits?.includes(id))
}

export function normalizeTraits(input?: string[] | null): TraitId[] {
  const allowed = new Set(TRAITS.map((trait) => trait.id))
  const unique: TraitId[] = []
  for (const id of input ?? []) {
    if (!allowed.has(id as TraitId) || unique.includes(id as TraitId)) continue
    unique.push(id as TraitId)
    if (unique.length >= TRAIT_LIMIT) break
  }
  return unique
}
