import { missionProgress } from './missions.js'
import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import { createId } from '../ids.js'
import { announceSocial, announceSpray, createLiveTicket, type SprayNote } from './club-live.js'
import { requireEconomySetup, tickAndWeekly } from './economy.js'
import { applyCash, asMoney, parseNeeds } from './game-state.js'
import { withIdempotency } from './idempotency.js'
import { applyNeedDelta, type Needs } from './needs.js'
import { PLACES } from './places.js'
import { liveSpaceMoneyBlock } from './spaces-money.js'
import { clockFromGameTime, realGameTime } from './time.js'

/*
 * Clubs. Sazza is the first; Climax will reuse this with its own name and prices.
 *
 * - Open in the evening by the player's own game clock (8 PM to 4 AM).
 * - Entry is paid once per club night. A "club night" is one real game day (2.4 real
 *   hours), the same for everyone, so tonight's spender board and VIP passes line up.
 * - Inside, players are put into crowd groups of up to GROUP_SIZE; each player sees their
 *   own group (live positions come later), while the People list shows everyone inside.
 * - The app sends a heartbeat while you're inside; no heartbeat for 90 s = you've left.
 */

export type VenueItem = {
  id: string
  kind: 'dance' | 'drink' | 'vip' | 'bottle'
  name: string
  emoji: string
  price: number
  /** In-game minutes it takes. */
  minutes: number
  needs: Partial<Needs>
  /** Bottles are served in VIP only. */
  vipOnly?: boolean
}

export type Venue = {
  id: string
  /** 'hall' = a lecture hall: free to walk in, no buying or spraying, open by day. */
  kind?: 'club' | 'hall'
  name: string
  open: number
  close: number
  entry: number
  capacity: number
  /** Players per crowd group (each group only sees itself). Defaults to GROUP_SIZE. */
  groupSize?: number
  items: VenueItem[]
}

const DRINK: Partial<Needs> = { fun: 6, social: 4, hunger: 2 }

export const VENUES: Record<string, Venue> = {
  sazza: {
    id: 'sazza',
    name: 'Sazza',
    open: 20,
    close: 5, // clubs close at 5 AM game time; anyone still inside is sent home
    entry: 0, // free to walk in; you pay for drinks, VIP and bottles inside
    capacity: 200,
    items: [
      { id: 'dance', kind: 'dance', name: 'Dance', emoji: '💃', price: 0, minutes: 30, needs: { fun: 12, social: 8, energy: -8 } },
      { id: 'lager', kind: 'drink', name: 'Cold lager', emoji: '🍺', price: 10_000, minutes: 15, needs: DRINK },
      { id: 'chapman', kind: 'drink', name: 'Chapman', emoji: '🍹', price: 12_000, minutes: 15, needs: DRINK },
      { id: 'zobo-mix', kind: 'drink', name: 'Zobo mix', emoji: '🥤', price: 15_000, minutes: 15, needs: DRINK },
      { id: 'sazza-special', kind: 'drink', name: 'Sazza Special', emoji: '🍸', price: 20_000, minutes: 15, needs: { fun: 9, social: 6, hunger: 2 } },
      { id: 'vip', kind: 'vip', name: 'VIP lounge', emoji: '🛋️', price: 50_000, minutes: 5, needs: { social: 10 } },
      { id: 'azu', kind: 'bottle', name: 'Bottle of Azu', emoji: '🍾', price: 300_000, minutes: 20, needs: { fun: 15, social: 20 }, vipOnly: true },
      { id: 'ace', kind: 'bottle', name: 'Bottle of Ace', emoji: '🥂', price: 500_000, minutes: 20, needs: { fun: 20, social: 25 }, vipOnly: true },
    ],
  },
}

/*
 * Lecture halls and faculties share one 3D hall. As venues they're free, open 7 AM to 9 PM,
 * and put students into the same crowd groups as the club so each player sees a manageable
 * class (up to GROUP_SIZE) walking in and taking seats.
 */
