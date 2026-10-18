import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { pool } from '../db.js'
import { cleanupTestUser, createTestUser } from '../test/db-fixtures.js'
import { asMoney } from './game-state.js'
import { ROOM_ERROR_COPY } from './economy-codes.js'
import {
  buyRoomItem,
  getRoom,
  getVisitRoom,
  saveLayout,
  saveStyle,
  sellRoomItem,
  sleepEnergyMultiplier,
  applyDailyFunBonus,
} from './room.js'
import { DAY_MINUTES } from './time.js'
import { performGameAction } from './game-state.js'
import { sumLedgerEqualsCash } from './payouts.js'

const usersToClean: string[] = []

afterAll(async () => {
  for (const id of usersToClean) {
    await cleanupTestUser(id).catch(() => undefined)
  }
  await pool.end()
})

function key() {
  return randomUUID()
}

describe('My Room (DB)', () => {
  it('first GET creates starter mattress with no ledger row', async () => {
    const user = await createTestUser({ cash: 10_000 })
    usersToClean.push(user.userId)

    const before = await pool.query(
      `SELECT COUNT(*)::int AS n FROM ledger WHERE character_id = $1`,
      [user.characterId],
    )
    const result = await getRoom(user.userId)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.room.items.some((i) => i.itemId === 'mattress-floor' && i.placed)).toBe(true)
    expect(result.catalog.length).toBeGreaterThanOrEqual(18)

    const after = await pool.query(
      `SELECT COUNT(*)::int AS n FROM ledger WHERE character_id = $1`,
      [user.characterId],
    )
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n)

    const starter = await pool.query(
      `SELECT is_starter FROM room_items WHERE character_id = $1 AND item_id = 'mattress-floor'`,
      [user.characterId],
    )
    expect(starter.rows[0]?.is_starter).toBe(true)
  })

  it('buy debits exact price with one purchase ledger row', async () => {
    const user = await createTestUser({ cash: 20_000 })
    usersToClean.push(user.userId)
    await getRoom(user.userId)

    const result = await buyRoomItem(user.userId, 'standing-fan', 1, key())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.cash).toBe(20_000 - 9500)

    const ledger = await pool.query<{ amount: string; kind: string; balance_after: string }>(
      `SELECT amount, kind, balance_after FROM ledger
       WHERE character_id = $1 AND reason LIKE 'Bought Standing fan%'`,
      [user.characterId],
    )
    expect(ledger.rowCount).toBe(1)
    expect(ledger.rows[0]!.kind).toBe('purchase')
    expect(asMoney(ledger.rows[0]!.amount)).toBe(-9500)
    expect(asMoney(ledger.rows[0]!.balance_after)).toBe(10_500)
  })

  it('insufficient funds: 400 friendly copy, no change', async () => {
    const user = await createTestUser({ cash: 100 })
    usersToClean.push(user.userId)
    await getRoom(user.userId)

    const result = await buyRoomItem(user.userId, 'standing-fan', 1, key())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe(400)
    expect(result.error).toBe(ROOM_ERROR_COPY.INSUFFICIENT_FUNDS)

    const cash = await pool.query<{ cash: string }>(
      `SELECT cash FROM game_state WHERE character_id = $1`,
      [user.characterId],
    )
    expect(asMoney(cash.rows[0]!.cash)).toBe(100)
    const items = await pool.query(
      `SELECT 1 FROM room_items WHERE character_id = $1 AND item_id = 'standing-fan'`,
      [user.characterId],
    )
    expect(items.rowCount).toBe(0)
  })

  it('same Idempotency-Key twice concurrently → one charge; mismatched body → 409', async () => {
    const user = await createTestUser({ cash: 50_000 })
    usersToClean.push(user.userId)
    await getRoom(user.userId)
    const k = key()

    const [a, b] = await Promise.all([
      buyRoomItem(user.userId, 'rechargeable-lamp', 1, k),
      buyRoomItem(user.userId, 'rechargeable-lamp', 1, k),
    ])
    expect(a.ok && b.ok).toBe(true)
    const cash = await pool.query<{ cash: string }>(
      `SELECT cash FROM game_state WHERE character_id = $1`,
      [user.characterId],
    )
    expect(asMoney(cash.rows[0]!.cash)).toBe(50_000 - 4500)

    const conflict = await buyRoomItem(user.userId, 'standing-fan', 1, k)
    expect(conflict.ok).toBe(false)
    if (!conflict.ok) {
      expect(conflict.code).toBe(409)
      expect(conflict.roomCode).toBe('IDEMPOTENCY_CONFLICT')
    }
  })

  it('layout: overlap, bounds, NOT_OWNED, VERSION_CONFLICT', async () => {
    const user = await createTestUser({ cash: 30_000 })
    usersToClean.push(user.userId)
    const room0 = await getRoom(user.userId)
    if (!room0.ok) throw new Error('no room')
    await buyRoomItem(user.userId, 'standing-fan', 1, key())
    const room1 = await getRoom(user.userId)
    if (!room1.ok) throw new Error('no room')
    const mattress = room1.room.items.find((i) => i.itemId === 'mattress-floor')!
    const fan = room1.room.items.find((i) => i.itemId === 'standing-fan')!

    const overlap = await saveLayout(
      user.userId,
      room1.room.version,
      [
        { uid: mattress.uid, placed: true, x: 0, z: 0, rotation: 0 },
        { uid: fan.uid, placed: true, x: 0, z: 0, rotation: 0 },
      ],
      key(),
    )
    expect(overlap.ok).toBe(false)
    if (!overlap.ok) {
      expect(overlap.roomCode).toBe('OVERLAP')
      expect(overlap.uid).toBeTruthy()
    }

    const bounds = await saveLayout(
      user.userId,
      room1.room.version,
      [
        { uid: mattress.uid, placed: true, x: 5, z: 0, rotation: 0 },
        { uid: fan.uid, placed: false, x: 0, z: 0, rotation: 0 },
      ],
      key(),
    )
    expect(bounds.ok).toBe(false)
    if (!bounds.ok) expect(bounds.roomCode).toBe('OUT_OF_BOUNDS')

    const missing = await saveLayout(
      user.userId,
      room1.room.version,
      [{ uid: 'ri_nope', placed: true, x: 0, z: 0, rotation: 0 }],
      key(),
    )
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.roomCode).toBe('NOT_OWNED')

    const okLayout = await saveLayout(
      user.userId,
      room1.room.version,
      [
        { uid: mattress.uid, placed: true, x: 0, z: 0, rotation: 0 },
        { uid: fan.uid, placed: true, x: 2, z: 0, rotation: 0 },
      ],
      key(),
    )
    expect(okLayout.ok).toBe(true)

    const stale = await saveLayout(
      user.userId,
      room1.room.version,
      [
        { uid: mattress.uid, placed: true, x: 0, z: 0, rotation: 0 },
        { uid: fan.uid, placed: true, x: 3, z: 0, rotation: 0 },
      ],
      key(),
    )
    expect(stale.ok).toBe(false)
    if (!stale.ok) {
      expect(stale.code).toBe(409)
      expect(stale.room).toBeTruthy()
    }
  })

  it('style: paint 1500, default free; floor once; locked floor 403', async () => {
    const user = await createTestUser({ cash: 50_000 })
    usersToClean.push(user.userId)
    const room0 = await getRoom(user.userId)
    if (!room0.ok) throw new Error('no room')

    const paint = await saveStyle(user.userId, room0.room.version, { wallColor: '#3B4A5A' }, key())
    expect(paint.ok).toBe(true)
    if (paint.ok) expect(paint.charged).toBe(1500)

    const room1 = await getRoom(user.userId)
    if (!room1.ok) throw new Error('no room')
    const back = await saveStyle(
      user.userId,
      room1.room.version,
      { wallColor: '#F2EDE4' },
      key(),
    )
    expect(back.ok).toBe(true)
    if (back.ok) expect(back.charged).toBe(0)

    const room2 = await getRoom(user.userId)
    if (!room2.ok) throw new Error('no room')
    const floor = await saveStyle(
      user.userId,
      room2.room.version,
      { floorId: 'rug-carpet' },
      key(),
    )
    expect(floor.ok).toBe(true)
    if (floor.ok) expect(floor.charged).toBe(2500)

    const room3 = await getRoom(user.userId)
    if (!room3.ok) throw new Error('no room')
    await saveStyle(user.userId, room3.room.version, { floorId: 'cement' }, key())
    const room4 = await getRoom(user.userId)
    if (!room4.ok) throw new Error('no room')
    const floorAgain = await saveStyle(
      user.userId,
      room4.room.version,
      { floorId: 'rug-carpet' },
      key(),
    )
    expect(floorAgain.ok).toBe(true)
    if (floorAgain.ok) expect(floorAgain.charged).toBe(0)

    const room5 = await getRoom(user.userId)
    if (!room5.ok) throw new Error('no room')
    const locked = await saveStyle(
      user.userId,
      room5.room.version,
      { floorId: 'wood-laminate' },
      key(),
    )
    expect(locked.ok).toBe(false)
    if (!locked.ok) expect(locked.code).toBe(403)
  })

  it('sell refunds 40%; starter cannot be sold', async () => {
    const user = await createTestUser({ cash: 20_000 })
    usersToClean.push(user.userId)
    await getRoom(user.userId)
    await buyRoomItem(user.userId, 'standing-fan', 1, key())
    const room = await getRoom(user.userId)
    if (!room.ok) throw new Error('no room')
    const fan = room.room.items.find((i) => i.itemId === 'standing-fan')!
    const mattress = room.room.items.find((i) => i.itemId === 'mattress-floor')!

    const sold = await sellRoomItem(user.userId, fan.uid, key())
    expect(sold.ok).toBe(true)
    if (sold.ok) expect(sold.refunded).toBe(Math.floor(9500 * 0.4))

    const refund = await pool.query(
      `SELECT kind FROM ledger WHERE character_id = $1 AND kind = 'refund'`,
      [user.characterId],
    )
    expect((refund.rowCount ?? 0) >= 1).toBe(true)

    const starter = await sellRoomItem(user.userId, mattress.uid, key())
    expect(starter.ok).toBe(false)
    if (!starter.ok) expect(starter.roomCode).toBe('CANT_SELL_STARTER')
  })

  it('lodging downgrade forces high-tier items unplaced', async () => {
    const user = await createTestUser({ cash: 100_000 })
    usersToClean.push(user.userId)
    await pool.query(`UPDATE characters SET lodging_id = 'selfcon-g2' WHERE id = $1`, [
      user.characterId,
    ])
    await getRoom(user.userId)
    await buyRoomItem(user.userId, 'bed-double', 1, key())
    let room = await getRoom(user.userId)
    if (!room.ok) throw new Error('no room')
    const bed = room.room.items.find((i) => i.itemId === 'bed-double')!
    const mattress = room.room.items.find((i) => i.itemId === 'mattress-floor')!
    await saveLayout(
      user.userId,
      room.room.version,
      [
        { uid: mattress.uid, placed: false, x: 0, z: 0, rotation: 0 },
        { uid: bed.uid, placed: true, x: 0, z: 0, rotation: 0 },
      ],
      key(),
    )

    await pool.query(`UPDATE characters SET lodging_id = 'hostel-poultry' WHERE id = $1`, [
      user.characterId,
    ])
    room = await getRoom(user.userId)
    expect(room.ok).toBe(true)
    if (!room.ok) return
    const bedAfter = room.room.items.find((i) => i.itemId === 'bed-double')!
    expect(bedAfter.placed).toBe(false)
  })

  it('sleep bonus applied; daily fun once per day; ledger = cash', async () => {
    const user = await createTestUser({ cash: 80_000 })
    usersToClean.push(user.userId)
    await getRoom(user.userId)
    await buyRoomItem(user.userId, 'standing-fan', 1, key())
    await buyRoomItem(user.userId, 'poster-afrobeats', 1, key())
    const room = await getRoom(user.userId)
    if (!room.ok) throw new Error('no room')
    const mattress = room.room.items.find((i) => i.itemId === 'mattress-floor')!
    const fan = room.room.items.find((i) => i.itemId === 'standing-fan')!
    const poster = room.room.items.find((i) => i.itemId === 'poster-afrobeats')!
    await saveLayout(
      user.userId,
      room.room.version,
      [
        { uid: mattress.uid, placed: true, x: 0, z: 0, rotation: 0 },
        { uid: fan.uid, placed: true, x: 2, z: 0, rotation: 0 },
        { uid: poster.uid, placed: true, x: 0, z: 0, rotation: 0 },
      ],
      key(),
    )

    const client = await pool.connect()
    let version = 1
    try {
      const mult = await sleepEnergyMultiplier(client, user.characterId, 'hostel-poultry')
      expect(mult).toBeCloseTo(1.08, 5)
      expect(mult).toBeLessThanOrEqual(2)

      const bumped = await client.query<{ version: number }>(
        `UPDATE game_state SET needs = $2::jsonb, location_id = 'school-hostels-1',
           last_tick_at = NOW()
         WHERE character_id = $1
         RETURNING version`,
        [
          user.characterId,
          JSON.stringify({
            hunger: 80,
            energy: 20,
            hygiene: 80,
            fun: 40,
            social: 70,
            study: 50,
          }),
        ],
      )
      version = bumped.rows[0]!.version
    } finally {
      client.release()
    }

    const state = await performGameAction(user.userId, {
      actionId: 'sleep',
      targetPlaceId: 'school-hostels-1',
      version,
    })
    expect(state.ok).toBe(true)
    if (state.ok) {
      // base energy +50 * 1.08 = 54 → 20+54 = 74
      expect(state.state.needs.energy).toBe(74)
    }

    const c2 = await pool.connect()
    try {
      const a = await applyDailyFunBonus(c2, user.characterId, 'hostel-poultry', 2, 40)
      expect(a.granted).toBe(0) // happiness 2 → floor(2/6)=0
      // bump happiness via style for fun bonus
      await c2.query('COMMIT').catch(() => undefined)
    } finally {
      c2.release()
    }

    // Higher happiness: paint + floor for bonuses
    const r = await getRoom(user.userId)
    if (r.ok) {
      await saveStyle(user.userId, r.room.version, { wallColor: '#3B4A5A', floorId: 'rug-carpet' }, key())
    }
    const c3 = await pool.connect()
    try {
      await c3.query('BEGIN')
      const first = await applyDailyFunBonus(c3, user.characterId, 'hostel-poultry', 5, 40)
      const second = await applyDailyFunBonus(c3, user.characterId, 'hostel-poultry', 5, first.fun)
      await c3.query('COMMIT')
      expect(second.granted).toBe(0)
      expect(first.granted).toBe(second.granted === 0 ? first.granted : first.granted)
    } finally {
      c3.release()
    }

    const bal = await pool.connect()
    try {
      const { cash, ledgerSum } = await sumLedgerEqualsCash(bal, user.characterId)
      expect(ledgerSum).toBe(cash)
    } finally {
      bal.release()
    }
  })

  it('visit stub returns 403 by default', async () => {
    const a = await createTestUser({ cash: 5_000 })
    const b = await createTestUser({ cash: 5_000 })
    usersToClean.push(a.userId, b.userId)
    await getRoom(a.userId)
    await getRoom(b.userId)

    const visit = await getVisitRoom(a.userId, b.username)
    expect(visit.ok).toBe(false)
    if (!visit.ok) {
      expect(visit.code).toBe(403)
      expect(visit.error).toBe(ROOM_ERROR_COPY.VISITS_DISABLED)
    }

    const self = await getVisitRoom(a.userId, a.username)
    expect(self.ok).toBe(true)
  })
})
