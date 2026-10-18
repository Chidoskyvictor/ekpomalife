import { afterAll, describe, expect, it } from 'vitest'
import { pool } from '../db.js'
import { cleanupTestUser, createTestUser } from '../test/db-fixtures.js'
import { DAY_MINUTES } from './time.js'
import { mondayDayForWeek, rentDayForWeek } from './calendar.js'
import {
  ALLOWANCE_AMOUNT,
  LANDLORD_KIND,
  applyAllowanceCatchup,
  applyLandlordIncomeCatchup,
  sumLedgerEqualsCash,
} from './payouts.js'
import { LODGE_DEED_ITEM_ID, LODGE_INCOME_WEEKLY, EVICTION_LODGING_ID } from './lodging.js'
import { listHustles, payRent, runHustle } from './economy.js'
import { applyCash, asMoney } from './game-state.js'
import { advanceRentLadder, ensureRentRow } from './rent-ladder.js'
import { getHustle, rollHustleOutcome } from './hustles.js'

const usersToClean: string[] = []

afterAll(async () => {
  for (const id of usersToClean) {
    await cleanupTestUser(id).catch(() => undefined)
  }
  await pool.end()
})

async function setGameDay(characterId: string, day: number, hour = 10) {
  const gameTime = (day - 1) * DAY_MINUTES + hour * 60
  await pool.query(
    `UPDATE game_state SET game_time = $2, last_tick_at = NOW() WHERE character_id = $1`,
    [characterId, gameTime],
  )
  return gameTime
}

describe('Phase 2 complete — allowance', () => {
  it('pays Monday allowance once per game week and never twice under concurrency', async () => {
    const user = await createTestUser({ cash: 10_000 })
    usersToClean.push(user.userId)

    const monday = mondayDayForWeek(0)
    const gameTime = await setGameDay(user.characterId, monday)

    const run = async () => {
      const c = await pool.connect()
      try {
        await c.query('BEGIN')
        await c.query(`SELECT 1 FROM game_state WHERE character_id = $1 FOR UPDATE`, [
          user.characterId,
        ])
        const n = await applyAllowanceCatchup(c, {
          characterId: user.characterId,
          characterType: 'student',
          gameTime,
        })
        await c.query('COMMIT')
        return n
      } catch (e) {
        await c.query('ROLLBACK')
        throw e
      } finally {
        c.release()
      }
    }

    const [a, b] = await Promise.all([run(), run()])
    const paid = [...a, ...b].filter((n) => n.kind === 'allowance')
    expect(paid).toHaveLength(1)
    expect(paid[0]!.amount).toBe(ALLOWANCE_AMOUNT)

    const cash = await pool.query<{ cash: string }>(
      `SELECT cash FROM game_state WHERE character_id = $1`,
      [user.characterId],
    )
    expect(asMoney(cash.rows[0]!.cash)).toBe(10_000 + ALLOWANCE_AMOUNT)

    const payouts = await pool.query(
      `SELECT * FROM payouts WHERE character_id = $1 AND kind = 'allowance'`,
      [user.characterId],
    )
    expect(payouts.rowCount).toBe(1)

    const client = await pool.connect()
    try {
      const { cash: bal, ledgerSum } = await sumLedgerEqualsCash(client, user.characterId)
      expect(ledgerSum).toBe(bal)
    } finally {
      client.release()
    }
  })

  it('catches up missed Mondays capped at 4', async () => {
    const user = await createTestUser({ cash: 0 })
    usersToClean.push(user.userId)
    const day = mondayDayForWeek(5)
    const gameTime = await setGameDay(user.characterId, day)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const notices = await applyAllowanceCatchup(client, {
        characterId: user.characterId,
        characterType: 'student',
        gameTime,
      })
      await client.query('COMMIT')
      expect(notices.length).toBe(4)
    } finally {
      client.release()
    }

    const cash = await pool.query<{ cash: string }>(
      `SELECT cash FROM game_state WHERE character_id = $1`,
      [user.characterId],
    )
    expect(asMoney(cash.rows[0]!.cash)).toBe(ALLOWANCE_AMOUNT * 4)
  })
})