const HALLS: [string, string][] = [
  ['hall-100', '100 Level Hall'],
  ['hall-200', '200 Level Hall'],
  ['etf-hall', 'ETF Hall'],
  ['mls-hall', 'MLS Hall'],
  ['twin-hall', 'Twin Hall'],
  ['cordelia-hall', 'Cordelia Agbebaku Hall'],
  ['education', 'Education'],
  ['mass-comm', 'Mass Comm'],
  ['law-campus', 'Law'],
  ['law-ext', 'Law (extension)'],
  ['physical-science', 'Physical Science'],
  ['social-science', 'Social Science'],
  ['life-science', 'Life Science'],
  ['management-science', 'Management Science'],
  ['engineering', 'Engineering'],
  // Offices (same free walk-in crowd as the halls)
  ['admin-block', 'Admin Block'],
  ['innovation-hub', 'Innovation Hub'],
]
for (const [id, name] of HALLS) {
  // Open all day: you can always walk in; the school day (class and exam hours) is in school-rules.ts
  VENUES[id] = { id, kind: 'hall', name, open: 0, close: 24, entry: 0, capacity: 1000, items: [] }
}

/*
 * Wise Gourmet: free walk-in food spot. Small groups of 5 so the people at the window and the
 * tables can actually talk to each other; the 6th player starts group 2, and so on.
 */
VENUES['wise-gourmet'] = { id: 'wise-gourmet', kind: 'hall', name: 'Wise Gourmet', open: 8, close: 22, entry: 0, capacity: 1000, groupSize: 5, items: [] }

/*
 * Every other public place (Bukka, shops, Market, Clinic, Park…) is a free walk-in venue too, so
 * the place sheet can show who's there and players can tap each other. Homes and hostel rooms
 * are private, so they're left out.
 */
const PRIVATE_PLACES = new Set(['home'])
for (const place of PLACES) {
  if (VENUES[place.id] || PRIVATE_PLACES.has(place.id) || place.type === 'hostel') continue
  const hours = place.openHours ?? { open: 0, close: 24 }
  VENUES[place.id] = { id: place.id, kind: 'hall', name: place.label, open: hours.open, close: hours.close, entry: 0, capacity: 1000, items: [] }
}

export const GROUP_SIZE = 18
export const groupSizeOf = (venueId: string) => VENUES[venueId]?.groupSize ?? GROUP_SIZE
const INSIDE_SECONDS = 90
/** One club night = one game day of real time (24 game hours at 10 game minutes per real minute). */
const NIGHT_MS = (24 * 60 * 60_000) / 10

export const nightKey = (now = Date.now()) => Math.floor(now / NIGHT_MS)

/** Clubs keep night hours (halls and cafés let you in any time). */
const isClub = (venue: Venue) => (venue.kind ?? 'club') === 'club'
const hoursOf = (venue: Venue) =>
  venue.open === 0 && venue.close === 24 ? 'Open 24 hours' : `${hourLabel(venue.open)} – ${hourLabel(venue.close)}`
const closedCopy = (venue: Venue) => `${venue.name} is closed. Opening hours: ${hoursOf(venue)}.`

function isOpen(venue: Venue, gameTime: number) {
  const { hour } = clockFromGameTime(gameTime)
  return venue.close < venue.open ? hour >= venue.open || hour < venue.close : hour >= venue.open && hour < venue.close
}

