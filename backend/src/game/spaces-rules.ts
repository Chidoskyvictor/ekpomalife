/**
 * Campus Spaces — pure rules (no DB, no network) so they can be unit tested.
 * Times are real wall-clock; Ekpoma is Africa/Lagos (UTC+1, no daylight saving).
 */

export const TITLE_MAX = 60
export const COMMENT_MAX = 200
/** Minimum gap between one player's comments in a room */
export const COMMENT_GAP_MS = 1000
export const ROOM_CAP_MINUTES = 60
export const ROOMS_PER_DAY = 3
export const EMPTY_END_MINUTES = 5
export const SLOT_MINUTES = 15
export const SCHEDULE_MAX_DAYS = 7
export const MAX_LISTENERS = 50
/** Don't start a room with less than this many participant-minutes left in today's budget. */
export const MIN_START_PARTICIPANT_MINUTES = 10
/** A scheduled room can go live this early, and is dropped this long after its slot if never started. */
export const EARLY_START_MINUTES = 10
export const NO_SHOW_MINUTES = 30
/** Grace for the host to actually connect to LiveKit after asking for a token. */
export const HOST_CONNECT_GRACE_MINUTES = 2
/** LiveKit Cloud free (Build) plan: 5,000 participant-minutes a month, hard cap, shared by all free projects. */
export const LIVEKIT_FREE_MONTHLY_MINUTES = 5000
/** 160 × 31 days = 4,960, so even a 31-day month stays under the free cap. */
export const DEFAULT_DAILY_MINUTES = 160

const LAGOS_OFFSET_MS = 60 * 60 * 1000
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

export type Visibility = 'public' | 'link' | 'invite'
export type SpaceStatus = 'scheduled' | 'live' | 'ended'
export type SpaceRole = 'host' | 'speaker' | 'listener'

// Begging / giveaway bait. Matched on a normalized title (lowercase, leetspeak undone,
// punctuation collapsed) so "S3nd-me C0ins!!" still trips it.
const BLOCKED_PHRASES = [
  'send me',
  'sendme',
  'dash me',
  'dashme',
  'account number',
  'acct number',
  'acct no',
  'account no',
  'acc no',
  'giveaway',
  'give away',
  'give-away',
  'airtime',
  'coins',
  'free money',
  'free naira',
  'free cash',
  'opay',
  'palmpay',
  'transfer me',
  'send money',
  'drop your account',
  'drop account',
  'recharge card',
  'recharge me',
  'pay me',
  'bless me',
  'cashout',
  'cash out',
]

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' }

