import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import { createId } from '../ids.js'
import { clampSnapshot, dreamProgress, getDream, type DreamSnapshot } from './dreams.js'
import {
  applyNeedDelta,
  clampNeeds,
  decayNeeds,
  defaultNeeds,
  moodFromNeeds,
  mostUrgentNeed,
  type Needs,
} from './needs.js'
import { getAction, actionForNeed, type GameActionId } from './actions.js'
import { getPlace, startPlaceForLodging, type Place } from './places.js'
import { DAY_MINUTES, clockFromGameTime, isOpenAt, realGameTime } from './time.js'
import type { TraitId } from './traits.js'
import { checkTraits } from './traits.js'
import { computeSetupStatus, SETUP_INCOMPLETE } from './setup-status.js'
import { lodgingDecayMultiplier, lodgingHasKitchen } from './lodging.js'
import { consumePendingToast, processWeeklyEconomy } from './weekly.js'

export type GameStateRow = {
  character_id: string
  cash: string | number
  needs: Needs | string
  location_id: string
  game_time: number
  last_tick_at: Date
  version: number
  hustle_lockout_until?: number | null
  reputation?: number | null
  pending_toast?: string | null
}

export type PublicGameState = {
  cash: number
  needs: Needs
  locationId: string
  gameTime: number
  day: number
  period: string
  timeLabel: string
  mood: ReturnType<typeof moodFromNeeds>
  dreamProgress: ReturnType<typeof dreamProgress> | null
  upNext: { actionId: GameActionId; placeId: string; need: keyof Needs; label: string }
  version: number
  places: Place[]
  /** Island toast / Bank hints from weekly payouts or rent ladder. */
  toast?: string | null
  notices?: string[]
  reputation?: number
  hustleLockoutUntil?: number | null
}

