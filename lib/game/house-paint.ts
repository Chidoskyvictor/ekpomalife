/**
 * Wall paint for each player's home. Every player gets a colour picked from their id, so
 * homes look different without anyone choosing; a paint bought later (`decor.wall`) wins.
 */

export type HousePaint = { id: string; name: string; hex: string }

export const HOUSE_PAINTS: HousePaint[] = [
  { id: 'sky', name: 'Sky Blue', hex: '#8ec5e8' },
  { id: 'mint', name: 'Mint', hex: '#9fd8b8' },
  { id: 'butter', name: 'Butter', hex: '#f2d98b' },
  { id: 'peach', name: 'Peach', hex: '#f4bf9a' },
  { id: 'lilac', name: 'Lilac', hex: '#c3b1e1' },
  { id: 'coral', name: 'Coral', hex: '#ef9a8a' },
  { id: 'sage', name: 'Sage', hex: '#b5c9a1' },
  { id: 'teal', name: 'Teal', hex: '#6fb7b0' },
  { id: 'sand', name: 'Sand', hex: '#e3cfa8' },
  { id: 'rose', name: 'Rose', hex: '#e8a9bf' },
]

const HEX = /^#[0-9a-f]{6}$/i

/** 32-bit FNV-1a: small, fast, and spreads similar ids apart. */
export function fnv1a(str: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function defaultPaintFor(playerId: string): HousePaint {
  return HOUSE_PAINTS[fnv1a(`${playerId}:house`) % HOUSE_PAINTS.length]
}

/** Trim/roof colour, salted separately so it doesn't always pair with the same wall colour. */
export function defaultTrimFor(playerId: string): HousePaint {
  return HOUSE_PAINTS[fnv1a(`${playerId}:roof`) % HOUSE_PAINTS.length]
}

export type PaintedPlayer = { id: string; decor?: { wall?: string | null } | null }

/** The player's chosen paint (a paint id or a "#rrggbb"), else their default from the id. */
export function resolvePaint(player: PaintedPlayer): HousePaint {
  const wall = player.decor?.wall?.trim()
  if (wall) {
    const preset = HOUSE_PAINTS.find((paint) => paint.id === wall)
    if (preset) return preset
    if (HEX.test(wall)) return { id: 'custom', name: 'Custom', hex: wall.toLowerCase() }
  }
  return defaultPaintFor(player.id)
}

/** The same colour a little darker (factor < 1), for the second wall. */
export function shadeOf(hex: string, factor = 0.92): string {
  const n = parseInt(hex.slice(1), 16)
  const channel = (shift: number) =>
    Math.max(0, Math.min(255, Math.round(((n >> shift) & 0xff) * factor)))
      .toString(16)
      .padStart(2, '0')
  return `#${channel(16)}${channel(8)}${channel(0)}`
}