export function normalizeForFilter(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[013457@$]/g, (ch) => LEET[ch] ?? ch)
    .replace(/[^a-z\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function joinSingleLetters(norm: string): string {
  const out: string[] = []
  let run = ''
  for (const word of norm.split(' ')) {
    if (word.length === 1) {
      run += word
      continue
    }
    if (run) out.push(run)
    run = ''
    out.push(word)
  }
  if (run) out.push(run)
  return out.join(' ')
}

/** Collapse whitespace; empty string when nothing is left. */
export function cleanTitle(title: string): string {
  return title.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()
}

export type TitleCheck = { ok: true; title: string } | { ok: false; code: 'EMPTY_TITLE' | 'TITLE_TOO_LONG' | 'TITLE_BLOCKED'; error: string }

/** Begging / giveaway bait, matched on normalized text (see BLOCKED_PHRASES). */
function hasBlockedPhrase(text: string): boolean {
  const spaced = ` ${joinSingleLetters(normalizeForFilter(text))} `
  return BLOCKED_PHRASES.some((phrase) => spaced.includes(` ${normalizeForFilter(phrase)} `))
}

export function checkTitle(raw: string): TitleCheck {
  const title = cleanTitle(raw)
  if (!title) return { ok: false, code: 'EMPTY_TITLE', error: 'Give your Space a title.' }
  if ([...title].length > TITLE_MAX) return { ok: false, code: 'TITLE_TOO_LONG', error: `Keep the title under ${TITLE_MAX} characters.` }
  if (hasBlockedPhrase(title)) {
    return { ok: false, code: 'TITLE_BLOCKED', error: 'No begging or giveaways in Space titles. Pick another title.' }
  }
  return { ok: true, title }
}

export type CommentCheck = { ok: true; body: string } | { ok: false; code: 'EMPTY_COMMENT' | 'COMMENT_TOO_LONG' | 'COMMENT_BLOCKED'; error: string }

/** Room comments follow the same no-begging / no-giveaway rule as titles. */
export function checkComment(raw: string): CommentCheck {
  const body = cleanTitle(raw)
  if (!body) return { ok: false, code: 'EMPTY_COMMENT', error: 'Write something first.' }
  if ([...body].length > COMMENT_MAX) return { ok: false, code: 'COMMENT_TOO_LONG', error: `Keep comments under ${COMMENT_MAX} characters.` }
  if (hasBlockedPhrase(body)) {
    return { ok: false, code: 'COMMENT_BLOCKED', error: 'No begging or giveaways in comments.' }
  }
  return { ok: true, body }
}

/** Start of the Lagos calendar day containing `now`, as a UTC instant. */
export function lagosDayStart(now: Date): Date {
  const local = now.getTime() + LAGOS_OFFSET_MS
  return new Date(Math.floor(local / DAY) * DAY - LAGOS_OFFSET_MS)
}

export type SlotCheck = { ok: true; at: Date } | { ok: false; code: 'BAD_SLOT' | 'SLOT_PAST' | 'SLOT_TOO_FAR'; error: string }

/**
 * A schedule time must sit on a 15-minute Lagos slot (:00 :15 :30 :45), be in the
 * future and at most 7 days ahead. Lagos is a whole hour off UTC, so slots line up with UTC too.
 */
export function checkScheduleSlot(at: Date, now: Date): SlotCheck {
  const t = at.getTime()
  if (!Number.isFinite(t)) return { ok: false, code: 'BAD_SLOT', error: 'Pick a time for your Space.' }
  if ((t + LAGOS_OFFSET_MS) % (SLOT_MINUTES * MINUTE) !== 0) {
    return { ok: false, code: 'BAD_SLOT', error: 'Pick a time on the quarter hour (:00, :15, :30 or :45).' }
  }
  if (t <= now.getTime()) return { ok: false, code: 'SLOT_PAST', error: 'That time has passed. Pick a later slot.' }
  if (t > now.getTime() + SCHEDULE_MAX_DAYS * DAY) {
    return { ok: false, code: 'SLOT_TOO_FAR', error: `You can schedule up to ${SCHEDULE_MAX_DAYS} days ahead.` }
  }
  return { ok: true, at }
}

/** Every bookable slot from the next quarter hour up to 7 days ahead (for a time picker). */
export function scheduleSlots(now: Date): Date[] {
  const step = SLOT_MINUTES * MINUTE
  const first = Math.floor(now.getTime() / step) * step + step
  const last = now.getTime() + SCHEDULE_MAX_DAYS * DAY
  const out: Date[] = []
  for (let t = first; t <= last; t += step) out.push(new Date(t))
  return out
}

export function createCapReached(createdToday: number): boolean {
  return createdToday >= ROOMS_PER_DAY
}

/**
 * Participant-minutes used (people × minutes, the way LiveKit bills): finished sessions'
 * seconds plus every open session counted up to now. Rounded up so we never under-count.
 */
export function participantMinutes(closedSeconds: number, openJoinedAt: Date[], now: Date): number {
  const openMs = openJoinedAt.reduce((sum, joined) => sum + Math.max(0, now.getTime() - joined.getTime()), 0)
  return Math.ceil((Math.max(0, closedSeconds) + openMs / 1000) / 60)
}

export type BudgetState = {
  used: number
  budget: number
  remaining: number
  /** A new room may go live */
  canStart: boolean
  /** Someone may join a live room */
  canJoin: boolean
  /** Spent: the sweeper ends every live room */
  exhausted: boolean
}

export function spacesBudget(used: number, budget: number): BudgetState {
  const remaining = Math.max(0, Math.floor(budget - used))
  return {
    used,
    budget,
    remaining,
    canStart: remaining >= MIN_START_PARTICIPANT_MINUTES,
    canJoin: remaining > 0,
    exhausted: remaining <= 0,
  }
}

export type AutoEndReason = 'cap' | 'host_left' | 'empty' | 'no_show' | 'budget'

/** Should the sweeper end this room now? Pure so every branch is tested. */
export function autoEndReason(input: {
  status: SpaceStatus
  now: Date
  scheduledAt: Date | null
  startedAt: Date | null
  capMinutes: number
  /** null when we don't know (LiveKit not reachable) — then only DB presence counts. */
  hostConnected: boolean | null
  hostJoinedAt: Date | null
  presentCount: number
  /** Last time anyone was in the room (latest join or leave). */
  lastActivityAt: Date | null
}): AutoEndReason | null {
  const now = input.now.getTime()
  if (input.status === 'scheduled') {
    if (input.scheduledAt && now > input.scheduledAt.getTime() + NO_SHOW_MINUTES * MINUTE) return 'no_show'
    return null
  }
  if (input.status !== 'live' || !input.startedAt) return null
  if (now >= input.startedAt.getTime() + input.capMinutes * MINUTE) return 'cap'
  if (input.hostConnected === false) {
    const since = input.hostJoinedAt?.getTime() ?? input.startedAt.getTime()
    if (now >= since + HOST_CONNECT_GRACE_MINUTES * MINUTE) return 'host_left'
  }
  if (input.presentCount === 0) {
    const since = input.lastActivityAt?.getTime() ?? input.startedAt.getTime()
    if (now >= since + EMPTY_END_MINUTES * MINUTE) return 'empty'
  }
  return null
}

/** Can a scheduled room go live now? (From 10 minutes before its slot until it's dropped.) */
export function canStartScheduled(scheduledAt: Date | null, now: Date): boolean {
  if (!scheduledAt) return true
  const t = scheduledAt.getTime()
  return now.getTime() >= t - EARLY_START_MINUTES * MINUTE && now.getTime() <= t + NO_SHOW_MINUTES * MINUTE
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no 0/O/1/I/L

/** 6-character join code from random bytes (pass crypto.randomBytes(6)). */
export function joinCodeFrom(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]
  return out
}

export function normalizeJoinCode(code: string): string | null {
  const c = code.trim().toUpperCase()
  return /^[A-HJ-KM-NP-Z2-9]{6}$/.test(c) ? c : null
}

/** LiveKit publish rights: host and approved speakers only, microphone only. */
export function canPublish(role: SpaceRole): boolean {
  return role === 'host' || role === 'speaker'
}
