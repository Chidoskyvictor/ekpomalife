/** mirror lib/game/phone.ts — shared ids/constants + server phone domain */

import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import {
  BAD_BUNDLE,
  BAD_PLACE,
  BATTERY_DEAD,
  CLOSED,
  INSUFFICIENT_FUNDS,
  NO_PHONE,
  NOT_AT_HOSTEL,
  PHONE_ERROR_COPY,
  SAME_PLACE,
} from './economy-codes.js'
import { requireEconomySetup } from './economy.js'
import {
  applyCash,
  asMoney,
  ensureGameState,
  getPublicState,
  tickGameState,
  type GameStateRow,
} from './game-state.js'
import { withIdempotency } from './idempotency.js'
import { dayFromGameTime } from './calendar.js'
import { getPlace, hopDistance, PLACE_IDS } from './places.js'
import { clockFromGameTime, isOpenAt } from './time.js'
import type { TraitId } from './traits.js'
import { lodgingDecayMultiplier } from './lodging.js'
import { ensureRentRow, mapRentPublic } from './rent-ladder.js'

export type PhoneAppId =
  | 'jobs'
  | 'bank'
  | 'messages'
  | 'gist'
  | 'market'
  | 'ride'
  | 'map'
  | 'calendar'
  | 'portal'
  | 'music'
  | 'games'
  | 'settings'

export type WallpaperId = 'aau-dusk' | 'ekpoma-night' | 'harmattan' | 'green-white'

export type DataBundleId = 'data-100' | 'data-350' | 'data-1000'

export const DATA_BUNDLES = [
  { id: 'data-100', label: '100MB · 1 day', mb: 100, price: 100 },
  { id: 'data-350', label: '350MB · 3 days', mb: 350, price: 300 },
  { id: 'data-1000', label: '1GB · 7 days', mb: 1000, price: 750 },
] as const

export type RideMode = 'keke' | 'okada'

export const RIDE_BASE = { keke: 150, okada: 250 } as const
export const RIDE_PER_HOP = { keke: 50, okada: 80 } as const
export const RIDE_MINUTES = { keke: 20, okada: 10 } as const

export const BATTERY = {
  drainPerAppOpen: 1,
  drainPerGameHour: 2,
  chargePerGameMinuteAtHostel: 1,
  lowAt: 20,
} as const

export const DATA_COST_MB: Partial<Record<PhoneAppId, number>> = {
  gist: 2,
  messages: 1,
  music: 5,
  games: 3,
  map: 1,
}

export const HOSTEL_PLACE_IDS = [
  'school-hostels-1',
  'school-hostels-2',
  'off-campus-hostels',
] as const

/** Real room furniture ids (sql/009) — ×2 charge when owned. */
export const CHARGE_BOOST_ITEM_IDS = ['rechargeable-lamp', 'small-gen'] as const

export const PHONE_APP_IDS = [
  'jobs',
  'bank',
  'messages',
  'gist',
  'market',
  'ride',
  'map',
  'calendar',
  'portal',
  'music',
  'games',
  'settings',
] as const satisfies readonly PhoneAppId[]

export const WALLPAPER_IDS = [
  'aau-dusk',
  'ekpoma-night',
  'harmattan',
  'green-white',
] as const satisfies readonly WallpaperId[]

export type PhoneState = {
  battery: number
  charging: boolean
  dataMb: number
  wallpaper: WallpaperId
  unread: Partial<Record<PhoneAppId, number>>
  newApps: PhoneAppId[]
}

export type PhoneClock = {
  gameTime: number
  day: number
  hour: number
  minute: number
  period: string
  label: string
}

export type PhonePromo = {
  id: string
  title: string
  subtitle: string
  cta: string
  emoji: string
  action: { type: 'app'; appId: PhoneAppId } | { type: 'place'; placeId: string }
}

export type PhoneRow = {
  character_id: string
  battery: number
  charging: boolean
  battery_game_time: number
  data_mb: number
  wallpaper: string
  unread: unknown
  new_apps: string[] | null
  last_bank_seen_at: Date
  updated_at: Date
}

