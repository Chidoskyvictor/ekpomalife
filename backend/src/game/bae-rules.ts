/*
 * Bae & Family rules (pure, unit-tested). Closeness points live in player_relations.points.
 */

export const BAE_CLOSENESS_NEEDED = 40
export const MAX_BAES = 4
export const REQUEST_DAYS = 3
export const DECLINE_COOLDOWN_HOURS = 24
/** Chance a date with a sneaky link gets noticed. */
export const CAUGHT_CHANCE = 0.12
export const ANNIVERSARY_DAYS = 7

export const RELATIONS = ['sibling', 'cousin', 'parent', 'uncle_aunt'] as const
export type Relation = (typeof RELATIONS)[number]
export type StoredRole = Relation | 'child' | 'niece_nephew'

/** What the sender is to the receiver, when the sender says "the receiver is my <relation>". */
export const INVERSE: Record<Relation, StoredRole> = {
  sibling: 'sibling',
  cousin: 'cousin',
  parent: 'child',
  uncle_aunt: 'niece_nephew',
}

export type DateSpot = { id: string; label: string; emoji: string; cost: number; closeness: number; needs: { fun: number; social: number } }
export const DATE_SPOTS: DateSpot[] = [
  { id: 'walk', label: 'Campus walk', emoji: '🚶🏾', cost: 0, closeness: 4, needs: { fun: 4, social: 8 } },
  { id: 'chop', label: 'Chop at bukka', emoji: '🍛', cost: 2000, closeness: 8, needs: { fun: 8, social: 10 } },
  { id: 'chill', label: 'Chill spot', emoji: '🥂', cost: 5000, closeness: 12, needs: { fun: 12, social: 12 } },
]
export const DATE_COOLDOWN_SEC = 4 * 3600

export function closenessGate(points: number): { unlocked: boolean; progress: string } {
  const p = Math.max(0, Math.floor(points))
  return { unlocked: p >= BAE_CLOSENESS_NEEDED, progress: `${Math.min(p, BAE_CLOSENESS_NEEDED)}/${BAE_CLOSENESS_NEEDED}` }
}

export type PairStats = { dates: number; hangouts: number; cozy: number; anniversaries: number }

export const GOALS = [
  { id: 'dates', label: 'Go on dates', emoji: '🍽️', target: 3 },
  { id: 'hangouts', label: 'Hang out', emoji: '🎮', target: 5 },
  { id: 'cozy', label: 'Cozy nights', emoji: '🛋️', target: 3 },
  { id: 'anniversaries', label: 'Anniversary', emoji: '🎂', target: 1 },
] as const

export function coupleXp(s: PairStats): number {
  return s.dates * 5 + s.hangouts * 2 + s.cozy * 3 + s.anniversaries * 10
}

export const coupleLevel = (s: PairStats): number => 1 + Math.floor(coupleXp(s) / 25)

/** Interactions between baes that count toward goals. */
export const COZY_ACTIONS = new Set(['cuddle', 'slow-dance', 'kiss', 'kiss-cheek'])
export const HANGOUT_ACTIONS = new Set(['together', 'fifa', 'gist', 'japa-plans', 'hug', 'hold-hands'])

export function goalKind(action: string): 'cozy' | 'hangouts' | null {
  if (COZY_ACTIONS.has(action)) return 'cozy'
  if (HANGOUT_ACTIONS.has(action)) return 'hangouts'
  return null
}

/** Next anniversary is every 7 days since the couple formed; claimable when due. */
export function anniversaryDue(since: Date, claimed: number, now = new Date()): boolean {
  return now.getTime() >= since.getTime() + (claimed + 1) * ANNIVERSARY_DAYS * 86_400_000
}

/** Can another request be sent? `declinedAt` is the sender's last declined request to this player. */
export function cooldownLeftHours(declinedAt: Date | null, now = new Date()): number {
  if (!declinedAt) return 0
  const left = DECLINE_COOLDOWN_HOURS - (now.getTime() - declinedAt.getTime()) / 3_600_000
  return Math.max(0, Math.ceil(left))
}

export const isExpired = (expiresAt: Date, now = new Date()) => expiresAt.getTime() <= now.getTime()

/** Relationship line on a card. Sneaky links never count; hidden = null. */
export function statusLabel(openBaes: number, hidden: boolean): string | null {
  if (hidden) return null
  return openBaes > 0 ? 'In a relationship' : 'Single'
}

/** Paired affectionate actions: how long both characters hold the pose (seconds). */
export const PAIR_SECONDS: Record<string, number> = {
  hug: 5,
  'kiss-cheek': 3,
  kiss: 4,
  cuddle: 8,
  'hold-hands': 8,
  'slow-dance': 10,
}

/* —— Paired animation geometry (decided on the server so both phones agree) —— */

export type PairPoint = { x: number; z: number }
export type PairSpot = { x: number; z: number; h: number; pose: string }

/** face = stand facing each other · side = stand side by side, both facing the same way. gap = distance apart (m). */
export const PAIR_STYLE: Record<string, { kind: 'face' | 'side'; gap: number; pose: string }> = {
  hug: { kind: 'face', gap: 0.62, pose: 'hug' },
  'kiss-cheek': { kind: 'face', gap: 0.6, pose: 'cheek' },
  kiss: { kind: 'face', gap: 0.55, pose: 'kiss' },
  'slow-dance': { kind: 'face', gap: 0.7, pose: 'slowdance' },
  cuddle: { kind: 'side', gap: 0.5, pose: 'cuddle' },
  'hold-hands': { kind: 'side', gap: 0.62, pose: 'hands' },
}

/** Where each character stands and which way it faces. `a` and `b` are the two players' current positions. */
export function pairSpots(action: string, a: PairPoint, b: PairPoint): { a: PairSpot; b: PairSpot } | null {
  const style = PAIR_STYLE[action]
  if (!style) return null
  const mx = (a.x + b.x) / 2
  const mz = (a.z + b.z) / 2
  let ux = b.x - a.x
  let uz = b.z - a.z
  const len = Math.hypot(ux, uz)
  if (len < 0.01) {
    ux = 1
    uz = 0
  } else {
    ux /= len
    uz /= len
  }
  const ax = mx - (ux * style.gap) / 2
  const az = mz - (uz * style.gap) / 2
  const bx = mx + (ux * style.gap) / 2
  const bz = mz + (uz * style.gap) / 2
  if (style.kind === 'face') {
    return {
      a: { x: ax, z: az, h: Math.atan2(ux, uz), pose: style.pose },
      b: { x: bx, z: bz, h: Math.atan2(-ux, -uz), pose: style.pose },
    }
  }
  // Both face the same way, at right angles to the line between them
  const fx = -uz
  const fz = ux
  const h = Math.atan2(fx, fz)
  const left = { x: Math.cos(h), z: -Math.sin(h) }
  // Which side (character's left = +) is the partner on?
  const sideA = ux * left.x + uz * left.z >= 0 ? 'l' : 'r'
  return {
    a: { x: ax, z: az, h, pose: `${style.pose}-${sideA}` },
    b: { x: bx, z: bz, h, pose: `${style.pose}-${sideA === 'l' ? 'r' : 'l'}` },
  }
}

/** Poses a character can hold in a pair (also what the live socket relays to everyone else). */
export const PAIR_POSES = ['hug', 'cheek', 'kiss', 'slowdance', 'cuddle-l', 'cuddle-r', 'hands-l', 'hands-r'] as const