type Fail = { ok: false; error: string; code: number }
type Result = { status: number; body: unknown }
const bad = (status: number, code: string, error: string): Result => ({ status, body: { ok: false, code, error } })
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`

/** Tick the player's clock inside a transaction, then run with the row locked. */
async function withPlayer<T>(
  userId: string,
  run: (ctx: { client: PoolClient; characterId: string; gameTime: number; cash: number; needs: Needs }) => Promise<T>,
): Promise<T | Fail> {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return { ok: false, error: gate.error, code: gate.code }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { row } = await tickAndWeekly(client, gate.character, gate.traits)
    await client.query(`SELECT 1 FROM game_state WHERE character_id = $1 FOR UPDATE`, [gate.character.id])
    const result = await run({
      client,
      characterId: gate.character.id,
      gameTime: row.game_time,
      cash: asMoney(row.cash),
      needs: parseNeeds(row.needs),
    })
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

type Visit = { group_no: number; vip: boolean; spent: string | number }

async function visitOf(client: PoolClient, characterId: string, venueId: string, night: number) {
  const found = await client.query<Visit>(
    `SELECT group_no, vip, spent FROM venue_visits WHERE character_id = $1 AND venue_id = $2 AND night_key = $3`,
    [characterId, venueId, night],
  )
  return found.rows[0] ?? null
}

async function insideCount(venueId: string, night: number) {
  const found = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM venue_visits
     WHERE venue_id = $1 AND night_key = $2 AND last_seen_at > NOW() - make_interval(secs => $3)`,
    [venueId, night, INSIDE_SECONDS],
  )
  return Number(found.rows[0]?.n ?? 0)
}

async function topSpenders(venueId: string, night: number) {
  const found = await pool.query<{ username: string; display_name: string; spent: string }>(
    `SELECT u.username, u.username AS display_name, v.spent::text AS spent
     FROM venue_visits v
     JOIN characters c ON c.id = v.character_id
     JOIN users u ON u.id = c.user_id
     LEFT JOIN player_profiles pp ON pp.user_id = u.id
     WHERE v.venue_id = $1 AND v.night_key = $2 AND v.spent > 0
     ORDER BY v.spent DESC, v.entered_at ASC
     LIMIT 5`,
    [venueId, night],
  )
  return found.rows.map((r) => ({ username: r.username, displayName: r.display_name, spent: Number(r.spent) }))
}

/** Was this player seen inside in the last INSIDE_SECONDS (so they still hold their group spot)? */
async function stillInside(client: PoolClient, characterId: string, venueId: string, night: number) {
  const found = await client.query(
    `SELECT 1 FROM venue_visits
     WHERE character_id = $1 AND venue_id = $2 AND night_key = $3 AND last_seen_at > NOW() - make_interval(secs => $4)`,
    [characterId, venueId, night, INSIDE_SECONDS],
  )
  return (found.rowCount ?? 0) > 0
}

/** Lowest-numbered crowd group that still has room among people inside right now. */
async function pickGroup(client: PoolClient, venueId: string, night: number) {
  const groups = await client.query<{ group_no: number; n: string }>(
    `SELECT group_no, COUNT(*)::text AS n FROM venue_visits
     WHERE venue_id = $1 AND night_key = $2 AND last_seen_at > NOW() - make_interval(secs => $3)
     GROUP BY group_no`,
    [venueId, night, INSIDE_SECONDS],
  )
  const used = new Map(groups.rows.map((g) => [g.group_no, Number(g.n)]))
  const size = groupSizeOf(venueId)
  for (let g = 1; ; g++) if ((used.get(g) ?? 0) < size) return g
}

export async function getVenue(userId: string, venueId: string) {
  const venue = VENUES[venueId]
  if (!venue) return { ok: false as const, error: 'No such club.', code: 404 }
  const night = nightKey()
  const read = await withPlayer(userId, async ({ client, characterId, gameTime, cash }) => ({
    ok: true as const,
    visit: await visitOf(client, characterId, venueId, night),
    open: isOpen(venue, gameTime),
    cash,
  }))
  if (!read.ok) return read
  const [inside, top] = await Promise.all([insideCount(venueId, night), topSpenders(venueId, night)])
  return {
    ok: true as const,
    venue: {
      id: venue.id,
      name: venue.name,
      hours: hoursOf(venue),
      open: read.open,
      entry: venue.entry,
      items: venue.items,
    },
    me: read.visit
      ? { paid: true, vip: read.visit.vip, spent: Number(read.visit.spent), group: read.visit.group_no }
      : { paid: false, vip: false, spent: 0, group: null },
    cash: read.cash,
    inside,
    top,
  }
}

