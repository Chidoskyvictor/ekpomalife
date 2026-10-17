export type TraitId =
  | 'tech'
  | 'night-classer'
  | 'foodie'
  | 'leader'
  | 'hustler'
  | 'risk-taker'
  | 'gym-rat'
  | 'academic-weapon'
  | 'fashionista'
  | 'social-butterfly'

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
    sticker: '/emoji/laptop.png',
    label: 'Tech bro or sis',
    description: 'Has three startup ideas before breakfast. Coding grows faster.',
  },
  {
    id: 'night-classer',
    sticker: '/emoji/crescent-moon.png',
    label: 'Night classer',
    description: 'Reads until the sun comes up. Study grows faster.',
  },
  {
    id: 'foodie',
    sticker: '/emoji/pot-of-food.png',
    label: 'Foodie',
    description: 'Has a snack in every bag. Hunger drops slower.',
  },
  {
    id: 'leader',
    sticker: '/emoji/ballot-box.png',
    label: 'Leader',
    description: 'Speaks first in every class meeting. Support grows faster.',
  },
  {
    id: 'hustler',
    sticker: '/emoji/money-bag.png',
    label: 'The hustler',
    description: 'The next Tunde Onakoya. Cash and customers grow faster.',
  },
  {
    id: 'risk-taker',
    sticker: '/emoji/fire.png',
    label: 'The risk taker',
    description: 'The next Mr Banks. Bets land more often.',
  },
  {
    id: 'gym-rat',
    sticker: '/emoji/biceps.png',
    label: 'Gym rat',
    description: 'Never skips leg day, even during finals week. Fitness grows faster.',
  },
  {
    id: 'academic-weapon',
    sticker: '/emoji/books.png',
    label: 'The academic weapon',
    description: 'The next Wole Soyinka. Knowledge grows faster.',
  },
  {
    id: 'fashionista',
    sticker: '/emoji/sunglasses.png',
    label: 'Fashionista',
    description: 'Always coordinated, even for 8 a.m. lectures. Charisma grows faster.',
  },
  {
    id: 'social-butterfly',
    sticker: '/emoji/party-popper.png',
    label: 'Social butterfly',
    description: 'The next Davido. Charisma grows faster. Social meter drops slower.',
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
