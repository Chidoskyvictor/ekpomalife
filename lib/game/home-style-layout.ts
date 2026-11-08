/*
 * Styles: lays a ready-made look out on a home's real floor plan. Pure and import-light so the app
 * (preview) and the server (purchase) run the exact same code. Keep backend/src/game/home-style-layout.ts
 * identical to this file apart from the './home-buy-rules.js' import.
 *
 * Every home is split into rooms (bedroom, sitting room, kitchen, bathroom). Each piece is given a
 * room by what it is, then the best free spot in that room: against a wall with clearance, turned to
 * face into the room, beds in the bedroom, sofas facing the TV, kitchen pieces along the kitchen
 * walls, bath pieces in the bathroom, companions (bedside pieces, chairs, speakers) next to their
 * anchor. Doors and the entrance are kept clear and every spot passes checkHomePlacement, so
 * nothing overlaps or walls anything off. Same input, same layout: no randomness.
 */
import {
  checkHomePlacement,
  homeFootprint,
  type HomePlacement,
  type HomeRotation,
  type HomeShape,
  type HomeSpec,
  type HomeSpot,
} from './home-buy-rules'

export type RoomKind = 'bedroom' | 'sitting' | 'kitchen' | 'bath'
export type StyleScope = 'home' | RoomKind
export const STYLE_SCOPES: { id: StyleScope; label: string }[] = [
  { id: 'home', label: 'Whole home' },
  { id: 'bedroom', label: 'Bedroom' },
  { id: 'sitting', label: 'Sitting room' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'bath', label: 'Bathroom' },
]

/** Inclusive tile rectangle [x0, z0, x1, z1]. */
type Rect = [number, number, number, number]

/**
 * The rooms of each home (tiles, from the home-grid.ts maps) and the tiles that must stay open:
 * doorways and the entrance. A home without a kitchen or bathroom of its own has no such room here.
 */
export const HOME_ROOMS: Record<string, { rooms: Partial<Record<RoomKind, Rect>>; keepClear: [number, number][]; separate: boolean }> = {
  // One room with no walls inside: the rooms below are only zones (sleep corner, sitting spot, cooking strip, bucket and toilet corner)
  // One room: bed side on the left, a sitting patch in the middle, kitchen strip on top, bucket and toilet corner on the right
  'single-poultry': {
    rooms: { bedroom: [0, 0, 3, 10], sitting: [4, 3, 8, 8], kitchen: [4, 0, 10, 2], bath: [9, 4, 10, 10] },
    keepClear: [[7, 8], [7, 9], [7, 10], [6, 9], [8, 9], [6, 10], [8, 10]],
    separate: false,
  },
  // One big room (bedroom west, sitting east), with the bathroom and kitchen below behind doorways in the wall at row 16
  'selfcon-g2': {
    rooms: { bedroom: [0, 0, 7, 15], sitting: [8, 0, 15, 15], bath: [0, 17, 6, 22], kitchen: [9, 17, 15, 22] },
    keepClear: [
      [3, 15], [3, 16], [3, 17], [2, 17], [4, 17],
      [11, 15], [12, 15], [11, 16], [12, 16], [11, 17], [12, 17],
      [9, 13], [11, 13], [10, 12], [10, 14],
    ],
    separate: true,
  },
  // Bedroom on the left (door at row 13), sitting room on the right, bathroom and kitchen below
  'onebed-ojo': {
    rooms: { bedroom: [0, 0, 9, 17], sitting: [11, 0, 28, 17], bath: [11, 19, 18, 25], kitchen: [21, 19, 28, 25] },
    keepClear: [
      [9, 12], [9, 13], [9, 14], [10, 13], [11, 12], [11, 13], [11, 14],
      [15, 17], [15, 18], [15, 19], [14, 19], [16, 19],
      [23, 17], [24, 17], [25, 17], [23, 18], [24, 18], [25, 18], [23, 19], [24, 19], [25, 19],
      [24, 14], [23, 15], [25, 15], [24, 16], [24, 15],
    ],
    separate: true,
  },
}

/**
 * The scope chips a home offers: always the whole home; plus each real room it has. A single room
 * has no separate rooms (only zones), so it offers just the whole room.
 */