type Fail = { ok: false; error: string; code: string; status: number }

function fail(code: string, status = 400): Fail {
  return {
    ok: false,
    error: PHONE_ERROR_COPY[code] ?? code,
    code,
    status,
  }
}

function isHostel(placeId: string | null | undefined): boolean {
  return !!placeId && (HOSTEL_PLACE_IDS as readonly string[]).includes(placeId)
}

function parseUnread(raw: unknown): Partial<Record<PhoneAppId, number>> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Partial<Record<PhoneAppId, number>> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if ((PHONE_APP_IDS as readonly string[]).includes(k) && typeof v === 'number' && v > 0) {
      out[k as PhoneAppId] = Math.floor(v)
    }
  }
  return out
}

function parseNewApps(raw: string[] | null | undefined): PhoneAppId[] {
  if (!raw?.length) return []
  return raw.filter((id): id is PhoneAppId => (PHONE_APP_IDS as readonly string[]).includes(id))
}

function parseWallpaper(raw: string): WallpaperId {
  if ((WALLPAPER_IDS as readonly string[]).includes(raw)) return raw as WallpaperId
  return 'aau-dusk'
}

export function toPhoneState(row: {
  battery: number
  charging: boolean
  data_mb: number
  wallpaper: string
  unread: unknown
  new_apps: string[] | null
}): PhoneState {
  return {
    battery: Math.max(0, Math.min(100, Math.floor(row.battery))),
    charging: !!row.charging,
    dataMb: Math.max(0, Math.floor(row.data_mb)),
    wallpaper: parseWallpaper(row.wallpaper),
    unread: parseUnread(row.unread),
    newApps: parseNewApps(row.new_apps),
  }
}

/**
 * Pure battery recompute from absolute game minutes.
 * Charge boost: owns rechargeable-lamp or small-gen (room furniture).
 */
export function recomputeBattery(
  row: {
    battery: number
    charging: boolean
    battery_game_time: number
  },
  gameTimeNow: number,
  placeId: string | null,
  items: ReadonlySet<string>,
): { battery: number; charging: boolean; battery_game_time: number } {
  const elapsed = Math.max(0, gameTimeNow - row.battery_game_time)
  let battery = Math.max(0, Math.min(100, Math.floor(row.battery)))
  let charging = row.charging
  const atHostel = isHostel(placeId)
  const boost = CHARGE_BOOST_ITEM_IDS.some((id) => items.has(id))
  const chargeRate = BATTERY.chargePerGameMinuteAtHostel * (boost ? 2 : 1)

  if (charging && !atHostel) {
    charging = false
  }

  if (elapsed > 0) {
    if (charging && atHostel) {
      battery = Math.min(100, battery + elapsed * chargeRate)
      if (battery >= 100) {
        battery = 100
        charging = false
      }
    } else {
      const hours = Math.floor(elapsed / 60)
      if (hours > 0) {
        battery = Math.max(0, battery - hours * BATTERY.drainPerGameHour)
      }
    }
  }

  return {
    battery,
    charging,
    battery_game_time: gameTimeNow,
  }
}

export function rideQuote(
  fromPlaceId: string,
  toPlaceId: string,
):
  | { ok: true; from: string; to: string; quotes: { mode: RideMode; fare: number; minutes: number }[] }
  | { ok: false; code: typeof SAME_PLACE | typeof BAD_PLACE; error: string } {
  if (!getPlace(fromPlaceId) || !getPlace(toPlaceId) || !PLACE_IDS.includes(toPlaceId)) {
    return { ok: false, code: BAD_PLACE, error: PHONE_ERROR_COPY.BAD_PLACE }
  }
  if (fromPlaceId === toPlaceId) {
    return { ok: false, code: SAME_PLACE, error: PHONE_ERROR_COPY.SAME_PLACE }
  }
  const hops = hopDistance(fromPlaceId, toPlaceId)
  if (hops == null) {
    return { ok: false, code: BAD_PLACE, error: PHONE_ERROR_COPY.BAD_PLACE }
  }
  const modes: RideMode[] = ['keke', 'okada']
  return {
    ok: true,
    from: fromPlaceId,
    to: toPlaceId,
    quotes: modes.map((mode) => ({
      mode,
      fare: RIDE_BASE[mode] + RIDE_PER_HOP[mode] * hops,
      minutes: RIDE_MINUTES[mode],
    })),
  }
}