/** Pay the door (once per club night) and get put into a crowd group. */
export async function enterVenue(userId: string, venueId: string, key: string) {
  const venue = VENUES[venueId]
  if (!venue) return { ok: false as const, error: 'No such club.', code: 404 }
  const night = nightKey()
  return withPlayer(userId, async ({ client, characterId, gameTime }) =>
    withIdempotency(client, {
      userId,
      characterId,
      key,
      route: `venue:${venueId}:enter`,
      body: { venueId },
      run: async () => {
        // Halls and cafés let you in at any hour; clubs only during their night hours
        if (isClub(venue) && !isOpen(venue, gameTime)) return bad(400, 'CLOSED', closedCopy(venue))
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`venue:${venueId}:${night}`])
        const visit = await visitOf(client, characterId, venueId, night)
        if (visit) {
          // Small-group venues: someone who left may come back to a full group, so seat them again
          let group = visit.group_no
          if (venue.groupSize && !(await stillInside(client, characterId, venueId, night))) {
            group = await pickGroup(client, venueId, night)
          }
          await client.query(
            `UPDATE venue_visits SET last_seen_at = NOW(), group_no = $4 WHERE character_id = $1 AND venue_id = $2 AND night_key = $3`,
            [characterId, venueId, night, group],
          )
          return { status: 200, body: { ok: true, message: `Welcome back to ${venue.name}.`, group } }
        }
        if ((await insideCount(venueId, night)) >= venue.capacity) {
          return bad(409, 'FULL', `${venue.name} is packed right now. Try again in a bit.`)
        }
        // Free venues (lecture halls) skip the money step entirely
        const paid = venue.entry > 0
          ? await applyCash(client, characterId, -venue.entry, `${venueId}:entry`, 'purchase')
          : { ok: true as const, cash: undefined }
        if (!paid.ok) {
          return bad(400, 'INSUFFICIENT_FUNDS', `Entry is ₦${venue.entry.toLocaleString()}. Your wallet can't cover it yet.`)
        }
        const group = await pickGroup(client, venueId, night)
        await client.query(
          `INSERT INTO venue_visits (character_id, venue_id, night_key, group_no, spent, last_seen_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [characterId, venueId, night, group, venue.entry],
        )
        return { status: 200, body: { ok: true, message: `You're in. Welcome to ${venue.name}!`, group, cash: paid.cash } }
      },
    }),
  )
}

/** Dance, buy a drink, take the VIP lounge or pop a bottle. */
export async function buyAtVenue(userId: string, venueId: string, itemId: string, key: string) {
  const venue = VENUES[venueId]
  if (venue?.kind === 'hall') return { ok: false as const, error: 'Not in a lecture hall.', code: 400 }
  const item = venue?.items.find((i) => i.id === itemId)
  if (!venue || !item) return { ok: false as const, error: 'Not on the menu.', code: 404 }
  const night = nightKey()
  return withPlayer(userId, async ({ client, characterId, gameTime, needs }) =>
    withIdempotency(client, {
      userId,
      characterId,
      key,
      route: `venue:${venueId}:buy`,
      body: { venueId, itemId },
      run: async () => {
        const visit = await visitOf(client, characterId, venueId, night)
        if (!visit) return bad(403, 'NOT_INSIDE', `Pay the ₦${venue.entry.toLocaleString()} entry first.`)
        if (!isOpen(venue, gameTime)) return bad(400, 'CLOSED', `${venue.name} has closed for the night.`)
        if (item.kind === 'vip' && visit.vip) return bad(400, 'ALREADY_VIP', 'You already have the VIP lounge tonight.')
        if (item.vipOnly && !visit.vip) return bad(403, 'VIP_ONLY', 'Bottles are served in the VIP lounge. Get VIP first.')

        let cash: number | undefined
        if (item.price > 0) {
          const paid = await applyCash(client, characterId, -item.price, `${venueId}:${item.id}`, 'purchase')
          if (!paid.ok) return bad(400, 'INSUFFICIENT_FUNDS', `${item.name} is ₦${item.price.toLocaleString()}. Not enough in your wallet.`)
          cash = paid.cash
        }
        const nextNeeds = applyNeedDelta(needs, item.needs)
        await client.query(
          `UPDATE game_state SET needs = $2::jsonb, updated_at = NOW() WHERE character_id = $1`,
          [characterId, JSON.stringify(nextNeeds)],
        )
        await client.query(
          `UPDATE venue_visits SET spent = spent + $4, vip = vip OR $5, last_seen_at = NOW()
           WHERE character_id = $1 AND venue_id = $2 AND night_key = $3`,
          [characterId, venueId, night, item.price, item.kind === 'vip'],
        )
        const message =
          item.kind === 'dance'
            ? 'You danced up a storm!'
            : item.kind === 'vip'
              ? 'Welcome to the VIP lounge.'
              : item.kind === 'bottle'
                ? `${item.name} popped! Everybody saw that.`
                : `${item.name}: cheers!`
        return { status: 200, body: { ok: true, message, cash, needs: nextNeeds } }
      },
    }),
  )
}