export function scopesFor(lodgingId: string): { id: StyleScope; label: string }[] {
  const home = HOME_ROOMS[lodgingId]
  if (!home || !home.separate) return [{ id: 'home', label: lodgingId === 'single-poultry' ? 'Whole room' : 'Whole home' }]
  return STYLE_SCOPES.filter((s) => s.id === 'home' || home.rooms[s.id as RoomKind])
}

export type StyleItem = HomeShape & { category: string; uses: string | null }
export type StyleEntry = { item: string; finish?: string | null }
export type StylePiece = HomePlacement & { finish?: string | null }
export type StylePlan = {
  /** Owned pieces put in place (free); `fromStorage` ones come out of storage. */
  moves: { id: string; itemId: string; spot: HomeSpot; finish: string | null; fromStorage: boolean }[]
  /** Pieces to buy, in order. */
  buys: { itemId: string; spot: HomeSpot; finish: string | null }[]
  /** Pieces of yours the style doesn't use (whole-home only): they go to storage. */
  toStorage: string[]
  /** Item ids that didn't fit (never bought). */
  skipped: string[]
  /** The home afterwards (bought pieces get ids "new0", "new1"…; stored pieces aren't in it). */
  result: StylePiece[]
}

type Mode = 'wall' | 'free'
type Rule = { kinds: RoomKind[]; mode: Mode; near?: string[]; faces?: string[]; front?: boolean; priority: number }

const has = (item: StyleItem, ...words: string[]) => words.some((w) => item.id.includes(w))

/** Where a piece belongs and how it wants to stand (by what it is, so new items just work). */
export function ruleOf(item: StyleItem): Rule {
  if (item.uses === 'bed' || has(item, 'bed-') || has(item, 'mattress')) return { kinds: ['bedroom', 'sitting'], mode: 'wall', priority: 0 }
  if (has(item, 'wardrobe')) return { kinds: ['bedroom', 'sitting'], mode: 'wall', priority: 4 }
  if (has(item, 'flat-tv', 'tv-stand')) return { kinds: ['sitting', 'bedroom'], mode: 'wall', priority: 1 }
  if (item.uses === 'sofa' || has(item, 'sofa', 'armchair', 'recliner'))
    return { kinds: ['sitting', 'bedroom'], mode: 'wall', faces: ['tv'], priority: 2 }
  if (has(item, 'centre-table')) return { kinds: ['sitting', 'bedroom'], mode: 'free', near: ['sofa', 'armchair'], front: true, priority: 5 }
  if (has(item, 'dining-table')) return { kinds: ['sitting', 'kitchen'], mode: 'free', priority: 4 }
  if (has(item, 'speaker', 'radio')) return { kinds: ['sitting', 'bedroom'], mode: 'wall', near: ['tv'], priority: 5 }
  if (has(item, 'office-chair') || item.uses === 'desk-chair')
    return { kinds: ['bedroom', 'sitting'], mode: 'free', near: ['desk'], faces: ['desk'], priority: 5 }
  if (has(item, 'chair') || item.uses === 'red-chair')
    return { kinds: ['sitting', 'kitchen', 'bedroom'], mode: 'free', near: ['dining-table', 'centre-table', 'desk'], faces: ['dining-table', 'centre-table', 'desk'], priority: 5 }
  if (has(item, 'bedside', 'side-table', 'locker', 'lamp'))
    return { kinds: ['bedroom', 'sitting'], mode: 'wall', near: ['bed', 'sofa', 'armchair', 'recliner'], priority: 6 }
  if (item.uses === 'cooker' || has(item, 'cooker', 'stove')) return { kinds: ['kitchen'], mode: 'wall', priority: 3 }
  if (item.category === 'kitchen') return { kinds: ['kitchen'], mode: 'wall', priority: 4 }
  if (has(item, 'washing-machine')) return { kinds: ['kitchen', 'bath'], mode: 'wall', priority: 4 }
  if (item.category === 'bath') return { kinds: ['bath'], mode: 'wall', priority: 4 }
  if (item.category === 'study') return { kinds: ['bedroom', 'sitting'], mode: 'wall', priority: 4 }
  return { kinds: ['sitting', 'bedroom'], mode: 'wall', priority: 8 }
}