export async function hasPhone(client: PoolClient, characterId: string): Promise<boolean> {
  const found = await client.query(
    `SELECT 1 FROM inventory i
     JOIN shop_items s ON s.id = i.item_id
     WHERE i.character_id = $1 AND i.qty > 0 AND s.category = 'phone'
     LIMIT 1`,
    [characterId],
  )
  return (found.rowCount ?? 0) > 0
}

export async function ensurePhoneRow(
  client: PoolClient,
  characterId: string,
  gameTime = 0,
): Promise<PhoneRow> {
  await client.query(
    `INSERT INTO phone_state (character_id, battery_game_time)
     VALUES ($1, $2)
     ON CONFLICT (character_id) DO NOTHING`,
    [characterId, gameTime],
  )
  const row = await client.query<PhoneRow>(
    `SELECT character_id, battery, charging, battery_game_time, data_mb, wallpaper,
            unread, new_apps, last_bank_seen_at, updated_at
     FROM phone_state WHERE character_id = $1`,
    [characterId],
  )
  return row.rows[0]!
}

async function loadChargeBoostItems(client: PoolClient, characterId: string): Promise<Set<string>> {
  const rows = await client.query<{ item_id: string }>(
    `SELECT item_id FROM room_items
     WHERE character_id = $1 AND item_id = ANY($2::text[])`,
    [characterId, [...CHARGE_BOOST_ITEM_IDS]],
  )
  return new Set(rows.rows.map((r) => r.item_id))
}

async function persistPhone(
  client: PoolClient,
  characterId: string,
  patch: {
    battery: number
    charging: boolean
    battery_game_time: number
    data_mb?: number
    wallpaper?: string
    unread?: Partial<Record<PhoneAppId, number>>
    new_apps?: PhoneAppId[]
    last_bank_seen_at?: Date
  },
): Promise<PhoneRow> {
  const updated = await client.query<PhoneRow>(
    `UPDATE phone_state SET
       battery = $2,
       charging = $3,
       battery_game_time = $4,
       data_mb = COALESCE($5, data_mb),
       wallpaper = COALESCE($6, wallpaper),
       unread = COALESCE($7::jsonb, unread),
       new_apps = COALESCE($8::text[], new_apps),
       last_bank_seen_at = COALESCE($9, last_bank_seen_at),
       updated_at = NOW()
     WHERE character_id = $1
     RETURNING character_id, battery, charging, battery_game_time, data_mb, wallpaper,
               unread, new_apps, last_bank_seen_at, updated_at`,
    [
      characterId,
      patch.battery,
      patch.charging,
      patch.battery_game_time,
      patch.data_mb ?? null,
      patch.wallpaper ?? null,
      patch.unread ? JSON.stringify(patch.unread) : null,
      patch.new_apps ?? null,
      patch.last_bank_seen_at ?? null,
    ],
  )
  return updated.rows[0]!
}

async function tickAndLoad(
  client: PoolClient,
  character: {
    id: string
    lodging_id: string | null
    starting_cash: string | number | null
    cash: string | number | null
  },
  traits: TraitId[],
): Promise<{ row: GameStateRow; phone: PhoneRow; items: Set<string> }> {
  let row = await ensureGameState(client, character.id, {
    cash: asMoney(character.starting_cash ?? character.cash),
    lodgingId: character.lodging_id,
  })
  const decayMult = lodgingDecayMultiplier(character.lodging_id)
  row = await tickGameState(client, row, traits, new Date(), decayMult)

  const locked = await client.query<GameStateRow>(
    `SELECT character_id, cash, needs, location_id, game_time, last_tick_at, version,
            hustle_lockout_until, reputation, pending_toast
     FROM game_state WHERE character_id = $1 FOR UPDATE`,
    [character.id],
  )
  row = locked.rows[0] ?? row

  let phone = await ensurePhoneRow(client, character.id, row.game_time)
  const items = await loadChargeBoostItems(client, character.id)
  const next = recomputeBattery(phone, row.game_time, row.location_id, items)
  phone = await persistPhone(client, character.id, next)
  return { row, phone, items }
}

