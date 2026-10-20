import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import {
  INSUFFICIENT_FUNDS,
  NO_ENERGY,
  NOT_ELIGIBLE,
  SETUP_INCOMPLETE,
} from './economy-codes.js'
import {
  applyCash,
  asMoney,
  ensureGameState,
  getPublicState,
  parseNeeds,
  tickGameState,
  type PublicGameState,
} from './game-state.js'
import { clockFromGameTime } from './time.js'
import { LODGE_DEED_ITEM_ID, lodgingDecayMultiplier } from './lodging.js'
import { applyNeedDelta, clampNeeds, type Needs } from './needs.js'
import { computeSetupStatus } from './setup-status.js'
import { checkTraits, type TraitId } from './traits.js'
import { ensureRentRow, markRentPaid } from './rent-ladder.js'
import { processWeeklyEconomy } from './weekly.js'
import { getHustle, listHustleDefs, rollHustleOutcome } from './hustles.js'

export type JobRequirements = {
  skill?: string
  level?: number
  course?: string
  trait?: string
  item?: string
  energy?: number
}

export type JobLevel = { level: number; title: string; payBonus: number }

export type JobRow = {
  id: string
  title: string
  place_id: string
  pay_per_shift: string | number
  shift_minutes: number
  needs_cost: NeedsCost | string
  requirements: JobRequirements | string
  levels: JobLevel[] | string
}

type NeedsCost = Partial<Record<keyof Needs, number>>

export type ShopItemRow = {
  id: string
  name: string
  emoji: string
  price: string | number
  category: string
  place_id: string
  effects: ShopEffects | string
  use_action_id: string | null
  stock: number | null
}

type ShopEffects = {
  needs?: Partial<Needs>
  item?: string
}

type CharacterCtx = {
  id: string
  appearance: unknown
  traits: string[]
  dream_id: string | null
  lodging_id: string | null
  character_type: string | null
  starting_cash: string | number | null
  cash: string | number | null
}