/** The room a piece primarily belongs in (what a room scope filters by). */
export const roomOf = (item: StyleItem): RoomKind => ruleOf(item).kinds[0]!

const FRONT: Record<HomeRotation, [number, number]> = { 0: [0, 1], 90: [-1, 0], 180: [0, -1], 270: [1, 0] }
const ROTS: HomeRotation[] = [0, 90, 180, 270]
const key = (x: number, z: number) => z * 1000 + x

type Ctx = {
  spec: HomeSpec
  items: Map<string, StyleItem>
  shapes: Map<string, HomeShape>
  rooms: Partial<Record<RoomKind, Rect>>
  keepClear: Set<number>
}

function roomsFor(lodgingId: string, spec: HomeSpec) {
  const known = HOME_ROOMS[lodgingId]
  if (known) return known
  // A home we have no plan for: one sitting room over the whole floor, entrance kept clear
  const [sx, sz] = spec.start
  return {
    rooms: { sitting: [0, 0, spec.cols - 1, spec.rows - 1] as Rect },
    keepClear: [[sx, sz], [sx - 1, sz], [sx + 1, sz], [sx, sz - 1], [sx, sz + 1]] as [number, number][],
  }
}

const floorAt = (spec: HomeSpec, x: number, z: number) => spec.floor[z]?.[x] === '1'
const blockedAt = (spec: HomeSpec, x: number, z: number) => spec.blocked[z]?.[x] === '1'

/** Tiles taken by floor pieces. */
function occupied(ctx: Ctx, pieces: StylePiece[]) {
  const taken = new Set<number>()
  for (const p of pieces) {
    const it = ctx.items.get(p.itemId)
    if (!it || it.wall) continue
    const { w, d } = homeFootprint(it, p.rot)
    for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) taken.add(key(p.x + dx, p.z + dz))
  }
  return taken
}

type Box = { x: number; z: number; w: number; d: number }
const boxOf = (ctx: Ctx, p: StylePiece): Box | null => {
  const it = ctx.items.get(p.itemId)
  if (!it) return null
  const { w, d } = homeFootprint(it, p.rot)
  return { x: p.x, z: p.z, w, d }
}

/** Do two boxes share an edge (touching, not overlapping)? */
function touching(a: Box, b: Box) {
  const zOverlap = a.z < b.z + b.d && b.z < a.z + a.d
  const xOverlap = a.x < b.x + b.w && b.x < a.x + a.w
  return (zOverlap && (a.x + a.w === b.x || b.x + b.w === a.x)) || (xOverlap && (a.z + a.d === b.z || b.z + b.d === a.z))
}

/** Share of each side (N, S, W, E) that rests against a wall or the home's own blocked tiles. */
function wallContact(ctx: Ctx, box: Box) {
  // Only real walls count (a room's imaginary edge inside an open plan is not a wall)
  const solid = (x: number, z: number) => !floorAt(ctx.spec, x, z) || blockedAt(ctx.spec, x, z)
  let n = 0
  let s = 0
  let w = 0
  let e = 0
  for (let dx = 0; dx < box.w; dx++) {
    if (solid(box.x + dx, box.z - 1)) n++
    if (solid(box.x + dx, box.z + box.d)) s++
  }
  for (let dz = 0; dz < box.d; dz++) {
    if (solid(box.x - 1, box.z + dz)) w++
    if (solid(box.x + box.w, box.z + dz)) e++
  }
  return { n: n / box.w, s: s / box.w, w: w / box.d, e: e / box.d }
}

type Candidate = { spot: HomeSpot; score: number }

