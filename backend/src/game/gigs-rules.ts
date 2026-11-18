/** Pure rules for Gigs (no database): categories, ranks, limits, status moves, text cleaning. */
import { hasLinkOrNumber, maskBadWords } from './game-chat-rules.js'

export const GIG_CATEGORIES = ['decorator', 'cleaner', 'driver', 'dj', 'cook', 'other'] as const
export type GigCategory = (typeof GIG_CATEGORIES)[number]

export const GIG_CATEGORY_LABEL: Record<GigCategory, string> = {
  decorator: 'Decorator',
  cleaner: 'Cleaner',
  driver: 'Driver',
  dj: 'DJ',
  cook: 'Cook',
  other: 'Other',
}

/** Categories whose work happens inside the owner's house in 3D today. */
export const GIG_3D_CATEGORIES: readonly GigCategory[] = ['decorator', 'cleaner', 'cook']

export type GigStatus = 'open' | 'hired' | 'working' | 'done' | 'completed' | 'cancelled' | 'disputed'

export const GIG_LIMITS = {
  titleMax: 60,
  detailsMax: 400,
  pitchMax: 200,
  messageMax: 200,
  reasonMax: 200,
  feeMin: 100,
  feeMax: 50_000_000,
  budgetMax: 50_000_000,
  /** Start-time choices, in hours from now (0 = right now). */
  startChoicesH: [0, 1, 6, 24, 48, 72] as const,
  /** How long the job key lasts after the start time. */
  windowH: 72,
  /** Owner has this long after "done" to accept or dispute; then it pays out by itself. */
  autoAcceptH: 24,
  /** A post or profile with this many different reporters is hidden. */
  hideAtReports: 3,
  /** Open posts one player can have at a time. */
  openPostsMax: 5,
} as const

/** ONE place for rank thresholds: a rank needs both enough finished jobs and a high enough average rating. */
export const GIG_RANKS = [
  { id: 'top', label: 'Top', emoji: '👑', minJobs: 25, minAvg: 4.5 },
  { id: 'pro', label: 'Pro', emoji: '🏅', minJobs: 8, minAvg: 4.0 },
  { id: 'rising', label: 'Rising', emoji: '🌱', minJobs: 2, minAvg: 3.5 },
  { id: 'new', label: 'New', emoji: '🆕', minJobs: 0, minAvg: 0 },
] as const
export type GigRankId = (typeof GIG_RANKS)[number]['id']

/** Rank from jobs finished and average rating (null average = no ratings yet). `order`: 0 = New … 3 = Top. */
export function rankFor(jobs: number, avg: number | null): { id: GigRankId; label: string; emoji: string; order: number } {
  const a = avg ?? 0
  let idx = GIG_RANKS.findIndex((r) => jobs >= r.minJobs && (r.minJobs === 0 || a >= r.minAvg))
  if (idx < 0) idx = GIG_RANKS.length - 1
  const r = GIG_RANKS[idx]!
  return { id: r.id, label: r.label, emoji: r.emoji, order: GIG_RANKS.length - 1 - idx }
}

export const isCategory = (v: unknown): v is GigCategory => typeof v === 'string' && (GIG_CATEGORIES as readonly string[]).includes(v)

/** The only allowed status moves. */
const MOVES: Record<GigStatus, GigStatus[]> = {
  open: ['hired', 'cancelled'],
  hired: ['working', 'done', 'cancelled'],
  working: ['done'],
  done: ['completed', 'disputed'],
  disputed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}
export const canMove = (from: GigStatus, to: GigStatus) => MOVES[from].includes(to)

/** The worker may use the owner's house (job key) in these states. */
export const KEY_STATES: readonly GigStatus[] = ['hired', 'working']

export type CleanText = { ok: true; text: string } | { ok: false; error: string }

/** Trim, length-check, block links/phone numbers, mask bad words (the same filter chat uses). */
export function cleanGigText(raw: unknown, max: number, opts: { required?: boolean; label?: string } = {}): CleanText {
  const label = opts.label ?? 'Text'
  const text = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : ''
  if (!text) return opts.required ? { ok: false, error: `${label} cannot be empty.` } : { ok: true, text: '' }
  if (text.length > max) return { ok: false, error: `${label} is too long (max ${max}).` }
  if (hasLinkOrNumber(text)) return { ok: false, error: `${label} cannot have links or phone numbers.` }
  return { ok: true, text: maskBadWords(text).text }
}