/*
 * Social actions with someone where you are (an NPC or a player in your group), like Lagos Life:
 * Say Hello, Gist, Crack Joke (can flop), Compliment. Small need gains, a cooldown per person so
 * they can't be farmed, and the other player sees it live.
 */
export const SOCIAL_KINDS = {
  hello: { needs: { social: 4 } as Partial<Needs>, chance: 1 },
  gist: { needs: { fun: 4, social: 5 } as Partial<Needs>, chance: 1 },
  joke: { needs: { fun: 7, social: 4 } as Partial<Needs>, chance: 0.7 },
  compliment: { needs: { fun: 3, social: 6 } as Partial<Needs>, chance: 1 },
} as const
export type SocialKind = keyof typeof SOCIAL_KINDS

const SOCIAL_COOLDOWN_MS = 45_000
const socialSeen = new Map<string, number>()

export async function socialAtVenue(userId: string, venueId: string, kind: SocialKind, target: string, key: string) {
  const venue = VENUES[venueId]
  const def = SOCIAL_KINDS[kind]
  if (!venue || !def) return { ok: false as const, error: 'Not here.', code: 404 }
  const cooldownKey = `${userId}:${venueId}:${target}:${kind}`
  const last = socialSeen.get(cooldownKey) ?? 0
  if (Date.now() - last < SOCIAL_COOLDOWN_MS) {
    return { ok: false as const, error: 'Give them a moment before you do that again.', code: 429 }
  }
  const night = nightKey()
  let announce: (() => void) | null = null
  const result = await withPlayer(userId, async ({ client, characterId, needs }) =>
    withIdempotency(client, {
      userId,
      characterId,
      key,
      route: `venue:${venueId}:social`,
      body: { venueId, kind, target },
      run: async () => {
        const visit = await visitOf(client, characterId, venueId, night)
        if (!visit) return bad(403, 'NOT_INSIDE', `Go inside ${venue.name} first.`)
        const landed = Math.random() < def.chance
        // A flopped joke still costs a little pride
        const delta: Partial<Needs> = landed ? def.needs : { social: -2 }
        const nextNeeds = applyNeedDelta(needs, delta)
        await client.query(`UPDATE game_state SET needs = $2::jsonb, updated_at = NOW() WHERE character_id = $1`, [
          characterId,
          JSON.stringify(nextNeeds),
        ])
        // "Bond with 5 people" daily mission (players and NPCs both count)
        const mission = await missionProgress(client, characterId, 'bond', target)
        if (!target.startsWith('npc:')) {
          const group = visit.group_no
          announce = () => announceSocial(venueId, night, group, { from: userId, to: target, kind, landed })
        }
        return { status: 200, body: { ok: true, landed, needs: nextNeeds, mission } }
      },
    }),
  )
  if (result && 'status' in result && result.status === 200) {
    socialSeen.set(cooldownKey, Date.now())
    if (socialSeen.size > 50_000) socialSeen.clear()
    // `announce` is assigned inside the transaction callback
    ;(announce as (() => void) | null)?.()
  }
  return result
}