function scoreFloor(ctx: Ctx, rule: Rule, rect: Rect, box: Box, rot: HomeRotation, placed: StylePiece[]): number {
  const c = wallContact(ctx, box)
  const best = Math.max(c.n, c.s, c.w, c.e)
  const corners = [c.n, c.s, c.w, c.e].filter((v) => v >= 0.5).length
  const [fx, fz] = FRONT[rot]
  // Contact on the side the piece turns its back to (good) and on its front (bad)
  const back = fz === 1 ? c.n : fz === -1 ? c.s : fx === -1 ? c.e : c.w
  const front = fz === 1 ? c.s : fz === -1 ? c.n : fx === -1 ? c.w : c.e
  const cx = box.x + box.w / 2
  const cz = box.z + box.d / 2
  let score = 0
  if (rule.mode === 'wall') {
    score += 10 * best + (corners >= 2 ? 3 : 0) + 6 * back - 5 * front
    // Line pieces up along a wall next to each other
    let neighbours = 0
    for (const p of placed) {
      const b = boxOf(ctx, p)
      if (b && touching(box, b)) neighbours++
    }
    if (best > 0) score += Math.min(2, neighbours) * 1.5
  } else {
    score += -4 * best - 0.15 * Math.hypot(cx - (rect[0] + rect[2] + 1) / 2, cz - (rect[1] + rect[3] + 1) / 2)
  }
  const find = (tokens: string[]) => placed.filter((p) => tokens.some((t) => p.itemId.includes(t)))
  if (rule.near) {
    let bonus = 0
    for (const a of find(rule.near)) {
      const ab = boxOf(ctx, a)
      if (!ab) continue
      let b = 0
      if (touching(box, ab)) b += 12
      else {
        const gap = Math.hypot(cx - (ab.x + ab.w / 2), cz - (ab.z + ab.d / 2))
        b += Math.max(0, 6 - gap * 0.5)
      }
      if (rule.front) {
        const [afx, afz] = FRONT[a.rot]
        const dot = (cx - (ab.x + ab.w / 2)) * afx + (cz - (ab.z + ab.d / 2)) * afz
        if (dot > 0 && dot < 4) b += 5
      }
      bonus = Math.max(bonus, b)
    }
    score += bonus
  }
  if (rule.faces) {
    let bonus = 0
    for (const t of find(rule.faces)) {
      const tb = boxOf(ctx, t)
      if (!tb) continue
      const vx = tb.x + tb.w / 2 - cx
      const vz = tb.z + tb.d / 2 - cz
      const len = Math.hypot(vx, vz) || 1
      const dot = (vx * fx + vz * fz) / len
      // Facing the TV: the far side of the room is best; facing a table: close is best
      const far = t.itemId.includes('tv') ? Math.min(len, 14) * 0.6 : len >= 3 ? 2 : 0
      if (dot > 0) bonus = Math.max(bonus, 7 * dot + far)
    }
    score += bonus
  }
  return score
}

/** The best spot for a piece in the given rooms (first room that has one), or null. */
function bestSpot(ctx: Ctx, item: StyleItem, rule: Rule, placed: StylePiece[], allowed: RoomKind[]): HomeSpot | null {
  const taken = occupied(ctx, placed)
  for (const kind of allowed) {
    const rect = ctx.rooms[kind]
    if (!rect) continue
    const found: Candidate[] = []
    if (item.wall) {
      // Wall pieces hang on the top wall (row 0) inside this room
      if (rect[1] !== 0) continue
      const usedTiles = new Set<number>()
      for (const p of placed) {
        const it = ctx.items.get(p.itemId)
        if (it?.wall) for (let dx = 0; dx < it.w; dx++) usedTiles.add(p.x + dx)
      }
      const mid = (rect[0] + rect[2] + 1) / 2
      for (let x = rect[0]; x + item.w - 1 <= rect[2]; x++) {
        let free = true
        for (let dx = 0; dx < item.w; dx++) if (usedTiles.has(x + dx) || ctx.keepClear.has(key(x + dx, 0))) free = false
        if (free) found.push({ spot: { x, z: 0, rot: 0 }, score: -Math.abs(x + item.w / 2 - mid) })
      }
    } else {
      for (const rot of ROTS) {
        const { w, d } = homeFootprint(item, rot)
        for (let z = rect[1]; z + d - 1 <= rect[3]; z++) {
          for (let x = rect[0]; x + w - 1 <= rect[2]; x++) {
            let ok = true
            for (let dz = 0; dz < d && ok; dz++) {
              for (let dx = 0; dx < w; dx++) {
                const k = key(x + dx, z + dz)
                if (taken.has(k) || ctx.keepClear.has(k) || !floorAt(ctx.spec, x + dx, z + dz) || blockedAt(ctx.spec, x + dx, z + dz)) {
                  ok = false
                  break
                }
              }
            }
            if (ok) found.push({ spot: { x, z, rot }, score: scoreFloor(ctx, rule, rect, { x, z, w, d }, rot, placed) })
          }
        }
      }
    }
    // Best first; ties keep scan order (stable sort), so the result is always the same
    const order = found.map((c, i) => ({ c, i })).sort((a, b) => b.c.score - a.c.score || a.i - b.i)
    for (const { c } of order.slice(0, 40)) {
      if (checkHomePlacement(ctx.spec, ctx.shapes, placed, item.id, c.spot).ok) return c.spot
    }
  }
  return null
}