/** Fee / budget as whole naira inside the limits. */
export function cleanMoney(raw: unknown, min: number, max: number): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) return null
  return n
}

/** What the owner puts into escrow on hire. */
export const escrowFor = (fee: number, budget: number) => fee + budget

/** Left over from the item budget (refunded to the owner when the job ends). */
export const budgetLeft = (budget: number, spent: number) => Math.max(0, budget - spent)

export function startAtFrom(hoursFromNow: number, now: Date): { startAt: Date; expiresAt: Date } | null {
  if (!(GIG_LIMITS.startChoicesH as readonly number[]).includes(hoursFromNow)) return null
  const startAt = new Date(now.getTime() + hoursFromNow * 3_600_000)
  return { startAt, expiresAt: new Date(startAt.getTime() + GIG_LIMITS.windowH * 3_600_000) }
}

/** Whether the job key opens the house right now. */
export function keyOpen(status: GigStatus, startAt: Date, expiresAt: Date, now: Date): boolean {
  return KEY_STATES.includes(status) && now >= startAt && now <= expiresAt
}

export function autoAcceptAt(doneAt: Date): Date {
  return new Date(doneAt.getTime() + GIG_LIMITS.autoAcceptH * 3_600_000)
}

/** Mess in houses: one new prop every few hours, never more than the cap; each open one lowers cleanliness. */
export const MESS = {
  everyHours: 3,
  cap: 8,
  /** A house first looked at starts with this many props, so a cleaner has work at once. */
  starter: 3,
  kinds: ['paper', 'sock', 'box', 'bottle'] as const,
  perItemLoss: 12,
} as const

export const cleanlinessOf = (openMess: number) => Math.max(0, 100 - MESS.perItemLoss * openMess)

/** How many new props are due, from hours since the last spawn and how many are open now. */
export function messDue(hoursSince: number, open: number): number {
  const due = Math.floor(hoursSince / MESS.everyHours)
  return Math.max(0, Math.min(due, MESS.cap - open))
}

/** What the next rank needs (null at the top): shown as a progress bar on the player's own Gigs card. */
export function nextRankFor(jobs: number, avg: number | null) {
  const cur = rankFor(jobs, avg)
  const next = [...GIG_RANKS].reverse().find((r) => (GIG_RANKS.length - 1 - GIG_RANKS.findIndex((x) => x.id === r.id)) === cur.order + 1)
  if (!next) return null
  return { id: next.id, label: next.label, emoji: next.emoji, minJobs: next.minJobs, minAvg: next.minAvg }
}

/** Dishes a Cook job can ask for. `cost` is the ingredient money the owner holds in escrow; the dish (hunger/fun) is the shop_items row of the same id (sql/086). */
export const COOK_MENU = [
  { id: 'dish-jollof-rice', name: 'Jollof rice', emoji: '🍲', cost: 1500 },
  { id: 'dish-fried-rice', name: 'Fried rice and chicken', emoji: '🍛', cost: 1800 },
  { id: 'dish-egusi', name: 'Egusi and pounded yam', emoji: '🥘', cost: 2500 },
  { id: 'dish-moi-moi', name: 'Moi moi', emoji: '🫘', cost: 1200 },
  { id: 'dish-pepper-soup', name: 'Pepper soup', emoji: '🍜', cost: 2000 },
  { id: 'dish-efo-riro', name: 'Efo riro and rice', emoji: '🥬', cost: 2200 },
  { id: 'dish-ofada', name: 'Ofada rice and stew', emoji: '🍚', cost: 2800 },
  { id: 'dish-suya', name: 'Suya platter', emoji: '🍢', cost: 3000 },
] as const
export type CookDish = (typeof COOK_MENU)[number]
export const dishById = (id: unknown): CookDish | null => COOK_MENU.find((d) => d.id === id) ?? null