/** Amounts a player can spray (₦). */
export const SPRAY_AMOUNTS = [10_000, 50_000, 100_000, 500_000, 1_000_000]
/** How long the notes keep falling / can be picked. */
const SPRAY_SECONDS = 12

/** Split a spray into notes that add up to exactly the amount. */
export function splitSpray(amount: number): SprayNote[] {
  const count = amount <= 10_000 ? 10 : amount <= 50_000 ? 20 : 30
  const base = Math.floor(amount / count)
  return Array.from({ length: count }, (_, i) => ({ note: i, value: i === count - 1 ? amount - base * (count - 1) : base }))
}

/** Spray money on your crowd group: paid up front, then it rains for everyone to pick. */
export async function sprayAtVenue(userId: string, venueId: string, amount: number, key: string) {
  const venue = VENUES[venueId]
  if (venue?.kind === 'hall') return { ok: false as const, error: 'Not in a lecture hall.', code: 400 }
  if (!venue) return { ok: false as const, error: 'No such club.', code: 404 }
  if (!SPRAY_AMOUNTS.includes(amount)) return { ok: false as const, error: 'Pick an amount to spray.', code: 400 }
  const inSpace = await liveSpaceMoneyBlock([userId])
  if (inSpace) return { ok: false as const, error: inSpace, code: 409 }
  const night = nightKey()
  let announce: (() => void) | null = null
  const result = await withPlayer(userId, async ({ client, characterId, gameTime }) =>
    withIdempotency(client, {
      userId,
      characterId,
      key,
      route: `venue:${venueId}:spray`,
      body: { venueId, amount },
      run: async () => {
        const visit = await visitOf(client, characterId, venueId, night)
        if (!visit) return bad(403, 'NOT_INSIDE', `Pay the ₦${venue.entry.toLocaleString()} entry first.`)
        if (!isOpen(venue, gameTime)) return bad(400, 'CLOSED', `${venue.name} has closed for the night.`)
        const paid = await applyCash(client, characterId, -amount, `${venueId}:spray`, 'spray')
        if (!paid.ok) return bad(400, 'INSUFFICIENT_FUNDS', `You don't have ₦${amount.toLocaleString()} to spray.`)
        const sprayId = createId()
        const notes = splitSpray(amount)
        const endsAt = Date.now() + SPRAY_SECONDS * 1000
        await client.query(
          `INSERT INTO venue_sprays (id, venue_id, night_key, group_no, sprayer_id, amount, ends_at)
           VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0))`,
          [sprayId, venueId, night, visit.group_no, characterId, amount, endsAt],
        )
        await client.query(
          `INSERT INTO venue_spray_notes (spray_id, note_no, value)
           SELECT $1, n, v FROM unnest($2::int[], $3::bigint[]) AS t(n, v)`,
          [sprayId, notes.map((n) => n.note), notes.map((n) => n.value)],
        )
        await client.query(
          `UPDATE venue_visits SET spent = spent + $4, last_seen_at = NOW()
           WHERE character_id = $1 AND venue_id = $2 AND night_key = $3`,
          [characterId, venueId, night, amount],
        )
        const by = await client.query<{ display_name: string; username: string }>(
          `SELECT u.username AS display_name, u.username FROM users u
           LEFT JOIN player_profiles pp ON pp.user_id = u.id WHERE u.id = $1`,
          [userId],
        )
        const name = by.rows[0]?.display_name ?? 'Someone'
        const byUsername = by.rows[0]?.username ?? ''
        announce = () =>
          announceSpray(venueId, night, visit.group_no, { id: sprayId, by: name, byUsername, amount, notes, endsAt })
        return {
          status: 200,
          body: { ok: true, message: `You sprayed ₦${amount.toLocaleString()}! 💸`, cash: paid.cash, sprayId, notes, endsAt, by: name, byUsername },
        }
      },
    }),
  )
  // Only tell the room once the money has really moved
  ;(announce as (() => void) | null)?.()
  return result
}

