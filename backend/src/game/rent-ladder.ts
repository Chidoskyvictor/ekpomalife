import type { PoolClient } from 'pg'
import {
  dayFromGameTime,
  displayDateForGameDay,
  gameWeekFromDay,
  nextRentDay,
  rentDayForWeek,
} from './calendar.js'
import {
  EVICTION_LODGING_ID,
  normalizeLodgingId,
  rentWeeklyForLodging,
} from './lodging.js'
import { startPlaceForLodging } from './places.js'

export type RentStatus = 'ok' | 'due' | 'late' | 'evicted'

export type RentPublic = {
  lodgingId: string
  amount: number
  dueAt: string
  paidUntil: string
  status: RentStatus
  label: string
  warnings: number
  lastWarnedAt: string | null
  evictedAt: string | null
  message: string | null
}

type RentRow = {
  character_id: string
  lodging_id: string
  amount: string | number
  due_at: Date
  paid_until: Date
  status: string
  label: string
  warnings: number
  last_warned_at: Date | null
  evicted_at: Date | null
  due_game_day: number | null
  paid_until_game_day: number | null
  message: string | null
}

function asInt(value: string | number | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  if (typeof value === 'string' && value.trim()) {
    const n = Number.parseInt(value, 10)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function mapRentPublic(row: RentRow): RentPublic {
  const dueDay = row.due_game_day ?? 1
  const paidDay = row.paid_until_game_day ?? dueDay
  return {
    lodgingId: row.lodging_id,
    amount: asInt(row.amount),
    dueAt: displayDateForGameDay(dueDay),
    paidUntil: displayDateForGameDay(paidDay),
    status: (row.status as RentStatus) || 'due',
    label: row.label || 'Baba Landlord',
    warnings: row.warnings ?? 0,
    lastWarnedAt: iso(row.last_warned_at),
    evictedAt: iso(row.evicted_at),
    message: row.message,
  }
}

/**
 * Moving a save onto the real clock (its game day jumps from ~15 to the real date): start rent
 * fresh on the real calendar (next Saturday due, no warnings) instead of counting the jump as
 * weeks of unpaid rent, and mark the skipped weeks (and this one) as already paid out so four
 * allowances don't land at once; pay starts again next Monday. Evicted players stay evicted.
 */
export async function rebaseRentToRealClock(client: PoolClient, characterId: string, gameTime: number) {
  const day = dayFromGameTime(gameTime)
  const dueDay = nextRentDay(day)
  const paidUntilDay = Math.max(1, dueDay - 7)
  await client.query(
    `UPDATE rent
     SET due_game_day = $2, paid_until_game_day = $3, due_at = $4::timestamptz, paid_until = $5::timestamptz,
         warnings = 0, status = 'ok', message = NULL, last_warned_at = NULL
     WHERE character_id = $1 AND evicted_at IS NULL`,
    [characterId, dueDay, paidUntilDay, displayDateForGameDay(dueDay), displayDateForGameDay(paidUntilDay)],
  )
  const week = gameWeekFromDay(day)
  await client.query(
    `INSERT INTO payouts (character_id, kind, game_week, amount)
     SELECT $1, kind, w, 0
     FROM unnest($2::text[]) AS kind, generate_series($3::int, $4::int) AS w
     ON CONFLICT (character_id, kind, game_week) DO NOTHING`,
    [characterId, ['allowance', 'landlord_income'], Math.max(0, week - 4), week],
  )
}

export async function ensureRentRow(
  client: PoolClient,
  characterId: string,
  lodgingId: string | null | undefined,
  gameTime: number,
) {
  const lodging = normalizeLodgingId(lodgingId)
  const amount = rentWeeklyForLodging(lodging)
  const existing = await client.query(`SELECT character_id FROM rent WHERE character_id = $1`, [
    characterId,
  ])
  if (existing.rows[0]) return

  const day = dayFromGameTime(gameTime)
  const dueDay = nextRentDay(day)
  const paidUntilDay = Math.max(1, dueDay - 7)

  await client.query(
    `INSERT INTO rent (
       character_id, lodging_id, amount, due_at, paid_until, status, label,
       warnings, due_game_day, paid_until_game_day, message
     ) VALUES (
       $1, $2, $3, $4::timestamptz, $5::timestamptz, 'due', 'Baba Landlord',
       0, $6, $7, NULL
     )`,
    [
      characterId,
      lodging,
      amount,
      displayDateForGameDay(dueDay),
      displayDateForGameDay(paidUntilDay),
      dueDay,
      paidUntilDay,
    ],
  )
}

/**
 * Advance rent ladder from game calendar. Does NOT auto-take cash.
 * Overdue Saturdays: warning 1 → warning 2 → eviction to Off-campus Hostels.
 */
export async function advanceRentLadder(
  client: PoolClient,
  opts: { characterId: string; gameTime: number; lodgingId?: string | null },
): Promise<{ notices: string[]; rent: RentPublic | null }> {
  const day = dayFromGameTime(opts.gameTime)
  const lodgingFromChar = await client.query<{ lodging_id: string | null }>(
    `SELECT lodging_id FROM characters WHERE id = $1`,
    [opts.characterId],
  )
  await ensureRentRow(
    client,
    opts.characterId,
    opts.lodgingId ?? lodgingFromChar.rows[0]?.lodging_id,
    opts.gameTime,
  )

  const found = await client.query<RentRow>(
    `SELECT * FROM rent WHERE character_id = $1 FOR UPDATE`,
    [opts.characterId],
  )
  let row = found.rows[0]
  if (!row) return { notices: [], rent: null }

  // Backfill game-day columns for rows created before 008.
  if (row.due_game_day == null) {
    const dueDay = nextRentDay(day)
    await client.query(
      `UPDATE rent SET due_game_day = $2, paid_until_game_day = $3,
         due_at = $4::timestamptz, paid_until = $5::timestamptz
       WHERE character_id = $1`,
      [
        opts.characterId,
        dueDay,
        Math.max(1, dueDay - 7),
        displayDateForGameDay(dueDay),
        displayDateForGameDay(Math.max(1, dueDay - 7)),
      ],
    )
    const refreshed = await client.query<RentRow>(`SELECT * FROM rent WHERE character_id = $1`, [
      opts.characterId,
    ])
    row = refreshed.rows[0]!
  }

  if (row.status === 'evicted' && row.evicted_at) {
    return { notices: [], rent: mapRentPublic(row) }
  }

  const dueDay = row.due_game_day ?? nextRentDay(day)
  const notices: string[] = []

  if (day < dueDay) {
    const status: RentStatus = day >= dueDay - 1 ? 'due' : 'ok'
    if (row.status !== status && !row.evicted_at && (row.warnings ?? 0) === 0) {
      await client.query(`UPDATE rent SET status = $2 WHERE character_id = $1`, [
        opts.characterId,
        status,
      ])
      row = { ...row, status }
    }
    return { notices, rent: mapRentPublic({ ...row, status: row.status as RentStatus }) }
  }

  // Past due — count unpaid rent weeks (each Saturday past due escalates once).
  const dueWeek = gameWeekFromDay(dueDay)
  const currentWeek = gameWeekFromDay(day)
  let overdueWeeks = 0
  for (let w = dueWeek; w <= currentWeek; w++) {
    const sat = rentDayForWeek(w)
    if (day >= sat && sat >= dueDay) overdueWeeks++
  }
  // At least 1 if we're past due day
  overdueWeeks = Math.max(1, overdueWeeks)

  let warnings = row.warnings ?? 0
  let status: RentStatus = overdueWeeks >= 1 ? 'late' : 'due'
  let message = row.message
  let lastWarned = row.last_warned_at
  let evictedAt = row.evicted_at
  let lodgingId = row.lodging_id
  let amount = asInt(row.amount)

  const targetWarnings = Math.min(2, overdueWeeks)
  if (warnings < targetWarnings) {
    warnings = targetWarnings
    lastWarned = new Date()
    message =
      warnings === 1
        ? 'Baba Landlord warning 1: rent is late. Pay before it gets worse.'
        : 'Baba Landlord warning 2: last chance before eviction.'
    notices.push(message)
  }

  if (overdueWeeks >= 3 && !evictedAt) {
    lodgingId = EVICTION_LODGING_ID
    amount = rentWeeklyForLodging(EVICTION_LODGING_ID)
    status = 'evicted'
    warnings = 2
    evictedAt = new Date()
    const newDue = nextRentDay(day + 1)
    message =
      'Evicted to Off-campus Hostels. Cheaper rent, rougher living. Pay to settle with Baba.'
    notices.push(message)

    await client.query(
      `UPDATE characters SET lodging_id = $2, updated_at = NOW() WHERE id = $1`,
      [opts.characterId, lodgingId],
    )
    await client.query(
      `UPDATE game_state SET location_id = $2, updated_at = NOW() WHERE character_id = $1`,
      [opts.characterId, startPlaceForLodging(lodgingId)],
    )
    await client.query(
      `UPDATE rent SET
         lodging_id = $2,
         amount = $3,
         status = 'evicted',
         warnings = $4,
         last_warned_at = $5,
         evicted_at = $6,
         message = $7,
         due_game_day = $8,
         paid_until_game_day = $9,
         due_at = $10::timestamptz,
         paid_until = $11::timestamptz
       WHERE character_id = $1`,
      [
        opts.characterId,
        lodgingId,
        amount,
        warnings,
        lastWarned,
        evictedAt,
        message,
        newDue,
        day,
        displayDateForGameDay(newDue),
        displayDateForGameDay(day),
      ],
    )
  } else {
    await client.query(
      `UPDATE rent SET
         status = $2,
         warnings = $3,
         last_warned_at = $4,
         message = $5
       WHERE character_id = $1`,
      [opts.characterId, status, warnings, lastWarned, message],
    )
  }

  const refreshed = await client.query<RentRow>(`SELECT * FROM rent WHERE character_id = $1`, [
    opts.characterId,
  ])
  return { notices, rent: mapRentPublic(refreshed.rows[0]!) }
}

export async function markRentPaid(
  client: PoolClient,
  opts: { characterId: string; gameTime: number; lodgingId: string | null },
): Promise<RentPublic> {
  const day = dayFromGameTime(opts.gameTime)
  const nextDue = nextRentDay(day + 1)
  const lodging = normalizeLodgingId(opts.lodgingId)
  const amount = rentWeeklyForLodging(lodging)

  await client.query(
    `UPDATE rent SET
       lodging_id = $2,
       amount = $3,
       status = 'ok',
       warnings = 0,
       last_warned_at = NULL,
       evicted_at = NULL,
       message = NULL,
       due_game_day = $4,
       paid_until_game_day = $5,
       due_at = $6::timestamptz,
       paid_until = $7::timestamptz
     WHERE character_id = $1`,
    [
      opts.characterId,
      lodging,
      amount,
      nextDue,
      day,
      displayDateForGameDay(nextDue),
      displayDateForGameDay(day),
    ],
  )

  const found = await client.query<RentRow>(`SELECT * FROM rent WHERE character_id = $1`, [
    opts.characterId,
  ])
  return mapRentPublic(found.rows[0]!)
}