function parseJson<T>(raw: T | string, fallback: T): T {
  if (typeof raw !== 'string') return raw ?? fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

async function loadCharacter(userId: string) {
  const found = await pool.query<CharacterCtx>(
    `SELECT id, appearance, traits, dream_id, lodging_id, character_type, starting_cash, cash
     FROM characters WHERE user_id = $1`,
    [userId],
  )
  return found.rows[0] ?? null
}

async function tickAndWeekly(
  client: import('pg').PoolClient,
  character: CharacterCtx,
  traits: TraitId[],
) {
  let row = await ensureGameState(client, character.id, {
    cash: asMoney(character.starting_cash ?? character.cash),
    lodgingId: character.lodging_id,
  })
  row = await tickGameState(
    client,
    row,
    traits,
    new Date(),
    lodgingDecayMultiplier(character.lodging_id),
  )
  const weekly = await processWeeklyEconomy(client, {
    characterId: character.id,
    characterType: character.character_type,
    lodgingId: character.lodging_id,
    gameTime: row.game_time,
  })
  const refreshed = await client.query<import('./game-state.js').GameStateRow>(
    `SELECT character_id, cash, needs, location_id, game_time, last_tick_at, version,
            hustle_lockout_until, reputation, pending_toast
     FROM game_state WHERE character_id = $1`,
    [character.id],
  )
  return { row: refreshed.rows[0] ?? row, weekly }
}

async function hasGameState(characterId: string) {
  const found = await pool.query(`SELECT 1 FROM game_state WHERE character_id = $1 LIMIT 1`, [
    characterId,
  ])
  return (found.rowCount ?? 0) > 0
}

export async function requireEconomySetup(userId: string): Promise<
  | { ok: true; character: CharacterCtx; traits: TraitId[] }
  | { ok: false; error: string; code: number }
> {
  const character = await loadCharacter(userId)
  if (!character) return { ok: false, error: SETUP_INCOMPLETE, code: 409 }
  const ready = await hasGameState(character.id)
  const setup = computeSetupStatus({
    appearance: character.appearance,
    traits: character.traits,
    dreamId: character.dream_id,
    lodgingId: character.lodging_id,
    hasGameState: ready,
  })
  if (!setup.setupComplete) return { ok: false, error: SETUP_INCOMPLETE, code: 409 }
  const traits = checkTraits(character.traits ?? [])
  return {
    ok: true,
    character,
    traits: traits.ok ? traits.value : [],
  }
}

async function listInventoryItems(client: PoolClient, characterId: string) {
  const rows = await client.query<{
    item_id: string
    qty: number
    name: string
    emoji: string
    use_action_id: string | null
  }>(
    `SELECT i.item_id, i.qty, s.name, s.emoji, s.use_action_id
     FROM inventory i
     JOIN shop_items s ON s.id = i.item_id
     WHERE i.character_id = $1 AND i.qty > 0
     ORDER BY i.acquired_at ASC`,
    [characterId],
  )
  return rows.rows.map((row) => ({
    id: `inv-${row.item_id}`,
    itemId: row.item_id,
    name: row.name,
    emoji: row.emoji,
    qty: row.qty,
    useActionId: row.use_action_id,
  }))
}

async function ownedItemIds(client: PoolClient, characterId: string) {
  const rows = await client.query<{ item_id: string }>(
    `SELECT item_id FROM inventory WHERE character_id = $1 AND qty > 0`,
    [characterId],
  )
  return new Set(rows.rows.map((row) => row.item_id))
}

function jobEligibility(
  requirements: JobRequirements,
  opts: { traits: TraitId[]; needs: Needs; items: Set<string>; level: number },
): { ok: true } | { ok: false; reason: string } {
  if (requirements.trait && !opts.traits.includes(requirements.trait as TraitId)) {
    return { ok: false, reason: `You need the ${requirements.trait} trait` }
  }
  if (requirements.item && !opts.items.has(requirements.item)) {
    return { ok: false, reason: `You need a ${requirements.item.replace(/-/g, ' ')}` }
  }
  if (requirements.skill === 'study' && typeof requirements.level === 'number') {
    if (opts.needs.study < requirements.level) {
      return { ok: false, reason: `Study need must be ${requirements.level}+` }
    }
  } else if (typeof requirements.level === 'number' && opts.level < requirements.level) {
    return { ok: false, reason: `Reach level ${requirements.level} first` }
  }
  if (typeof requirements.energy === 'number' && opts.needs.energy < requirements.energy) {
    return { ok: false, reason: NO_ENERGY }
  }
  return { ok: true }
}

function mapJob(
  row: JobRow,
  opts: {
    currentJobId: string | null
    currentLevel: number
    locked: boolean
    lockReason?: string
  },
) {
  return {
    id: row.id,
    title: row.title,
    placeId: row.place_id,
    payPerShift: asMoney(row.pay_per_shift),
    shiftMinutes: row.shift_minutes,
    needsCost: parseJson<NeedsCost>(row.needs_cost, {}),
    requirements: parseJson<JobRequirements>(row.requirements, {}),
    levels: parseJson<JobLevel[]>(row.levels, []),
    locked: opts.locked || undefined,
    lockReason: opts.lockReason,
    currentLevel: opts.currentJobId === row.id ? opts.currentLevel : undefined,
  }
}

export async function listJobs(userId: string, placeId?: string | null) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { row } = await tickAndWeekly(client, gate.character, gate.traits)
    const items = await ownedItemIds(client, gate.character.id)
    const jobRow = await client.query<{ job_id: string; level: number }>(
      `SELECT job_id, level FROM player_jobs WHERE character_id = $1`,
      [gate.character.id],
    )
    const currentJobId = jobRow.rows[0]?.job_id ?? null
    const currentLevel = jobRow.rows[0]?.level ?? 1
    const needs = parseNeeds(row.needs)

    const jobsQuery = placeId
      ? await client.query<JobRow>(`SELECT * FROM jobs WHERE place_id = $1 ORDER BY title`, [placeId])
      : await client.query<JobRow>(`SELECT * FROM jobs ORDER BY title`)

    const jobs = jobsQuery.rows.map((job) => {
      const requirements = parseJson<JobRequirements>(job.requirements, {})
      const eligible = jobEligibility(requirements, {
        traits: gate.traits,
        needs,
        items,
        level: 1,
      })
      return mapJob(job, {
        currentJobId,
        currentLevel,
        locked: !eligible.ok,
        lockReason: eligible.ok ? undefined : eligible.reason,
      })
    })

    await client.query('COMMIT')
    return { ok: true as const, jobs, currentJobId }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function applyForJob(userId: string, jobId: string) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { row } = await tickAndWeekly(client, gate.character, gate.traits)
    const found = await client.query<JobRow>(`SELECT * FROM jobs WHERE id = $1`, [jobId])
    const job = found.rows[0]
    if (!job) {
      await client.query('ROLLBACK')
      return { ok: false as const, error: 'That job is gone.', code: 404 }
    }
    const items = await ownedItemIds(client, gate.character.id)
    const eligible = jobEligibility(parseJson(job.requirements, {}), {
      traits: gate.traits,
      needs: parseNeeds(row.needs),
      items,
      level: 1,
    })
    if (!eligible.ok) {
      await client.query('ROLLBACK')
      return { ok: false as const, error: NOT_ELIGIBLE, code: 400 }
    }
    await client.query(
      `INSERT INTO player_jobs (character_id, job_id, level)
       VALUES ($1, $2, 1)
       ON CONFLICT (character_id) DO UPDATE SET job_id = EXCLUDED.job_id, level = 1`,
      [gate.character.id, jobId],
    )
    await client.query('COMMIT')
    return {
      ok: true as const,
      job: mapJob(job, {
        currentJobId: jobId,
        currentLevel: 1,
        locked: false,
      }),
      message: `You got the ${job.title} job.`,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function workShift(userId: string) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    let { row } = await tickAndWeekly(client, gate.character, gate.traits)

    const pj = await client.query<{ job_id: string; level: number }>(
      `SELECT job_id, level FROM player_jobs WHERE character_id = $1 FOR UPDATE`,
      [gate.character.id],
    )
    const current = pj.rows[0]
    if (!current) {
      await client.query('ROLLBACK')
      return { ok: false as const, error: 'Apply for a job first.', code: 400 }
    }
    const found = await client.query<JobRow>(`SELECT * FROM jobs WHERE id = $1`, [current.job_id])
    const job = found.rows[0]
    if (!job) {
      await client.query('ROLLBACK')
      return { ok: false as const, error: 'That job is gone.', code: 404 }
    }

    const needsCost = parseJson<NeedsCost>(job.needs_cost, {})
    const energyCost = Math.max(0, needsCost.energy ?? 0)
    let needs = parseNeeds(row.needs)
    if (needs.energy < energyCost) {
      await client.query('ROLLBACK')
      return { ok: false as const, error: NO_ENERGY, code: 400 }
    }

    const levels = parseJson<JobLevel[]>(job.levels, [])
    const levelInfo = levels.find((entry) => entry.level === current.level) ?? levels[0]
    const bonus = levelInfo?.payBonus ?? 0
    const earned = Math.round(asMoney(job.pay_per_shift) * (1 + bonus))
    if (gate.traits.includes('hustler')) {
      // +10% pay for hustler (SPEC §5.2)
    }
    const pay = gate.traits.includes('hustler') ? Math.round(earned * 1.1) : earned
    const techBonus =
      gate.traits.includes('tech') && job.id === 'cyber-cafe' ? Math.round(pay * 0.15) : 0
    const totalPay = pay + techBonus

    const wrote = await applyCash(
      client,
      gate.character.id,
      totalPay,
      `${job.title} shift`,
      'job_pay',
    )
    if (!wrote.ok) {
      await client.query('ROLLBACK')
      return { ok: false as const, error: wrote.error, code: 400 }
    }

    // needsCost values are spent; negative entries (e.g. study: -10) grant that need.
    needs = applyNeedDelta(needs, {
      energy: -(needsCost.energy ?? 0),
      hunger: -(needsCost.hunger ?? 0),
      hygiene: -(needsCost.hygiene ?? 0),
      fun: -(needsCost.fun ?? 0),
      social: -(needsCost.social ?? 0),
      study: -(needsCost.study ?? 0),
    })

    const nextTime = row.game_time + job.shift_minutes
    await client.query(
      `UPDATE game_state
       SET needs = $2::jsonb, game_time = $3, version = $4, updated_at = NOW(), last_tick_at = NOW()
       WHERE character_id = $1`,
      [gate.character.id, JSON.stringify(clampNeeds(needs)), nextTime, wrote.version],
    )

    await client.query('COMMIT')
    const state = await getPublicState(userId)
    if (!state.ok) return state
    return {
      ok: true as const,
      state: { ok: true as const, ...state.state } satisfies PublicGameState & { ok: true },
      earned: totalPay,
      xp: 12,
      levelUp: false,
      message: `Shift done. +₦${totalPay.toLocaleString()}`,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function listShop(userId: string, placeId: string) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate

  const resolved = placeId || 'town-shop-1'
  let items = await pool.query<ShopItemRow>(
    `SELECT * FROM shop_items WHERE place_id = $1 ORDER BY price ASC`,
    [resolved],
  )
  if (items.rows.length === 0) {
    items = await pool.query<ShopItemRow>(
      `SELECT * FROM shop_items WHERE place_id = 'town-shop-1' ORDER BY price ASC`,
    )
  }
  const visible = items.rows.filter((item) => item.category !== 'phone')
  return {
    ok: true as const,
    placeId: visible[0]?.place_id ?? items.rows[0]?.place_id ?? resolved,
    items: visible.map((item) => ({
      id: item.id,
      name: item.name,
      emoji: item.emoji,
      price: asMoney(item.price),
      category: item.category as
        | 'food'
        | 'phone'
        | 'toiletries'
        | 'books'
        | 'clothes'
        | 'licence'
        | 'other',
      effects: parseJson<ShopEffects>(item.effects, {}),
      useActionId: item.use_action_id ?? undefined,
    })),
  }
}

export async function buyItem(userId: string, itemId: string, qty: number) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate
  const count = Math.max(1, Math.min(99, Math.floor(qty)))

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await ensureGameState(client, gate.character.id, {
      cash: asMoney(gate.character.starting_cash ?? gate.character.cash),
      lodgingId: gate.character.lodging_id,
    })

    const found = await client.query<ShopItemRow>(`SELECT * FROM shop_items WHERE id = $1`, [itemId])
    const item = found.rows[0]
    if (!item) {
      await client.query('ROLLBACK')
      return { ok: false as const, error: 'Item not found.', code: 404 }
    }
    if (item.stock != null && item.stock < count) {
      await client.query('ROLLBACK')
      return { ok: false as const, error: 'Sold out.', code: 400 }
    }

    const total = asMoney(item.price) * count
    const wrote = await applyCash(
      client,
      gate.character.id,
      -total,
      `Bought ${item.name}`,
      'purchase',
    )
    if (!wrote.ok) {
      await client.query('ROLLBACK')
      return {
        ok: false as const,
        error: wrote.error === INSUFFICIENT_FUNDS ? INSUFFICIENT_FUNDS : wrote.error,
        code: 400,
      }
    }

    await client.query(
      `INSERT INTO inventory (character_id, item_id, qty, acquired_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (character_id, item_id)
       DO UPDATE SET qty = inventory.qty + EXCLUDED.qty`,
      [gate.character.id, itemId, count],
    )
    if (item.stock != null) {
      await client.query(`UPDATE shop_items SET stock = stock - $2 WHERE id = $1`, [itemId, count])
    }

    const effects = parseJson<ShopEffects>(item.effects, {})
    if (itemId === LODGE_DEED_ITEM_ID || effects.item === LODGE_DEED_ITEM_ID) {
      await client.query(
        `UPDATE characters
         SET snapshot = COALESCE(snapshot, '{}'::jsonb) || jsonb_build_object('ownsLodge', true),
             updated_at = NOW()
         WHERE id = $1`,
        [gate.character.id],
      )
    }

    const inventory = await listInventoryItems(client, gate.character.id)
    await client.query('COMMIT')

    const state = await getPublicState(userId)
    if (!state.ok) return state
    return {
      ok: true as const,
      state: { ok: true as const, ...state.state },
      inventory,
      message: `Bought ${item.name}.`,
      questComplete: itemId === 'phone-basic' ? 'buy_phone' : undefined,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function listInventory(userId: string) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate
  const client = await pool.connect()
  try {
    const items = await listInventoryItems(client, gate.character.id)
    return { ok: true as const, items }
  } finally {
    client.release()
  }
}

export async function useInventoryItem(userId: string, itemId: string) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { row } = await tickAndWeekly(client, gate.character, gate.traits)

    const inv = await client.query<{ qty: number }>(
      `SELECT qty FROM inventory WHERE character_id = $1 AND item_id = $2 FOR UPDATE`,
      [gate.character.id, itemId],
    )
    if (!inv.rows[0] || inv.rows[0].qty < 1) {
      await client.query('ROLLBACK')
      return { ok: false as const, error: 'Item not found.', code: 404 }
    }
    const shop = await client.query<ShopItemRow>(`SELECT * FROM shop_items WHERE id = $1`, [itemId])
    const item = shop.rows[0]
    if (!item) {
      await client.query('ROLLBACK')
      return { ok: false as const, error: 'Item not found.', code: 404 }
    }
    const effects = parseJson<ShopEffects>(item.effects, {})
    if (!effects.needs) {
      await client.query('ROLLBACK')
      return { ok: false as const, error: 'That item cannot be used.', code: 400 }
    }

    const needs = clampNeeds(applyNeedDelta(parseNeeds(row.needs), effects.needs))
    await client.query(
      `UPDATE game_state
       SET needs = $2::jsonb, version = version + 1, updated_at = NOW()
       WHERE character_id = $1`,
      [gate.character.id, JSON.stringify(needs)],
    )
    await client.query(
      `UPDATE inventory SET qty = qty - 1 WHERE character_id = $1 AND item_id = $2`,
      [gate.character.id, itemId],
    )
    await client.query(
      `DELETE FROM inventory WHERE character_id = $1 AND item_id = $2 AND qty <= 0`,
      [gate.character.id, itemId],
    )

    const inventory = await listInventoryItems(client, gate.character.id)
    await client.query('COMMIT')
    const state = await getPublicState(userId)
    if (!state.ok) return state
    return {
      ok: true as const,
      state: { ok: true as const, ...state.state },
      inventory,
      message: `Used ${item.name}.`,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function getRent(userId: string) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { weekly } = await tickAndWeekly(client, gate.character, gate.traits)
    await client.query('COMMIT')
    const rent = weekly.rent
    if (!rent) return { ok: false as const, error: SETUP_INCOMPLETE, code: 409 }
    return { ok: true as const, rent }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function payRent(userId: string) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { row } = await tickAndWeekly(client, gate.character, gate.traits)
    await ensureRentRow(client, gate.character.id, gate.character.lodging_id, row.game_time)
    const found = await client.query<{
      lodging_id: string
      amount: string | number
      label: string
    }>(`SELECT lodging_id, amount, label FROM rent WHERE character_id = $1 FOR UPDATE`, [
      gate.character.id,
    ])
    const rent = found.rows[0]!
    const amount = asMoney(rent.amount)
    const wrote = await applyCash(
      client,
      gate.character.id,
      -amount,
      `Rent to ${rent.label}`,
      'rent',
    )
    if (!wrote.ok) {
      await client.query('ROLLBACK')
      return { ok: false as const, error: INSUFFICIENT_FUNDS, code: 400 }
    }

    // Refresh lodging from characters (may have been evicted earlier).
    const lodgingRow = await client.query<{ lodging_id: string | null }>(
      `SELECT lodging_id FROM characters WHERE id = $1`,
      [gate.character.id],
    )
    const rentInfo = await markRentPaid(client, {
      characterId: gate.character.id,
      gameTime: row.game_time,
      lodgingId: lodgingRow.rows[0]?.lodging_id ?? rent.lodging_id,
    })
    await client.query('COMMIT')

    const state = await getPublicState(userId)
    if (!state.ok) return state
    return {
      ok: true as const,
      state: { ok: true as const, ...state.state },
      rent: rentInfo,
      message: 'Rent paid. Baba Landlord is smiling. Warnings cleared.',
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function listHustles(userId: string) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { row } = await tickAndWeekly(client, gate.character, gate.traits)
    const clock = clockFromGameTime(row.game_time)
    const lockout = row.hustle_lockout_until ?? null
    const locked = typeof lockout === 'number' && row.game_time < lockout
    await client.query('COMMIT')

    return {
      ok: true as const,
      hustles: listHustleDefs().map((h) => ({
        ...h,
        locked: locked || (h.periods.length > 0 && !h.periods.includes(clock.period as never)),
        lockReason: locked
          ? 'You are locked out of risky hustles for a bit.'
          : h.periods.length > 0 && !h.periods.includes(clock.period as never)
            ? 'Wrong time of day for that.'
            : undefined,
      })),
      hustleLockoutUntil: lockout,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function runHustle(userId: string, hustleId: string) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate

  const hustle = getHustle(hustleId)
  if (!hustle) return { ok: false as const, error: 'That hustle is gone.', code: 404 }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    let { row } = await tickAndWeekly(client, gate.character, gate.traits)

    const lockout = row.hustle_lockout_until ?? null
    if (typeof lockout === 'number' && row.game_time < lockout) {
      await client.query('ROLLBACK')
      return { ok: false as const, error: 'HUSTLE_LOCKED', code: 400 }
    }

    const clock = clockFromGameTime(row.game_time)
    if (hustle.periods.length > 0 && !hustle.periods.includes(clock.period as never)) {
      await client.query('ROLLBACK')
      return { ok: false as const, error: NOT_ELIGIBLE, code: 400 }
    }

    let needs = parseNeeds(row.needs)
    if (needs.energy < hustle.energyCost) {
      await client.query('ROLLBACK')
      return { ok: false as const, error: NO_ENERGY, code: 400 }
    }

    needs = applyNeedDelta(needs, { energy: -hustle.energyCost })
    const outcome = rollHustleOutcome(hustle, row.game_time)
    let message = ''
    let earned = 0
    let fine = 0

    if (outcome.kind === 'reward') {
      const wrote = await applyCash(
        client,
        gate.character.id,
        outcome.amount,
        hustle.title,
        'event',
      )
      if (!wrote.ok) {
        await client.query('ROLLBACK')
        return { ok: false as const, error: wrote.error, code: 400 }
      }
      earned = outcome.amount
      message = `${hustle.title}: somehow it paid. +₦${outcome.amount.toLocaleString()}`
    } else if (outcome.kind === 'fine') {
      const cash = asMoney(row.cash)
      const take = Math.min(outcome.amount, cash) // never below zero
      if (take > 0) {
        const wrote = await applyCash(
          client,
          gate.character.id,
          -take,
          `${hustle.title} fine`,
          'fine',
        )
        if (!wrote.ok) {
          await client.query('ROLLBACK')
          return { ok: false as const, error: wrote.error, code: 400 }
        }
      }
      fine = take
      message =
        take < outcome.amount
          ? `${hustle.title}: fine clipped to what you had (₦${take.toLocaleString()}).`
          : `${hustle.title}: fine ₦${take.toLocaleString()}.`
    } else if (outcome.kind === 'rep_loss') {
      await client.query(
        `UPDATE game_state
         SET reputation = GREATEST(0, COALESCE(reputation, 50) - $2),
             version = version + 1, updated_at = NOW()
         WHERE character_id = $1`,
        [gate.character.id, outcome.amount],
      )
      message = `${hustle.title}: your name took a hit (−${outcome.amount} rep).`
    } else {
      await client.query(
        `UPDATE game_state
         SET hustle_lockout_until = $2, version = version + 1, updated_at = NOW()
         WHERE character_id = $1`,
        [gate.character.id, outcome.untilGameTime],
      )
      message = `${hustle.title}: locked out for a while. Cool off.`
    }

    await client.query(
      `UPDATE game_state
       SET needs = $2::jsonb, game_time = $3, version = version + 1, updated_at = NOW(), last_tick_at = NOW()
       WHERE character_id = $1`,
      [gate.character.id, JSON.stringify(clampNeeds(needs)), row.game_time + 30],
    )

    await client.query('COMMIT')
    const state = await getPublicState(userId)
    if (!state.ok) return state
    return {
      ok: true as const,
      state: { ok: true as const, ...state.state },
      outcome: outcome.kind,
      earned,
      fine,
      message,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function listLedger(userId: string, limit = 20, cursor?: string | null) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate
  const take = Math.max(1, Math.min(100, Math.floor(limit)))

  const client = await pool.connect()
  try {
    const cashRow = await client.query<{ cash: string | number }>(
      `SELECT cash FROM game_state WHERE character_id = $1`,
      [gate.character.id],
    )
    if (!cashRow.rows[0]) return { ok: false as const, error: SETUP_INCOMPLETE, code: 409 }

    let cursorCreatedAt: Date | null = null
    let cursorId: string | null = null
    if (cursor) {
      const anchor = await client.query<{ id: string; created_at: Date }>(
        `SELECT id, created_at FROM ledger WHERE character_id = $1 AND id = $2`,
        [gate.character.id, cursor],
      )
      if (anchor.rows[0]) {
        cursorId = anchor.rows[0].id
        cursorCreatedAt =
          anchor.rows[0].created_at instanceof Date
            ? anchor.rows[0].created_at
            : new Date(anchor.rows[0].created_at)
      }
    }

    const rows = cursorCreatedAt && cursorId
      ? await client.query<{
          id: string
          amount: string | number
          reason: string
          kind: string | null
          balance_after: string | number | null
          created_at: Date
        }>(
          `SELECT id, amount, reason, kind, balance_after, created_at
           FROM ledger
           WHERE character_id = $1
             AND (created_at, id) < ($2, $3)
           ORDER BY created_at DESC, id DESC
           LIMIT $4`,
          [gate.character.id, cursorCreatedAt, cursorId, take],
        )
      : await client.query<{
          id: string
          amount: string | number
          reason: string
          kind: string | null
          balance_after: string | number | null
          created_at: Date
        }>(
          `SELECT id, amount, reason, kind, balance_after, created_at
           FROM ledger
           WHERE character_id = $1
           ORDER BY created_at DESC, id DESC
           LIMIT $2`,
          [gate.character.id, take],
        )

    const entries = rows.rows.map((row) => ({
      id: row.id,
      amount: asMoney(row.amount),
      reason: row.reason,
      kind: row.kind ?? undefined,
      createdAt: (row.created_at instanceof Date
        ? row.created_at
        : new Date(row.created_at)
      ).toISOString(),
      balanceAfter:
        row.balance_after == null ? undefined : asMoney(row.balance_after),
    }))
    const last = entries[entries.length - 1]
    return {
      ok: true as const,
      cash: asMoney(cashRow.rows[0].cash),
      entries,
      nextCursor: entries.length === take && last ? last.id : null,
    }
  } finally {
    client.release()
  }
}
