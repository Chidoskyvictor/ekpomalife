import { afterAll, describe, expect, it } from 'vitest'
import { pool } from '../db.js'
import { cleanupTestUser, createTestUser } from '../test/db-fixtures.js'
import {
  buyItem,
  listInventory,
  listJobs,
  listLedger,
  requireEconomySetup,
} from './economy.js'
import { INSUFFICIENT_FUNDS, SETUP_INCOMPLETE } from './economy-codes.js'
import { asMoney } from './game-state.js'

const usersToClean: string[] = []

afterAll(async () => {
  for (const id of usersToClean) {
    await cleanupTestUser(id).catch(() => undefined)
  }
  await pool.end()
})

describe('Phase 2 economy API (DB)', () => {
  it('rejects unfinished users with SETUP_INCOMPLETE', async () => {
    const user = await createTestUser({ complete: false })
    usersToClean.push(user.userId)
    const gate = await requireEconomySetup(user.userId)
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.error).toBe(SETUP_INCOMPLETE)
      expect(gate.code).toBe(409)
    }
    const jobs = await listJobs(user.userId)
    expect(jobs.ok).toBe(false)
    if (!jobs.ok) expect(jobs.error).toBe(SETUP_INCOMPLETE)
  })

  it('fails buy with too little money and leaves balance unchanged', async () => {
    const user = await createTestUser({ cash: 100 })
    usersToClean.push(user.userId)

    const before = await pool.query<{ cash: string }>(
      `SELECT cash FROM game_state WHERE character_id = $1`,
      [user.characterId],
    )
    expect(asMoney(before.rows[0]!.cash)).toBe(100)

    const result = await buyItem(user.userId, 'phone-basic', 1)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe(INSUFFICIENT_FUNDS)

    const after = await pool.query<{ cash: string }>(
      `SELECT cash FROM game_state WHERE character_id = $1`,
      [user.characterId],
    )
    expect(asMoney(after.rows[0]!.cash)).toBe(100)

    const inv = await listInventory(user.userId)
    expect(inv.ok).toBe(true)
    if (inv.ok) expect(inv.items).toEqual([])
  })

  it('prevents two simultaneous buys from overspending', async () => {
    // phone-basic is ₦2500 — cash enough for exactly one
    const user = await createTestUser({ cash: 2500 })
    usersToClean.push(user.userId)

    const [a, b] = await Promise.all([
      buyItem(user.userId, 'phone-basic', 1),
      buyItem(user.userId, 'phone-basic', 1),
    ])

    const wins = [a, b].filter((row) => row.ok)
    const fails = [a, b].filter((row) => !row.ok)
    expect(wins).toHaveLength(1)
    expect(fails).toHaveLength(1)
    if (!fails[0]!.ok) expect(fails[0].error).toBe(INSUFFICIENT_FUNDS)

    const cash = await pool.query<{ cash: string }>(
      `SELECT cash FROM game_state WHERE character_id = $1`,
      [user.characterId],
    )
    expect(asMoney(cash.rows[0]!.cash)).toBe(0)

    const qty = await pool.query<{ qty: number }>(
      `SELECT qty FROM inventory WHERE character_id = $1 AND item_id = 'phone-basic'`,
      [user.characterId],
    )
    expect(qty.rows[0]?.qty ?? 0).toBe(1)
  })

  it('writes a ledger row for every money change and sum equals balance', async () => {
    const user = await createTestUser({ cash: 10_000 })
    usersToClean.push(user.userId)

    const buy = await buyItem(user.userId, 'gala-fanta', 2)
    expect(buy.ok).toBe(true)

    const cashRow = await pool.query<{ cash: string }>(
      `SELECT cash FROM game_state WHERE character_id = $1`,
      [user.characterId],
    )
    const cash = asMoney(cashRow.rows[0]!.cash)
    expect(cash).toBe(10_000 - 300 * 2)

    const ledger = await pool.query<{ amount: string }>(
      `SELECT amount FROM ledger WHERE character_id = $1`,
      [user.characterId],
    )
    const sum = ledger.rows.reduce((total, row) => total + asMoney(row.amount), 0)
    expect(sum).toBe(cash)

    const api = await listLedger(user.userId, 50)
    expect(api.ok).toBe(true)
    if (api.ok) {
      expect(api.cash).toBe(cash)
      expect(api.entries.some((entry) => entry.kind === 'purchase')).toBe(true)
      expect(api.entries.some((entry) => entry.kind === 'starting_money')).toBe(true)
    }
  })
})