describe('Phase 2 complete — rent ladder', () => {
  it('escalates due → warning 1 → warning 2 → eviction; pay clears warnings', async () => {
    const user = await createTestUser({ cash: 50_000 })
    usersToClean.push(user.userId)

    let gameTime = await setGameDay(user.characterId, 2)
    {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await ensureRentRow(client, user.characterId, 'onebed-ojo', gameTime)
        await client.query(
          `UPDATE rent SET lodging_id = 'onebed-ojo', amount = 10500, due_game_day = 3,
             paid_until_game_day = 1, status = 'due', warnings = 0 WHERE character_id = $1`,
          [user.characterId],
        )
        await client.query(`UPDATE characters SET lodging_id = 'onebed-ojo' WHERE id = $1`, [
          user.characterId,
        ])
        await client.query('COMMIT')
      } finally {
        client.release()
      }
    }

    gameTime = await setGameDay(user.characterId, rentDayForWeek(0) + 1)
    {
      const c = await pool.connect()
      try {
        await c.query('BEGIN')
        const r = await advanceRentLadder(c, {
          characterId: user.characterId,
          gameTime,
          lodgingId: 'onebed-ojo',
        })
        await c.query('COMMIT')
        expect(r.rent?.warnings).toBe(1)
        expect(r.rent?.status).toBe('late')
      } finally {
        c.release()
      }
    }

    gameTime = await setGameDay(user.characterId, rentDayForWeek(1) + 1)
    {
      const c = await pool.connect()
      try {
        await c.query('BEGIN')
        const r = await advanceRentLadder(c, {
          characterId: user.characterId,
          gameTime,
          lodgingId: 'onebed-ojo',
        })
        await c.query('COMMIT')
        expect(r.rent?.warnings).toBe(2)
      } finally {
        c.release()
      }
    }

    gameTime = await setGameDay(user.characterId, rentDayForWeek(2) + 1)
    {
      const c = await pool.connect()
      try {
        await c.query('BEGIN')
        const r = await advanceRentLadder(c, {
          characterId: user.characterId,
          gameTime,
          lodgingId: 'onebed-ojo',
        })
        await c.query('COMMIT')
        expect(r.rent?.status).toBe('evicted')
        expect(r.rent?.lodgingId).toBe(EVICTION_LODGING_ID)
        expect(r.notices.some((m) => /Evicted/i.test(m))).toBe(true)
      } finally {
        c.release()
      }
    }

    const lodging = await pool.query<{ lodging_id: string }>(
      `SELECT lodging_id FROM characters WHERE id = $1`,
      [user.characterId],
    )
    expect(lodging.rows[0]!.lodging_id).toBe(EVICTION_LODGING_ID)

    const paid = await payRent(user.userId)
    expect(paid.ok).toBe(true)
    if (paid.ok) {
      expect(paid.rent.warnings).toBe(0)
      expect(paid.rent.status).toBe('ok')
      expect(paid.rent.evictedAt).toBeNull()
    }

    const client = await pool.connect()
    try {
      const { cash: bal, ledgerSum } = await sumLedgerEqualsCash(client, user.characterId)
      expect(ledgerSum).toBe(bal)
    } finally {
      client.release()
    }
  })
})

