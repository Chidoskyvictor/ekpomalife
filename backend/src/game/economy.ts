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
import { normalizeLodgingId, rentWeeklyForLodging } from './lodging.js'
import { applyNeedDelta, clampNeeds, type Needs } from './needs.js'
import { computeSetupStatus } from './setup-status.js'
import { checkTraits, type TraitId } from './traits.js'

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
    `SELECT id, appearance, traits, dream_id, lodging_id, starting_cash, cash
     FROM characters WHERE user_id = $1`,
    [userId],
  )
  return found.rows[0] ?? null
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

export async function ensureRentRow(
  client: PoolClient,
  characterId: string,
  lodgingId: string | null | undefined,
) {
  const lodging = normalizeLodgingId(lodgingId)
  const amount = rentWeeklyForLodging(lodging)
  const existing = await client.query(`SELECT character_id FROM rent WHERE character_id = $1`, [
    characterId,
  ])
  if (existing.rows[0]) return
  const dueAt = new Date(Date.now() + 2 * 86400000)
  const paidUntil = new Date(Date.now() - 5 * 86400000)
  await client.query(
    `INSERT INTO rent (character_id, lodging_id, amount, due_at, paid_until, status, label)
     VALUES ($1, $2, $3, $4, $5, 'due', 'Baba Landlord')`,
    [characterId, lodging, amount, dueAt, paidUntil],
  )
}

function rentStatus(dueAt: Date, now = new Date()): 'ok' | 'due' | 'late' {
  const ms = dueAt.getTime() - now.getTime()
  if (ms < -86400000) return 'late'
  if (ms <= 2 * 86400000) return 'due'
  return 'ok'
}

export async function listJobs(userId: string, placeId?: string | null) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    let row = await ensureGameState(client, gate.character.id, {
      cash: asMoney(gate.character.starting_cash ?? gate.character.cash),
      lodgingId: gate.character.lodging_id,
      reason: 'starting-money',
    })
    row = await tickGameState(client, row, gate.traits)
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
    let row = await ensureGameState(client, gate.character.id, {
      cash: asMoney(gate.character.starting_cash ?? gate.character.cash),
      lodgingId: gate.character.lodging_id,
    })
    row = await tickGameState(client, row, gate.traits)
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
    let row = await ensureGameState(client, gate.character.id, {
      cash: asMoney(gate.character.starting_cash ?? gate.character.cash),
      lodgingId: gate.character.lodging_id,
    })
    row = await tickGameState(client, row, gate.traits)

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
  return {
    ok: true as const,
    placeId: items.rows[0]?.place_id ?? resolved,
    items: items.rows.map((item) => ({
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
    if (effects.item === 'phone') {
      // phone unlock is tracked via inventory item id phone-basic
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
    let row = await ensureGameState(client, gate.character.id, {
      cash: asMoney(gate.character.starting_cash ?? gate.character.cash),
      lodgingId: gate.character.lodging_id,
    })
    row = await tickGameState(client, row, gate.traits)

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
    await ensureGameState(client, gate.character.id, {
      cash: asMoney(gate.character.starting_cash ?? gate.character.cash),
      lodgingId: gate.character.lodging_id,
    })
    await ensureRentRow(client, gate.character.id, gate.character.lodging_id)
    const found = await client.query<{
      lodging_id: string
      amount: string | number
      due_at: Date
      paid_until: Date
      status: string
      label: string
    }>(`SELECT * FROM rent WHERE character_id = $1`, [gate.character.id])
    const row = found.rows[0]!
    const dueAt = row.due_at instanceof Date ? row.due_at : new Date(row.due_at)
    const status = rentStatus(dueAt)
    if (status !== row.status) {
      await client.query(`UPDATE rent SET status = $2 WHERE character_id = $1`, [
        gate.character.id,
        status,
      ])
    }
    await client.query('COMMIT')
    return {
      ok: true as const,
      rent: {
        lodgingId: row.lodging_id,
        amount: asMoney(row.amount),
        dueAt: dueAt.toISOString(),
        paidUntil: (row.paid_until instanceof Date
          ? row.paid_until
          : new Date(row.paid_until)
        ).toISOString(),
        status,
        label: row.label,
      },
    }
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
    await ensureGameState(client, gate.character.id, {
      cash: asMoney(gate.character.starting_cash ?? gate.character.cash),
      lodgingId: gate.character.lodging_id,
    })
    await ensureRentRow(client, gate.character.id, gate.character.lodging_id)
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

    const paidUntil = new Date(Date.now() + 7 * 86400000)
    await client.query(
      `UPDATE rent
       SET status = 'ok', paid_until = $2, due_at = $2
       WHERE character_id = $1`,
      [gate.character.id, paidUntil],
    )
    await client.query('COMMIT')

    const state = await getPublicState(userId)
    if (!state.ok) return state
    return {
      ok: true as const,
      state: { ok: true as const, ...state.state },
      rent: {
        lodgingId: rent.lodging_id,
        amount,
        dueAt: paidUntil.toISOString(),
        paidUntil: paidUntil.toISOString(),
        status: 'ok' as const,
        label: rent.label,
      },
      message: 'Rent paid. Baba Landlord is smiling.',
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
