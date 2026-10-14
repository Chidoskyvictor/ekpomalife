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
export type OutfitId = 'casual' | 'office' | 'corporate'

export type Appearance = {
  body: BodyId
  hair: HairId
  outfit: OutfitId
  skin: string
  hairColor: string
  topColor: string
  bottomColor: string
}

const OUTFITS = new Set<OutfitId>(['casual', 'office', 'corporate'])

const HAIR_BY_BODY: Record<BodyId, Set<HairId>> = {
  man: new Set(['lowcut', 'bald', 'curls', 'afro', 'locs', 'braids', 'classic']),
  woman: new Set(['braids', 'afro', 'bun', 'ponytail', 'long', 'locs', 'lowcut', 'classic']),
}

const SKIN_TONES = new Set(['#C68642', '#A56C3A', '#8D4E2A', '#6B3F28', '#5C3317', '#3E2414', '#2A160C'])
const HAIR_COLORS = new Set(['#0D0D0D', '#2C1810', '#4A2C14', '#8B5A2B', '#A66D3A', '#D4B483', '#6B3FA0'])
const CLOTH_COLORS = new Set([
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
])

const OUTFIT_COLORS: Partial<Record<OutfitId, { top: string; bottom: string }>> = {
  office: { top: '#12151F', bottom: '#12151F' },
  corporate: { top: '#F3F0E6', bottom: '#12151F' },
}

function hex(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const next = value.trim().toUpperCase()
  return /^#[0-9A-F]{6}$/.test(next) ? next : null
}

export type CheckResult<T> = { ok: true; value: T } | { ok: false; error: string }

export function checkAppearance(input: unknown): CheckResult<Appearance> {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Choose a look first.' }
  const raw = input as Record<string, unknown>

  const body = raw.body
  if (body !== 'woman' && body !== 'man') return { ok: false, error: 'Choose woman or man.' }

  const hair = raw.hair
  if (typeof hair !== 'string' || !HAIR_BY_BODY[body].has(hair as HairId)) {
    return { ok: false, error: 'That hair is not available for this look.' }
  }

  const outfit = raw.outfit
  if (typeof outfit !== 'string' || !OUTFITS.has(outfit as OutfitId)) {
    return { ok: false, error: 'Choose casual, office, or corporate.' }
  }

  const skin = hex(raw.skin)
  if (!skin || !SKIN_TONES.has(skin)) return { ok: false, error: 'Pick a skin tone from the list.' }

  const hairColor = hex(raw.hairColor)
  if (!hairColor || !HAIR_COLORS.has(hairColor)) return { ok: false, error: 'Pick a hair colour from the list.' }

  const preset = OUTFIT_COLORS[outfit as OutfitId]
  const topColor = preset?.top ?? hex(raw.topColor)
  const bottomColor = preset?.bottom ?? hex(raw.bottomColor)
  if (!topColor || !CLOTH_COLORS.has(topColor) || !bottomColor || !CLOTH_COLORS.has(bottomColor)) {
    return { ok: false, error: 'Pick outfit colours from the list.' }
  }

  return {
    ok: true,
    value: {
      body,
      hair: hair as HairId,
      outfit: outfit as OutfitId,
      skin,
      hairColor,
      topColor,
      bottomColor,
    },
  }
}