/** Ticket for the live crowd socket (you must have paid entry tonight). */
export async function liveTicket(userId: string, venueId: string) {
  if (!VENUES[venueId]) return { ok: false as const, error: 'No such club.', code: 404 }
  const venue = VENUES[venueId]!
  if (isClub(venue) && !isOpen(venue, realGameTime())) return { ok: false as const, error: closedCopy(venue), code: 403 }
  const ticket = await createLiveTicket(userId, venueId, nightKey())
  if (!ticket) return { ok: false as const, error: 'Pay the entry first.', code: 403 }
  return { ok: true as const, ...ticket }
}

/** Still inside (sent every ~30 s while the club screen is open). */
export async function venueHeartbeat(userId: string, venueId: string, leaving = false) {
  const venue = VENUES[venueId]
  if (!venue) return { ok: false as const, error: 'No such club.', code: 404 }
  // Closing time: a club clears out, so a stale open tab can't keep someone counted inside
  const closed = isClub(venue) && !isOpen(venue, realGameTime())
  if (closed) leaving = true
  const found = await pool.query<{ id: string }>(`SELECT c.id FROM characters c WHERE c.user_id = $1`, [userId])
  const characterId = found.rows[0]?.id
  if (!characterId) return { ok: false as const, error: 'No character.', code: 409 }
  await pool.query(
    `UPDATE venue_visits SET last_seen_at = ${leaving ? 'NULL' : 'NOW()'}
     WHERE character_id = $1 AND venue_id = $2 AND night_key = $3`,
    [characterId, venueId, nightKey()],
  )
  return closed ? { ok: true as const, closed: true, message: `${venue.name} is closed, heading home.` } : { ok: true as const }
}

/** Everyone inside right now (all groups), newest first, a page at a time. */
export async function venuePeople(userId: string, venueId: string, offset: number) {
  if (!VENUES[venueId]) return { ok: false as const, error: 'No such club.', code: 404 }
  const night = nightKey()
  const me = await pool.query<{ group_no: number | null }>(
    `SELECT v.group_no FROM characters c
     LEFT JOIN venue_visits v ON v.character_id = c.id AND v.venue_id = $2 AND v.night_key = $3
     WHERE c.user_id = $1`,
    [userId, venueId, night],
  )
  const myGroup = me.rows[0]?.group_no ?? null
  const PAGE = 30
  const rows = await pool.query<{
    user_id: string
    username: string
    display_name: string
    appearance: unknown
    group_no: number
    vip: boolean
    spent: string
  }>(
    `SELECT u.id AS user_id, u.username, u.username AS display_name, c.appearance, v.group_no, v.vip, v.spent::text AS spent
     FROM venue_visits v
     JOIN characters c ON c.id = v.character_id
     JOIN users u ON u.id = c.user_id
     LEFT JOIN player_profiles pp ON pp.user_id = u.id
     WHERE v.venue_id = $1 AND v.night_key = $2 AND v.last_seen_at > NOW() - make_interval(secs => $3)
     ORDER BY v.vip DESC, v.spent DESC, v.entered_at DESC
     LIMIT $4 OFFSET $5`,
    [venueId, night, INSIDE_SECONDS, PAGE + 1, Math.max(0, offset)],
  )
  const more = rows.rows.length > PAGE
  return {
    ok: true as const,
    total: await insideCount(venueId, night),
    people: rows.rows.slice(0, PAGE).map((r) => ({
      userId: r.user_id,
      username: r.username,
      displayName: r.display_name,
      appearance: r.appearance,
      vip: r.vip,
      spent: Number(r.spent),
      sameGroup: myGroup != null && r.group_no === myGroup,
    })),
    next: more ? offset + PAGE : null,
  }
}
