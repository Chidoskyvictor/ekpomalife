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
import { advanceGameTime, clockFromGameTime, isOpenAt, DEFAULT_GAME_TIME } from './time.js'
import type { TraitId } from './traits.js'
import { checkTraits } from './traits.js'

export type GameStateRow = {
  character_id: string
  cash: string | number
  needs: Needs | string
  location_id: string
  game_time: number
  last_tick_at: Date
  version: number
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
    [characterId, cash, JSON.stringify(defaultNeeds()), locationId, DEFAULT_GAME_TIME],
  )
  if (cash !== 0) {
    await client.query(
      `INSERT INTO ledger (id, character_id, amount, reason) VALUES ($1, $2, $3, $4)`,
      [createId(), characterId, cash, opts.reason ?? 'starting-money'],
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
): Promise<GameStateRow> {
  const last = row.last_tick_at instanceof Date ? row.last_tick_at : new Date(row.last_tick_at)
  const elapsedMs = Math.max(0, now.getTime() - last.getTime())
  if (elapsedMs < 1000) return row

  const prevTime = row.game_time
  const nextTime = advanceGameTime(prevTime, elapsedMs)
  const gameMinutes = nextTime - prevTime
  if (gameMinutes <= 0) {
    await client.query(`UPDATE game_state SET last_tick_at = $2 WHERE character_id = $1`, [
      row.character_id,
      now,
    ])
    return { ...row, last_tick_at: now }
  }

  const needs = decayNeeds(parseNeeds(row.needs), gameMinutes, traits)
  await client.query(
    `UPDATE game_state
     SET needs = $2::jsonb, game_time = $3, last_tick_at = $4, updated_at = NOW()
     WHERE character_id = $1`,
    [row.character_id, JSON.stringify(needs), nextTime, now],
  )
  return {
    ...row,
    needs,
    game_time: nextTime,
    last_tick_at: now,
  }
}

export async function writeCashChange(
  client: PoolClient,
  characterId: string,
  amount: number,
  reason: string,
  expectedVersion: number,
): Promise<{ ok: true; cash: number; version: number } | { ok: false; error: string; code: string }> {
  const updated = await client.query<{ cash: string | number; version: number }>(
    `UPDATE game_state
     SET cash = cash + $2, version = version + 1, updated_at = NOW()
     WHERE character_id = $1 AND version = $3
     RETURNING cash, version`,
    [characterId, amount, expectedVersion],
  )
  if (!updated.rows[0]) {
    return { ok: false, error: 'Stale state. Refresh and try again.', code: 'version_conflict' }
  }
  await client.query(`INSERT INTO ledger (id, character_id, amount, reason) VALUES ($1, $2, $3, $4)`, [
    createId(),
    characterId,
    amount,
    reason,
  ])
  await client.query(`UPDATE characters SET cash = $2, updated_at = NOW() WHERE id = $1`, [
    characterId,
    asMoney(updated.rows[0].cash),
  ])
  return { ok: true, cash: asMoney(updated.rows[0].cash), version: updated.rows[0].version }
}

type CharacterMeta = {
  id: string
  traits: string[]
  dream_id: string | null
  snapshot: unknown
  lodging_id: string | null
  starting_cash: string | number | null
  cash: string | number | null
}

async function loadCharacterMeta(userId: string) {
  const found = await pool.query<CharacterMeta>(
    `SELECT id, traits, dream_id, snapshot, lodging_id, starting_cash, cash
     FROM characters WHERE user_id = $1`,
    [userId],
  )
  return found.rows[0] ?? null
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
  if (!character) return { ok: false, error: 'Create a character first.', code: 409 }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const starting = asMoney(character.starting_cash ?? character.cash)
    let row = await ensureGameState(client, character.id, {
      cash: starting,
      lodgingId: character.lodging_id,
      reason: 'starting-money',
    })
    row = await tickGameState(client, row, traitsOf(character))
    await client.query('COMMIT')

    const cash = asMoney(row.cash)
    const needs = parseNeeds(row.needs)
    const clock = clockFromGameTime(row.game_time)
    const dream = getDream(character.dream_id)
    const progress = dream ? dreamProgress(dream, snapshotOf(character, cash)) : null
    const urgent = mostUrgentNeed(needs)
    const suggest = actionForNeed(urgent)

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

  const character = await loadCharacterMeta(userId)
  if (!character) return { ok: false, error: 'Create a character first.', code: 409 }
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
    row = await tickGameState(client, row, traits)

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

    let needs = applyNeedDelta(parseNeeds(row.needs), action.needEffects)
    const nextTime = row.game_time + action.duration
    let nextCash = cash
    let nextVersion = row.version

    if (action.cost !== 0) {
      const wrote = await writeCashChange(client, character.id, action.cost, action.id, row.version)
      if (!wrote.ok) {
        await client.query('ROLLBACK')
        return { ok: false, error: wrote.error, code: 409, conflict: true }
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