export function planStyleLayout(input: {
  lodgingId: string
  spec: HomeSpec
  items: Map<string, StyleItem>
  /** Everything placed in the home now (starter pieces included). */
  active: StylePiece[]
  /** Your pieces in storage. */
  stored?: StylePiece[]
  entries: StyleEntry[]
  scope?: StyleScope
}): StylePlan {
  const { spec, items, entries } = input
  const scope = input.scope ?? 'home'
  const stored = input.stored ?? []
  const plan: StylePlan = { moves: [], buys: [], toStorage: [], skipped: [], result: [] }
  const plans = roomsFor(input.lodgingId, spec)
  const shapes = new Map<string, HomeShape>([...items].map(([id, it]) => [id, { id, w: it.w, d: it.d, wall: it.wall, maxPerHome: it.maxPerHome }]))
  const ctx: Ctx = { spec, items, shapes, rooms: plans.rooms, keepClear: new Set(plans.keepClear.map(([x, z]) => key(x, z))) }

  const wanted: { entry: StyleEntry; item: StyleItem; rule: Rule }[] = []
  for (const entry of entries) {
    const item = items.get(entry.item)
    if (!item) {
      plan.skipped.push(entry.item)
      continue
    }
    const rule = ruleOf(item)
    if (scope !== 'home' && rule.kinds[0] !== scope) continue
    wanted.push({ entry, item, rule })
  }
  // Most important first: bed, TV, seating, cooking, storage and desks, then companions, then decor. A small home
  // runs out of room at the end of this list, so the decor is what gets skipped. Ties keep the style's order.
  wanted.sort((a, b) => a.rule.priority - b.rule.priority)

  // Claim the pieces you own: placed ones first, then the ones in storage
  const isStarter = (p: StylePiece) => p.id.startsWith('starter-') || p.itemId.startsWith('starter-')
  const pool = [...input.active.filter((p) => !isStarter(p)).map((p) => ({ p, stored: false })), ...stored.map((p) => ({ p, stored: true }))]
  const claimed = new Map<number, (typeof pool)[number]>()
  const taken = new Set<string>()
  wanted.forEach((w, i) => {
    const hit = pool.find((c) => c.p.itemId === w.entry.item && !taken.has(c.p.id))
    if (hit) {
      taken.add(hit.p.id)
      claimed.set(i, hit)
    }
  })

  // The home the style starts from: starters stay; in the whole-home scope everything of yours the style doesn't use goes to storage
  const working: StylePiece[] = []
  for (const p of input.active) {
    if (isStarter(p)) working.push({ ...p })
    else if (taken.has(p.id)) continue
    else if (scope === 'home') plan.toStorage.push(p.id)
    else working.push({ ...p })
  }

  let fresh = 0
  wanted.forEach(({ entry, item, rule }, i) => {
    const finish = entry.finish ?? null
    const own = claimed.get(i)
    const spot = bestSpot(ctx, item, rule, working, rule.kinds)
    if (spot) {
      if (own) {
        working.push({ ...own.p, ...spot, finish })
        plan.moves.push({ id: own.p.id, itemId: item.id, spot, finish, fromStorage: own.stored })
      } else {
        working.push({ id: `new${fresh++}`, itemId: item.id, ...spot, finish })
        plan.buys.push({ itemId: item.id, spot, finish })
      }
      return
    }
    plan.skipped.push(item.id)
    if (own && !own.stored) {
      // Nowhere better: it stays where it is if that still works, else it goes to storage
      const back: HomeSpot = { x: own.p.x, z: own.p.z, rot: own.p.rot }
      if (checkHomePlacement(spec, shapes, working, item.id, back).ok) working.push({ ...own.p })
      else plan.toStorage.push(own.p.id)
    }
  })
  plan.result = working
  return plan
}