describe('Phase 2 complete — landlord income', () => {
  it('pays once per week only when lodge-deed is owned', async () => {
    const user = await createTestUser({ cash: 5_000 })
    usersToClean.push(user.userId)
    const sat = rentDayForWeek(0)
    const gameTime = await setGameDay(user.characterId, sat)

    {
      const c = await pool.connect()
      try {
        await c.query('BEGIN')
        const n = await applyLandlordIncomeCatchup(c, {
          characterId: user.characterId,
          gameTime,
        })
        await c.query('COMMIT')
        expect(n).toHaveLength(0)
      } finally {
        c.release()
      }
    }

    await pool.query(
      `INSERT INTO inventory (character_id, item_id, qty) VALUES ($1, $2, 1)
       ON CONFLICT (character_id, item_id) DO UPDATE SET qty = 1`,
      [user.characterId, LODGE_DEED_ITEM_ID],
    )

    const run = async () => {
      const c = await pool.connect()
      try {
        await c.query('BEGIN')
        await c.query(`SELECT 1 FROM game_state WHERE character_id = $1 FOR UPDATE`, [
          user.characterId,
        ])
        const n = await applyLandlordIncomeCatchup(c, {
          characterId: user.characterId,
          gameTime,
        })
        await c.query('COMMIT')
        return n
      } catch (e) {
        await c.query('ROLLBACK')
        throw e
      } finally {
        c.release()
      }
    }

    const [a, b] = await Promise.all([run(), run()])
    expect([...a, ...b].filter((n) => n.kind === 'rent')).toHaveLength(1)

    const ledger = await pool.query<{ kind: string; amount: string }>(
      `SELECT kind, amount FROM ledger WHERE character_id = $1 AND reason = 'Lodge rent income'`,
      [user.characterId],
    )
    expect(ledger.rowCount).toBe(1)
    expect(ledger.rows[0]!.kind).toBe('rent')
    expect(asMoney(ledger.rows[0]!.amount)).toBe(LODGE_INCOME_WEEKLY)

    const snap = await pool.query<{ snapshot: { ownsLodge?: boolean } }>(
      `SELECT snapshot FROM characters WHERE id = $1`,
      [user.characterId],
    )
    expect(snap.rows[0]!.snapshot?.ownsLodge).toBe(true)

    const payouts = await pool.query(
      `SELECT * FROM payouts WHERE character_id = $1 AND kind = $2`,
      [user.characterId, LANDLORD_KIND],
    )
    expect(payouts.rowCount).toBe(1)
  })
})

describe('Phase 2 complete — hustles', () => {
  it('fine never takes cash below zero; lockout is enforced server-side', async () => {
    const user = await createTestUser({ cash: 100 })
    usersToClean.push(user.userId)
    await pool.query(
      `UPDATE game_state SET game_time = $2, needs = $3::jsonb WHERE character_id = $1`,
      [
        user.characterId,
        14 * 60,
        JSON.stringify({
          hunger: 80,
          energy: 90,
          hygiene: 80,
          fun: 70,
          social: 70,
          study: 50,
        }),
      ],
    )

    const hustle = getHustle('sort-lecturer')!
    const fineRoll = rollHustleOutcome(hustle, 14 * 60, () => 45)
    expect(fineRoll.kind).toBe('fine')

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const cashRow = await client.query<{ cash: string }>(
        `SELECT cash FROM game_state WHERE character_id = $1 FOR UPDATE`,
        [user.characterId],
      )
      const cash = asMoney(cashRow.rows[0]!.cash)
      const take = Math.min(fineRoll.kind === 'fine' ? fineRoll.amount : 0, cash)
      const wrote = await applyCash(client, user.characterId, -take, 'test fine', 'fine')
      expect(wrote.ok).toBe(true)
      if (wrote.ok) expect(wrote.cash).toBe(0)
      await client.query('COMMIT')
    } finally {
      client.release()
    }

    {
      const c = await pool.connect()
      try {
        await c.query('BEGIN')
        await applyCash(c, user.characterId, 5000, 'test top-up', 'event')
        await c.query(
          `UPDATE game_state SET hustle_lockout_until = $2, needs = $3::jsonb, game_time = $4
           WHERE character_id = $1`,
          [
            user.characterId,
            20 * 60,
            JSON.stringify({
              hunger: 80,
              energy: 90,
              hygiene: 80,
              fun: 70,
              social: 70,
              study: 50,
            }),
            14 * 60,
          ],
        )
        await c.query('COMMIT')
      } finally {
        c.release()
      }
    }

    const locked = await runHustle(user.userId, 'sort-lecturer')
    expect(locked.ok).toBe(false)
    if (!locked.ok) expect(locked.error).toBe('HUSTLE_LOCKED')

    const list = await listHustles(user.userId)
    expect(list.ok).toBe(true)
    if (list.ok) {
      expect(list.hustles.every((h) => h.locked)).toBe(true)
    }

    const balClient = await pool.connect()
    try {
      const { cash: bal, ledgerSum } = await sumLedgerEqualsCash(balClient, user.characterId)
      expect(ledgerSum).toBe(bal)
    } finally {
      balClient.release()
    }
  })
})