const PROMOS: PhonePromo[] = [
  {
    id: 'promo-jobs',
    title: 'Shift dey available',
    subtitle: 'Campus Shop POS — quick naira',
    cta: 'Open Jobs',
    emoji: '💼',
    action: { type: 'app', appId: 'jobs' },
  },
  {
    id: 'promo-ride',
    title: 'Keke ready',
    subtitle: 'Beat the sun — book a ride',
    cta: 'Open Ride',
    emoji: '🛺',
    action: { type: 'app', appId: 'ride' },
  },
  {
    id: 'promo-market',
    title: 'Ekpoma Market',
    subtitle: 'Fresh stock for hostel life',
    cta: 'Go Market',
    emoji: '🛒',
    action: { type: 'place', placeId: 'market' },
  },
]

function phoneClock(gameTime: number): PhoneClock {
  const c = clockFromGameTime(gameTime)
  return {
    gameTime,
    day: c.day,
    hour: c.hour,
    minute: c.minute,
    period: c.period,
    label: c.timeLabel,
  }
}

export async function getPhone(userId: string) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (!(await hasPhone(client, gate.character.id))) {
      await client.query('ROLLBACK')
      return { ...fail(NO_PHONE, 403) }
    }
    const { row, phone } = await tickAndLoad(client, gate.character, gate.traits)
    await client.query('COMMIT')

    const place = getPlace(row.location_id)
    return {
      ok: true as const,
      phone: toPhoneState(phone),
      clock: phoneClock(row.game_time),
      location: {
        placeId: row.location_id,
        label: place?.label ?? 'Ekpoma',
        town: 'Ekpoma, Edo' as const,
      },
      promos: PROMOS,
      bundles: DATA_BUNDLES,
      cash: asMoney(row.cash),
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function buyData(userId: string, bundleId: string, idempotencyKey: string) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate

  const bundle = DATA_BUNDLES.find((b) => b.id === bundleId)
  if (!bundle) return fail(BAD_BUNDLE)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (!(await hasPhone(client, gate.character.id))) {
      await client.query('ROLLBACK')
      return { ...fail(NO_PHONE, 403) }
    }

    const result = await withIdempotency(client, {
      userId,
      characterId: gate.character.id,
      key: idempotencyKey,
      route: 'POST /phone/data/buy',
      body: { bundleId },
      run: async () => {
        const { row, phone } = await tickAndLoad(client, gate.character, gate.traits)
        const wrote = await applyCash(
          client,
          gate.character.id,
          -bundle.price,
          `Data bundle ${bundle.mb}MB`,
          'phone_data',
        )
        if (!wrote.ok) {
          return {
            status: 400,
            body: {
              ok: false,
              error: PHONE_ERROR_COPY.INSUFFICIENT_FUNDS,
              code: INSUFFICIENT_FUNDS,
            },
          }
        }
        const nextPhone = await persistPhone(client, gate.character.id, {
          battery: phone.battery,
          charging: phone.charging,
          battery_game_time: phone.battery_game_time,
          data_mb: phone.data_mb + bundle.mb,
        })
        return {
          status: 200,
          body: {
            ok: true,
            phone: toPhoneState(nextPhone),
            cash: wrote.cash,
            ledgerId: wrote.ledgerId,
            message: `${bundle.label} loaded. You get ${bundle.mb}MB.`,
            replayed: false,
            _gameTime: row.game_time,
          },
        }
      },
    })

    await client.query('COMMIT')
    const body = result.body as Record<string, unknown>
    if (body.ok !== true) {
      return {
        ok: false as const,
        error: (body.error as string) ?? PHONE_ERROR_COPY.INSUFFICIENT_FUNDS,
        code: (body.code as string) ?? INSUFFICIENT_FUNDS,
        status: result.status,
      }
    }
    const { _gameTime: _, ...rest } = body
    return {
      ok: true as const,
      phone: rest.phone as PhoneState,
      cash: rest.cash as number,
      ledgerId: rest.ledgerId as string,
      message: rest.message as string,
      replayed: !!result.replay,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function charge(userId: string, action: 'start' | 'stop') {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (!(await hasPhone(client, gate.character.id))) {
      await client.query('ROLLBACK')
      return { ...fail(NO_PHONE, 403) }
    }
    const { row, phone, items } = await tickAndLoad(client, gate.character, gate.traits)

    if (action === 'start') {
      if (!isHostel(row.location_id)) {
        await client.query('ROLLBACK')
        return fail(NOT_AT_HOSTEL)
      }
      const next = recomputeBattery(
        { ...phone, charging: true },
        row.game_time,
        row.location_id,
        items,
      )
      const saved = await persistPhone(client, gate.character.id, next)
      await client.query('COMMIT')
      const boost = CHARGE_BOOST_ITEM_IDS.some((id) => items.has(id))
      return {
        ok: true as const,
        phone: toPhoneState(saved),
        message: boost
          ? 'Charging with your lamp/gen — double speed.'
          : 'Phone dey charge. Light na part of rent.',
      }
    }

    const saved = await persistPhone(client, gate.character.id, {
      battery: phone.battery,
      charging: false,
      battery_game_time: phone.battery_game_time,
    })
    await client.query('COMMIT')
    return {
      ok: true as const,
      phone: toPhoneState(saved),
      message: 'Charge stop. Battery locked in.',
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function openApp(userId: string, appId: PhoneAppId) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (!(await hasPhone(client, gate.character.id))) {
      await client.query('ROLLBACK')
      return { ...fail(NO_PHONE, 403) }
    }
    const { row, phone } = await tickAndLoad(client, gate.character, gate.traits)
    if (phone.battery <= 0) {
      await client.query('ROLLBACK')
      return fail(BATTERY_DEAD)
    }

    const dataCost = DATA_COST_MB[appId] ?? 0
    const offline = dataCost > 0 && phone.data_mb < dataCost
    const nextData = offline ? phone.data_mb : Math.max(0, phone.data_mb - dataCost)
    const nextBattery = Math.max(0, phone.battery - BATTERY.drainPerAppOpen)
    const unread = { ...parseUnread(phone.unread) }
    delete unread[appId]
    const newApps = parseNewApps(phone.new_apps).filter((id) => id !== appId)

    const saved = await persistPhone(client, gate.character.id, {
      battery: nextBattery,
      charging: phone.charging && nextBattery < 100,
      battery_game_time: row.game_time,
      data_mb: nextData,
      unread,
      new_apps: newApps,
      last_bank_seen_at: appId === 'bank' ? new Date() : undefined,
    })
    await client.query('COMMIT')
    return { ok: true as const, phone: toPhoneState(saved), offline }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function setWallpaper(userId: string, wallpaper: WallpaperId) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (!(await hasPhone(client, gate.character.id))) {
      await client.query('ROLLBACK')
      return { ...fail(NO_PHONE, 403) }
    }
    const { row, phone } = await tickAndLoad(client, gate.character, gate.traits)
    const saved = await persistPhone(client, gate.character.id, {
      battery: phone.battery,
      charging: phone.charging,
      battery_game_time: row.game_time,
      wallpaper,
    })
    await client.query('COMMIT')
    return { ok: true as const, phone: toPhoneState(saved) }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export type PhoneNotificationItem = {
  id: string
  appId: PhoneAppId
  title: string
  body: string
  createdAt: string
}

export async function listNotifications(userId: string) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (!(await hasPhone(client, gate.character.id))) {
      await client.query('ROLLBACK')
      return { ...fail(NO_PHONE, 403) }
    }
    const { row, phone } = await tickAndLoad(client, gate.character, gate.traits)
    const day = dayFromGameTime(row.game_time)
    const items: PhoneNotificationItem[] = []

    await ensureRentRow(client, gate.character.id, gate.character.lodging_id, row.game_time)
    const rentQ = await client.query(
      `SELECT character_id, lodging_id, amount, due_at, paid_until, status, label,
              warnings, last_warned_at, evicted_at, message, due_game_day, paid_until_game_day
       FROM rent WHERE character_id = $1`,
      [gate.character.id],
    )
    const rentRow = rentQ.rows[0]
    if (rentRow) {
      const rent = mapRentPublic(rentRow as Parameters<typeof mapRentPublic>[0])
      const dueDay = rentRow.due_game_day ?? day
      const daysLeft = dueDay - day
      if (daysLeft <= 2 && rent.status !== 'ok') {
        items.push({
          id: `rent-${dueDay}`,
          appId: 'calendar',
          title: 'Rent soon',
          body:
            daysLeft <= 0
              ? `${rent.label} dey wait for ₦${rent.amount.toLocaleString()}.`
              : `Rent due in ${daysLeft} day${daysLeft === 1 ? '' : 's'} — ₦${rent.amount.toLocaleString()}.`,
          createdAt: new Date().toISOString(),
        })
      }
    }

    const jobs = await client.query<{ id: string; title: string }>(
      `SELECT j.id, j.title FROM jobs j
       WHERE NOT EXISTS (
         SELECT 1 FROM player_jobs pj
         WHERE pj.character_id = $1 AND pj.job_id = j.id
       )
       ORDER BY j.title ASC
       LIMIT 5`,
      [gate.character.id],
    )
    for (const job of jobs.rows) {
      items.push({
        id: `job-${job.id}`,
        appId: 'jobs',
        title: 'Job open',
        body: `${job.title} dey available. Apply sharp.`,
        createdAt: new Date().toISOString(),
      })
    }

    const ledger = await client.query<{
      id: string
      reason: string
      amount: string | number
      created_at: Date
    }>(
      `SELECT id, reason, amount, created_at FROM ledger
       WHERE character_id = $1 AND created_at > $2
       ORDER BY created_at DESC
       LIMIT 10`,
      [gate.character.id, phone.last_bank_seen_at],
    )
    for (const entry of ledger.rows) {
      const amt = asMoney(entry.amount)
      items.push({
        id: `ledger-${entry.id}`,
        appId: 'bank',
        title: amt >= 0 ? 'Money in' : 'Money out',
        body: `${entry.reason}: ${amt >= 0 ? '+' : ''}₦${Math.abs(amt).toLocaleString()}`,
        createdAt: new Date(entry.created_at).toISOString(),
      })
    }

    items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    const trimmed = items.slice(0, 20)

    const unread: Partial<Record<PhoneAppId, number>> = {}
    for (const item of trimmed) {
      unread[item.appId] = (unread[item.appId] ?? 0) + 1
    }
    const saved = await persistPhone(client, gate.character.id, {
      battery: phone.battery,
      charging: phone.charging,
      battery_game_time: phone.battery_game_time,
      unread,
      new_apps: parseNewApps(phone.new_apps),
    })
    await client.query('COMMIT')

    return {
      ok: true as const,
      unread: toPhoneState(saved).unread,
      newApps: toPhoneState(saved).newApps,
      items: trimmed,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function getRideQuote(userId: string, toPlaceId: string) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { row } = await tickAndLoad(client, gate.character, gate.traits)
    await client.query('COMMIT')
    const quoted = rideQuote(row.location_id, toPlaceId)
    if (!quoted.ok) {
      return { ok: false as const, error: quoted.error, code: quoted.code, status: 400 }
    }
    return {
      ok: true as const,
      from: quoted.from,
      to: quoted.to,
      quotes: quoted.quotes,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function takeRide(
  userId: string,
  toPlaceId: string,
  mode: RideMode,
  idempotencyKey: string,
) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const result = await withIdempotency(client, {
      userId,
      characterId: gate.character.id,
      key: idempotencyKey,
      route: 'POST /ride',
      body: { to: toPlaceId, mode },
      run: async () => {
        const { row } = await tickAndLoad(client, gate.character, gate.traits)
        const quoted = rideQuote(row.location_id, toPlaceId)
        if (!quoted.ok) {
          return {
            status: 400,
            body: { ok: false, error: quoted.error, code: quoted.code },
          }
        }
        const clock = clockFromGameTime(row.game_time)
        const keke = getPlace('keke-park')
        if (!isOpenAt(keke?.openHours, clock.hour)) {
          return {
            status: 400,
            body: { ok: false, error: PHONE_ERROR_COPY.CLOSED, code: CLOSED },
          }
        }
        const quote = quoted.quotes.find((q) => q.mode === mode)
        if (!quote) {
          return {
            status: 400,
            body: { ok: false, error: PHONE_ERROR_COPY.BAD_PLACE, code: BAD_PLACE },
          }
        }
        const dest = getPlace(toPlaceId)!
        const reason = `${mode === 'keke' ? 'Keke' : 'Okada'} to ${dest.label}`
        const wrote = await applyCash(client, gate.character.id, -quote.fare, reason, 'ride')
        if (!wrote.ok) {
          return {
            status: 400,
            body: {
              ok: false,
              error: PHONE_ERROR_COPY.INSUFFICIENT_FUNDS,
              code: INSUFFICIENT_FUNDS,
            },
          }
        }
        const nextTime = row.game_time + quote.minutes
        await client.query(
          `UPDATE game_state
           SET location_id = $2, game_time = $3, version = $4, updated_at = NOW()
           WHERE character_id = $1`,
          [gate.character.id, toPlaceId, nextTime, wrote.version],
        )
        return {
          status: 200,
          body: {
            ok: true,
            fare: quote.fare,
            cash: wrote.cash,
            ledgerId: wrote.ledgerId,
            message: `Took ${mode} to ${dest.label} (₦${quote.fare.toLocaleString()})`,
            replayed: false,
            _needState: true,
          },
        }
      },
    })

    await client.query('COMMIT')
    const body = result.body as Record<string, unknown>
    if (body.ok !== true) {
      return {
        ok: false as const,
        error: (body.error as string) ?? 'Could not book that ride.',
        code: (body.code as string) ?? BAD_PLACE,
        status: result.status,
      }
    }

    const state = await getPublicState(userId)
    if (!state.ok) return state
    return {
      ok: true as const,
      state: { ok: true as const, ...state.state },
      fare: body.fare as number,
      cash: body.cash as number,
      ledgerId: body.ledgerId as string,
      message: body.message as string,
      replayed: !!result.replay,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/** Response key sets for contract snapshot tests. */
export const PHONE_CONTRACT_KEYS = {
  getPhone: [
    'ok',
    'phone',
    'clock',
    'location',
    'promos',
    'bundles',
    'cash',
  ] as const,
  buyData: ['ok', 'phone', 'cash', 'ledgerId', 'message', 'replayed'] as const,
  charge: ['ok', 'phone', 'message'] as const,
  openApp: ['ok', 'phone', 'offline'] as const,
  setWallpaper: ['ok', 'phone'] as const,
  notifications: ['ok', 'unread', 'newApps', 'items'] as const,
  rideQuote: ['ok', 'from', 'to', 'quotes'] as const,
  takeRide: ['ok', 'state', 'fare', 'cash', 'ledgerId', 'message', 'replayed'] as const,
  phoneState: [
    'battery',
    'charging',
    'dataMb',
    'wallpaper',
    'unread',
    'newApps',
  ] as const,
}