function asMoney(value: string | number | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function parseNeeds(raw: Needs | string | null | undefined): Needs {
  if (!raw) return defaultNeeds()
  if (typeof raw === 'string') {
    try {
      return clampNeeds(JSON.parse(raw) as Partial<Needs>)
    } catch {
      return defaultNeeds()
    }
  }
  return clampNeeds(raw)
}

export async function ensureGameState(
  client: PoolClient,
  characterId: string,
  opts: { cash?: number; lodgingId?: string | null; reason?: string } = {},
): Promise<GameStateRow> {
  const existing = await client.query<GameStateRow>(
    `SELECT character_id, cash, needs, location_id, game_time, last_tick_at, version
     FROM game_state WHERE character_id = $1 FOR UPDATE`,
    [characterId],
  )
  if (existing.rows[0]) return existing.rows[0]

  const cash = opts.cash ?? 0
  const locationId = startPlaceForLodging(opts.lodgingId)
  await client.query(
    `INSERT INTO game_state (character_id, cash, needs, location_id, game_time, last_tick_at, version)
     VALUES ($1, $2, $3::jsonb, $4, $5, NOW(), 1)`,
    [characterId, cash, JSON.stringify(defaultNeeds()), locationId, realGameTime()],
  )
  if (cash !== 0) {
    await client.query(
      `INSERT INTO ledger (id, character_id, amount, reason, kind, balance_after)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [createId(), characterId, cash, opts.reason ?? 'starting-money', 'starting_money', cash],
    )
  }
  const created = await client.query<GameStateRow>(
    `SELECT character_id, cash, needs, location_id, game_time, last_tick_at, version
     FROM game_state WHERE character_id = $1 FOR UPDATE`,
    [characterId],
  )
  return created.rows[0]!
}

export async function tickGameState(
  client: PoolClient,
  row: GameStateRow,
  traits: TraitId[],
  now = new Date(),
  lodgingDecayMult = 1,
): Promise<GameStateRow> {
  const last = row.last_tick_at instanceof Date ? row.last_tick_at : new Date(row.last_tick_at)
  const elapsedMs = Math.max(0, now.getTime() - last.getTime())
  const prevTime = row.game_time
  // The clock is real WAT time for everyone; needs drain by the real minutes since the last tick
  const nextTime = realGameTime(now)
  // A save from before the real clock (days behind): move rent dates onto the real calendar
  // first so the jump doesn't count as weeks of unpaid rent.
  if (nextTime - prevTime > 2 * DAY_MINUTES) {
    const { rebaseRentToRealClock } = await import('./rent-ladder.js')
    await rebaseRentToRealClock(client, row.character_id, nextTime)
  }
  // Needs are whole numbers, so they drain in whole real hours (a minute's worth would round
  // to nothing); the part of an hour not used yet carries over to the next tick.
  const hours = Math.floor(elapsedMs / DECAY_STEP_MS)
  if (hours <= 0) {
    if (nextTime === prevTime) return row
    await client.query(`UPDATE game_state SET game_time = $2 WHERE character_id = $1`, [row.character_id, nextTime])
    return { ...row, game_time: nextTime }
  }
  const gameMinutes = hours * 60
  const tickedTo = new Date(last.getTime() + hours * DECAY_STEP_MS)

  let needs = decayNeeds(parseNeeds(row.needs), gameMinutes, traits, lodgingDecayMult)
  const prevDay = clockFromGameTime(prevTime).day
  const nextDay = clockFromGameTime(nextTime).day
  if (nextDay > prevDay) {
    try {
      const { applyDailyFunBonus } = await import('./room.js')
      const lodging = await client.query<{ lodging_id: string | null }>(
        `SELECT lodging_id FROM characters WHERE id = $1`,
        [row.character_id],
      )
      const bonus = await applyDailyFunBonus(
        client,
        row.character_id,
        lodging.rows[0]?.lodging_id ?? null,
        nextDay,
        needs.fun,
      )
      if (bonus.granted > 0) {
        needs = { ...needs, fun: bonus.fun }
      }
    } catch {
      // Room tables may not exist yet in mid-migration tests.
    }
  }
  await client.query(
    `UPDATE game_state
     SET needs = $2::jsonb, game_time = $3, last_tick_at = $4, updated_at = NOW()
     WHERE character_id = $1`,
    [row.character_id, JSON.stringify(needs), nextTime, tickedTo],
  )
  return {
    ...row,
    needs,
    game_time: nextTime,
    last_tick_at: tickedTo,
  }
}

const DECAY_STEP_MS = 60 * 60_000

export async function writeCashChange(
  client: PoolClient,
  characterId: string,
  amount: number,
  reason: string,
  expectedVersion: number,
  kind = 'other',
): Promise<{ ok: true; cash: number; version: number } | { ok: false; error: string; code: string }> {
  const locked = await client.query<{ cash: string | number; version: number }>(
    `SELECT cash, version FROM game_state WHERE character_id = $1 FOR UPDATE`,
    [characterId],
  )
  const current = locked.rows[0]
  if (!current || current.version !== expectedVersion) {
    return { ok: false, error: 'VERSION_CONFLICT', code: 'VERSION_CONFLICT' }
  }
  const nextCash = asMoney(current.cash) + amount
  if (nextCash < 0) {
    return { ok: false, error: 'INSUFFICIENT_FUNDS', code: 'INSUFFICIENT_FUNDS' }
  }

  const updated = await client.query<{ cash: string | number; version: number }>(
    `UPDATE game_state
     SET cash = $2, version = version + 1, updated_at = NOW()
     WHERE character_id = $1 AND version = $3
     RETURNING cash, version`,
    [characterId, nextCash, expectedVersion],
  )
  if (!updated.rows[0]) {
    return { ok: false, error: 'VERSION_CONFLICT', code: 'VERSION_CONFLICT' }
  }
  const cash = asMoney(updated.rows[0].cash)
  await client.query(
    `INSERT INTO ledger (id, character_id, amount, reason, kind, balance_after)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [createId(), characterId, amount, reason, kind, cash],
  )
  await client.query(`UPDATE characters SET cash = $2, updated_at = NOW() WHERE id = $1`, [
    characterId,
    cash,
  ])
  return { ok: true, cash, version: updated.rows[0].version }
}

/** Apply a cash delta under an existing FOR UPDATE lock (no client version required). */
export async function applyCash(
  client: PoolClient,
  characterId: string,
  amount: number,
  reason: string,
  kind: string,
): Promise<
  { ok: true; cash: number; version: number; ledgerId: string } | { ok: false; error: string }
> {
  const locked = await client.query<{ cash: string | number; version: number }>(
    `SELECT cash, version FROM game_state WHERE character_id = $1 FOR UPDATE`,
    [characterId],
  )
  const current = locked.rows[0]
  if (!current) return { ok: false, error: SETUP_INCOMPLETE }
  const nextCash = asMoney(current.cash) + amount
  if (nextCash < 0) return { ok: false, error: 'INSUFFICIENT_FUNDS' }

  const updated = await client.query<{ cash: string | number; version: number }>(
    `UPDATE game_state
     SET cash = $2, version = version + 1, updated_at = NOW()
     WHERE character_id = $1
     RETURNING cash, version`,
    [characterId, nextCash],
  )
  const cash = asMoney(updated.rows[0]!.cash)
  const ledgerId = createId()
  await client.query(
    `INSERT INTO ledger (id, character_id, amount, reason, kind, balance_after)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [ledgerId, characterId, amount, reason, kind, cash],
  )
  await client.query(`UPDATE characters SET cash = $2, updated_at = NOW() WHERE id = $1`, [
    characterId,
    cash,
  ])
  return { ok: true, cash, version: updated.rows[0]!.version, ledgerId }
}

export { asMoney, parseNeeds }

type CharacterMeta = {
  id: string
  appearance: unknown
  traits: string[]
  dream_id: string | null
  snapshot: unknown
  lodging_id: string | null
  character_type: string | null
  starting_cash: string | number | null
  cash: string | number | null
}

async function loadCharacterMeta(userId: string) {
  const found = await pool.query<CharacterMeta>(
    `SELECT id, appearance, traits, dream_id, snapshot, lodging_id, character_type,
            starting_cash, cash
     FROM characters WHERE user_id = $1`,
    [userId],
  )
  return found.rows[0] ?? null
}

async function characterHasGameState(characterId: string) {
  const found = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok FROM game_state WHERE character_id = $1 LIMIT 1`,
    [characterId],
  )
  return Boolean(found.rows[0])
}

function traitsOf(row: CharacterMeta): TraitId[] {
  const checked = checkTraits(row.traits ?? [])
  return checked.ok ? checked.value : []
}

function snapshotOf(row: CharacterMeta, cash: number): DreamSnapshot {
  const base = clampSnapshot(row.snapshot)
  return { ...base, netWorth: Math.max(base.netWorth, cash) }
}

export async function getPublicState(userId: string): Promise<
  | { ok: true; state: PublicGameState }
  | { ok: false; error: string; code: number }
> {
  const character = await loadCharacterMeta(userId)
  if (!character) return { ok: false, error: SETUP_INCOMPLETE, code: 409 }

  const hasGameState = await characterHasGameState(character.id)
  const setup = computeSetupStatus({
    appearance: character.appearance,
    traits: character.traits,
    dreamId: character.dream_id,
    lodgingId: character.lodging_id,
    hasGameState,
  })
  if (!setup.setupComplete) return { ok: false, error: SETUP_INCOMPLETE, code: 409 }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const starting = asMoney(character.starting_cash ?? character.cash)
    let row = await ensureGameState(client, character.id, {
      cash: starting,
      lodgingId: character.lodging_id,
      reason: 'starting-money',
    })
    const decayMult = lodgingDecayMultiplier(character.lodging_id)
    row = await tickGameState(client, row, traitsOf(character), new Date(), decayMult)
    const weekly = await processWeeklyEconomy(client, {
      characterId: character.id,
      characterType: character.character_type,
      lodgingId: character.lodging_id,
      gameTime: row.game_time,
    })
    // One-shot toast: prefer this tick's message, always clear stored pending.
    const toast = weekly.toast ?? (await consumePendingToast(client, character.id))
    if (weekly.toast) {
      await client.query(
        `UPDATE game_state SET pending_toast = NULL WHERE character_id = $1`,
        [character.id],
      )
    }
    const cashRow = await client.query<GameStateRow>(
      `SELECT character_id, cash, needs, location_id, game_time, last_tick_at, version,
              hustle_lockout_until, reputation, pending_toast
       FROM game_state WHERE character_id = $1`,
      [character.id],
    )
    row = cashRow.rows[0] ?? row
    await client.query('COMMIT')

    const cash = asMoney(row.cash)
    const needs = parseNeeds(row.needs)
    const clock = clockFromGameTime(row.game_time)
    const dream = getDream(character.dream_id)
    const progress = dream ? dreamProgress(dream, snapshotOf(character, cash)) : null
    const urgent = mostUrgentNeed(needs)
    const suggest = actionForNeed(urgent)
    const notices = [
      ...weekly.notices.map((n) => n.message),
      ...weekly.rentNotices,
    ]

    return {
      ok: true,
      state: {
        cash,
        needs,
        locationId: row.location_id,
        gameTime: row.game_time,
        day: clock.day,
        period: clock.period,
        timeLabel: clock.timeLabel,
        mood: moodFromNeeds(needs),
        dreamProgress: progress,
        upNext: {
          actionId: suggest.actionId,
          placeId: suggest.placeHint,
          need: urgent,
          label: getAction(suggest.actionId)?.label ?? suggest.actionId,
        },
        version: row.version,
        places: (await import('./places.js')).PLACES,
        toast,
        notices: notices.length ? notices : undefined,
        reputation: row.reputation ?? 50,
        hustleLockoutUntil: row.hustle_lockout_until ?? null,
      },
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export type PerformActionInput = {
  actionId: string
  targetPlaceId?: string | null
  version: number
  /** Room furniture: allowed for actions marked `home`, wherever the player is on the map. */
  atHome?: boolean
}

export async function performGameAction(
  userId: string,
  input: PerformActionInput,
): Promise<
  | { ok: true; state: PublicGameState; message: string }
  | { ok: false; error: string; code: number; conflict?: boolean }
> {
  const action = getAction(input.actionId)
  if (!action) return { ok: false, error: 'Unknown action.', code: 400 }
  if (input.atHome && !action.home) return { ok: false, error: `You cannot ${action.label.toLowerCase()} at home.`, code: 400 }

  const character = await loadCharacterMeta(userId)
  if (!character) return { ok: false, error: SETUP_INCOMPLETE, code: 409 }

  const hasGameState = await characterHasGameState(character.id)
  const setup = computeSetupStatus({
    appearance: character.appearance,
    traits: character.traits,
    dreamId: character.dream_id,
    lodgingId: character.lodging_id,
    hasGameState,
  })
  if (!setup.setupComplete) return { ok: false, error: SETUP_INCOMPLETE, code: 409 }
  if (action.kitchen && !lodgingHasKitchen(character.lodging_id)) {
    return { ok: false, error: 'Your place has no kitchen. Move to a self-con or one bedroom to cook.', code: 400 }
  }

  const traits = traitsOf(character)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const starting = asMoney(character.starting_cash ?? character.cash)
    let row = await ensureGameState(client, character.id, {
      cash: starting,
      lodgingId: character.lodging_id,
      reason: 'starting-money',
    })
    row = await tickGameState(
      client,
      row,
      traits,
      new Date(),
      lodgingDecayMultiplier(character.lodging_id),
    )
    await processWeeklyEconomy(client, {
      characterId: character.id,
      characterType: character.character_type,
      lodgingId: character.lodging_id,
      gameTime: row.game_time,
    })
    const afterWeekly = await client.query<GameStateRow>(
      `SELECT character_id, cash, needs, location_id, game_time, last_tick_at, version
       FROM game_state WHERE character_id = $1`,
      [character.id],
    )
    row = afterWeekly.rows[0] ?? row

    if (row.version !== input.version) {
      await client.query('ROLLBACK')
      return { ok: false, error: 'Stale state. Refresh and try again.', code: 409, conflict: true }
    }

    const clock = clockFromGameTime(row.game_time)
    let locationId = row.location_id
    let place = getPlace(locationId)

    if (action.id === 'travel') {
      const destId = input.targetPlaceId
      const dest = getPlace(destId)
      if (!dest) {
        await client.query('ROLLBACK')
        return { ok: false, error: 'Pick where you are going.', code: 400 }
      }
      const here = getPlace(locationId)
      if (!here || !here.actions.includes('travel')) {
        await client.query('ROLLBACK')
        return { ok: false, error: 'Travel from a transport stop (Keke Park or Shuttle).', code: 400 }
      }
      if (!isOpenAt(here.openHours, clock.hour)) {
        await client.query('ROLLBACK')
        return { ok: false, error: `${here.label} is closed now.`, code: 400 }
      }
      place = dest
      locationId = dest.id
    } else if (input.atHome) {
      // Your own room: no place or opening-hours check, location stays as it is
    } else {
      const targetId = input.targetPlaceId ?? locationId
      place = getPlace(targetId)
      if (!place) {
        await client.query('ROLLBACK')
        return { ok: false, error: 'Unknown place.', code: 400 }
      }
      if (place.id !== locationId) {
        await client.query('ROLLBACK')
        return { ok: false, error: `You are not at ${place.label}. Travel there first.`, code: 400 }
      }
      if (!place.actions.includes(action.id)) {
        await client.query('ROLLBACK')
        return { ok: false, error: `You cannot ${action.label.toLowerCase()} here.`, code: 400 }
      }
      const hours = action.openHours ?? place.openHours
      if (!isOpenAt(hours, clock.hour)) {
        await client.query('ROLLBACK')
        return { ok: false, error: `${place.label} is closed now.`, code: 400 }
      }
    }

    const cash = asMoney(row.cash)
    if (action.cost < 0 && cash < Math.abs(action.cost)) {
      await client.query('ROLLBACK')
      return {
        ok: false,
        error: `You need ₦${Math.abs(action.cost).toLocaleString()} for that.`,
        code: 400,
      }
    }

    let effects = { ...action.needEffects }
    if (action.id === 'sleep' && typeof effects.energy === 'number' && effects.energy > 0) {
      const { sleepEnergyMultiplier } = await import('./room.js')
      const mult = await sleepEnergyMultiplier(client, character.id, character.lodging_id)
      // Cap: never more than double energy from sleep.
      const capped = Math.min(2, mult)
      effects = { ...effects, energy: Math.round(effects.energy * capped) }
    }
    let needs = applyNeedDelta(parseNeeds(row.needs), effects)
    // Real clock: sleeping, eating, studying… change needs and money, never the time
    const nextTime = row.game_time
    let nextCash = cash
    let nextVersion = row.version

    if (action.cost !== 0) {
      const wrote = await writeCashChange(
        client,
        character.id,
        action.cost,
        action.id,
        row.version,
        action.cost < 0 ? 'purchase' : 'job_pay',
      )
      if (!wrote.ok) {
        await client.query('ROLLBACK')
        const conflict = wrote.code === 'VERSION_CONFLICT'
        return {
          ok: false,
          error: wrote.error,
          code: conflict ? 409 : 400,
          conflict,
        }
      }
      nextCash = wrote.cash
      nextVersion = wrote.version
    } else {
      const bumped = await client.query<{ version: number }>(
        `UPDATE game_state SET version = version + 1, updated_at = NOW()
         WHERE character_id = $1 AND version = $2 RETURNING version`,
        [character.id, row.version],
      )
      if (!bumped.rows[0]) {
        await client.query('ROLLBACK')
        return { ok: false, error: 'Stale state. Refresh and try again.', code: 409, conflict: true }
      }
      nextVersion = bumped.rows[0].version
    }

    await client.query(
      `UPDATE game_state
       SET needs = $2::jsonb, location_id = $3, game_time = $4, updated_at = NOW()
       WHERE character_id = $1`,
      [character.id, JSON.stringify(needs), locationId, nextTime],
    )

    await client.query('COMMIT')

    const urgent = mostUrgentNeed(needs)
    const suggest = actionForNeed(urgent)
    const nextClock = clockFromGameTime(nextTime)
    const dream = getDream(character.dream_id)
    const progress = dream ? dreamProgress(dream, snapshotOf(character, nextCash)) : null
    const { PLACES } = await import('./places.js')

    const message =
      action.cost > 0
        ? `${action.label}: +₦${action.cost.toLocaleString()}.`
        : action.cost < 0
          ? `${action.label}: −₦${Math.abs(action.cost).toLocaleString()}.`
          : `${action.label} done.`

    return {
      ok: true,
      message,
      state: {
        cash: nextCash,
        needs,
        locationId,
        gameTime: nextTime,
        day: nextClock.day,
        period: nextClock.period,
        timeLabel: nextClock.timeLabel,
        mood: moodFromNeeds(needs),
        dreamProgress: progress,
        upNext: {
          actionId: suggest.actionId,
          placeId: suggest.placeHint,
          need: urgent,
          label: getAction(suggest.actionId)?.label ?? suggest.actionId,
        },
        version: nextVersion,
        places: PLACES,
      },
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/** Pure helpers exported for Vitest. */
export const __test = {
  parseNeeds,
  asMoney,
  snapshotOf,
}
