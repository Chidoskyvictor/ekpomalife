import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { pool } from '../db.js'
import { cleanupTestUser, createTestUser } from '../test/db-fixtures.js'
import { asMoney } from './game-state.js'
import { sumLedgerEqualsCash } from './payouts.js'
import { DAY_MINUTES } from './time.js'
import {
  BATTERY,
  CHARGE_BOOST_ITEM_IDS,
  HOSTEL_PLACE_IDS,
  PHONE_CONTRACT_KEYS,
  RIDE_MINUTES,
  buyData,
  charge,
  getPhone,
  getRideQuote,
  listNotifications,
  openApp,
  recomputeBattery,
  rideQuote,
  setWallpaper,
  takeRide,
  toPhoneState,
} from './phone.js'

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

async function givePhone(characterId: string) {
  await pool.query(
    `INSERT INTO inventory (character_id, item_id, qty)
     VALUES ($1, 'phone-basic', 1)
     ON CONFLICT (character_id, item_id) DO UPDATE SET qty = GREATEST(inventory.qty, 1)`,
    [characterId],
  )
}

async function setLocation(characterId: string, placeId: string, gameTime?: number) {
  if (typeof gameTime === 'number') {
    await pool.query(
      `UPDATE game_state SET location_id = $2, game_time = $3, last_tick_at = NOW()
       WHERE character_id = $1`,
      [characterId, placeId, gameTime],
    )
  } else {
    await pool.query(`UPDATE game_state SET location_id = $2 WHERE character_id = $1`, [
      characterId,
      placeId,
    ])
  }
}

async function setCash(characterId: string, cash: number) {
  await pool.query(`UPDATE game_state SET cash = $2 WHERE character_id = $1`, [
    characterId,
    cash,
  ])
  await pool.query(`UPDATE characters SET cash = $2 WHERE id = $1`, [characterId, cash])
}

describe('recomputeBattery (pure)', () => {
  it('drains 2 per game hour', () => {
    const next = recomputeBattery(
      { battery: 80, charging: false, battery_game_time: 0 },
      120,
      'admin-block',
      new Set(),
    )
    expect(next.battery).toBe(80 - 2 * 2)
    expect(next.charging).toBe(false)
  })

  it('charges at hostel and clamps at 100', () => {
    const next = recomputeBattery(
      { battery: 90, charging: true, battery_game_time: 0 },
      20,
      HOSTEL_PLACE_IDS[0],
      new Set(),
    )
    expect(next.battery).toBe(100)
    expect(next.charging).toBe(false)
  })

  it('charges ×2 with lamp or gen', () => {
    const lamp = recomputeBattery(
      { battery: 50, charging: true, battery_game_time: 0 },
      10,
      HOSTEL_PLACE_IDS[0],
      new Set([CHARGE_BOOST_ITEM_IDS[0]]),
    )
    expect(lamp.battery).toBe(50 + 10 * BATTERY.chargePerGameMinuteAtHostel * 2)

    const gen = recomputeBattery(
      { battery: 50, charging: true, battery_game_time: 0 },
      10,
      HOSTEL_PLACE_IDS[0],
      new Set([CHARGE_BOOST_ITEM_IDS[1]]),
    )
    expect(gen.battery).toBe(70)
  })

  it('stops charging when not at hostel', () => {
    const next = recomputeBattery(
      { battery: 40, charging: true, battery_game_time: 0 },
      60,
      'admin-block',
      new Set(),
    )
    expect(next.charging).toBe(false)
    expect(next.battery).toBe(40 - BATTERY.drainPerGameHour)
  })

  it('handles day wrap via absolute game time', () => {
    const next = recomputeBattery(
      { battery: 100, charging: false, battery_game_time: DAY_MINUTES - 30 },
      DAY_MINUTES + 30,
      'market',
      new Set(),
    )
    expect(next.battery).toBe(100 - BATTERY.drainPerGameHour)
  })
})

describe('rideQuote (pure)', () => {
  it('keke cheaper than okada; same/unknown rejected', () => {
    const q = rideQuote('admin-block', 'market')
    expect(q.ok).toBe(true)
    if (!q.ok) return
    const keke = q.quotes.find((x) => x.mode === 'keke')!
    const okada = q.quotes.find((x) => x.mode === 'okada')!
    expect(keke.fare).toBeLessThan(okada.fare)

    expect(rideQuote('admin-block', 'admin-block').ok).toBe(false)
    expect(rideQuote('admin-block', 'no-such-place').ok).toBe(false)
  })
})

describe('Phone (DB)', () => {
  it('NO_PHONE 403 without phone item', async () => {
    const user = await createTestUser({ cash: 5_000 })
    usersToClean.push(user.userId)
    const result = await getPhone(user.userId)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('NO_PHONE')
    expect(result.status).toBe(403)
  })

  it('buyData deducts, adds MB, ledger phone_data; idempotent + concurrent', async () => {
    const user = await createTestUser({ cash: 5_000 })
    usersToClean.push(user.userId)
    await givePhone(user.characterId)

    const k = key()
    const first = await buyData(user.userId, 'data-350', k)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.cash).toBe(5_000 - 300)
    expect(first.phone.dataMb).toBe(50 + 350)
    expect(first.replayed).toBe(false)

    const ledger = await pool.query(
      `SELECT kind, amount FROM ledger WHERE character_id = $1 AND kind = 'phone_data'`,
      [user.characterId],
    )
    expect(ledger.rowCount).toBe(1)
    expect(asMoney(ledger.rows[0]!.amount)).toBe(-300)

    const replay = await buyData(user.userId, 'data-350', k)
    expect(replay.ok).toBe(true)
    if (!replay.ok) return
    expect(replay.replayed).toBe(true)
    expect(replay.cash).toBe(first.cash)
    const ledger2 = await pool.query(
      `SELECT COUNT(*)::int AS n FROM ledger WHERE character_id = $1 AND kind = 'phone_data'`,
      [user.characterId],
    )
    expect(ledger2.rows[0]!.n).toBe(1)

    const balClient = await pool.connect()
    try {
      const { cash, ledgerSum } = await sumLedgerEqualsCash(balClient, user.characterId)
      expect(ledgerSum).toBe(cash)
    } finally {
      balClient.release()
    }

    const k2 = key()
    const [a, b] = await Promise.all([
      buyData(user.userId, 'data-100', k2),
      buyData(user.userId, 'data-100', k2),
    ])
    expect(a.ok && b.ok).toBe(true)
    const dataRows = await pool.query(
      `SELECT COUNT(*)::int AS n FROM ledger
       WHERE character_id = $1 AND kind = 'phone_data' AND amount = -100`,
      [user.characterId],
    )
    expect(dataRows.rows[0]!.n).toBe(1)
    expect([a, b].filter((r) => r.ok && r.replayed).length).toBe(1)
  })

  it('insufficient funds leaves cash unchanged', async () => {
    const user = await createTestUser({ cash: 50 })
    usersToClean.push(user.userId)
    await givePhone(user.characterId)
    const result = await buyData(user.userId, 'data-1000', key())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('INSUFFICIENT_FUNDS')
    const cash = await pool.query(`SELECT cash FROM game_state WHERE character_id = $1`, [
      user.characterId,
    ])
    expect(asMoney(cash.rows[0]!.cash)).toBe(50)
  })

  it('takeRide moves place, advances time, ledger ride; CLOSED at 23:00', async () => {
    const user = await createTestUser({ cash: 10_000 })
    usersToClean.push(user.userId)
    await givePhone(user.characterId)
    // 11:00 AM day 1
    await setLocation(user.characterId, 'admin-block', 11 * 60)

    const ride = await takeRide(user.userId, 'market', 'keke', key())
    expect(ride.ok).toBe(true)
    if (!ride.ok) return
    expect(ride.replayed).toBe(false)
    expect(ride.state.locationId).toBe('market')
    expect(ride.state.gameTime).toBe(11 * 60 + RIDE_MINUTES.keke)

    const ledger = await pool.query(
      `SELECT kind FROM ledger WHERE character_id = $1 AND kind = 'ride'`,
      [user.characterId],
    )
    expect(ledger.rowCount).toBe(1)

    // 23:00 — keke closed
    await setLocation(user.characterId, 'market', 23 * 60)
    await setCash(user.characterId, 10_000)
    const closed = await takeRide(user.userId, 'admin-block', 'keke', key())
    expect(closed.ok).toBe(false)
    if (closed.ok) return
    expect(closed.code).toBe('CLOSED')
  })

  it('charge only at hostel; openApp drains battery/data and clears badges', async () => {
    const user = await createTestUser({ cash: 5_000 })
    usersToClean.push(user.userId)
    await givePhone(user.characterId)
    await setLocation(user.characterId, 'admin-block', 8 * 60)

    const bad = await charge(user.userId, 'start')
    expect(bad.ok).toBe(false)
    if (bad.ok) return
    expect(bad.code).toBe('NOT_AT_HOSTEL')

    await setLocation(user.characterId, HOSTEL_PLACE_IDS[0], 8 * 60)
    const ok = await charge(user.userId, 'start')
    expect(ok.ok).toBe(true)
    if (!ok.ok) return
    expect(ok.phone.charging).toBe(true)

    await pool.query(
      `UPDATE phone_state SET unread = '{"gist":2}'::jsonb, new_apps = ARRAY['ride','gist'],
         data_mb = 1, battery = 50, charging = false, battery_game_time = $2
       WHERE character_id = $1`,
      [user.characterId, 8 * 60],
    )

    const opened = await openApp(user.userId, 'gist')
    expect(opened.ok).toBe(true)
    if (!opened.ok) return
    expect(opened.offline).toBe(true) // cost 2, only 1 MB
    expect(opened.phone.unread.gist).toBeUndefined()
    expect(opened.phone.newApps).not.toContain('gist')
    expect(opened.phone.battery).toBe(50 - BATTERY.drainPerAppOpen)
    expect(opened.phone.dataMb).toBe(1)

    await pool.query(
      `UPDATE phone_state SET battery = 0, battery_game_time = $2 WHERE character_id = $1`,
      [user.characterId, 8 * 60],
    )
    const dead = await openApp(user.userId, 'bank')
    expect(dead.ok).toBe(false)
    if (dead.ok) return
    expect(dead.code).toBe('BATTERY_DEAD')
  })

  it('wallpaper + notifications + ride quote + contract keys', async () => {
    const user = await createTestUser({ cash: 8_000 })
    usersToClean.push(user.userId)
    await givePhone(user.characterId)

    const wall = await setWallpaper(user.userId, 'harmattan')
    expect(wall.ok).toBe(true)
    if (!wall.ok) return
    expect(wall.phone.wallpaper).toBe('harmattan')

    const phone = await getPhone(user.userId)
    expect(phone.ok).toBe(true)
    if (!phone.ok) return
    expect(Object.keys(phone).sort()).toEqual([...PHONE_CONTRACT_KEYS.getPhone].sort())
    expect(Object.keys(phone.phone).sort()).toEqual([...PHONE_CONTRACT_KEYS.phoneState].sort())

    const notes = await listNotifications(user.userId)
    expect(notes.ok).toBe(true)
    if (!notes.ok) return
    expect(Object.keys(notes).sort()).toEqual([...PHONE_CONTRACT_KEYS.notifications].sort())

    const quote = await getRideQuote(user.userId, 'market')
    expect(quote.ok).toBe(true)
    if (!quote.ok) return
    expect(Object.keys(quote).sort()).toEqual([...PHONE_CONTRACT_KEYS.rideQuote].sort())

    const buy = await buyData(user.userId, 'data-100', key())
    expect(buy.ok).toBe(true)
    if (!buy.ok) return
    expect(Object.keys(buy).sort()).toEqual([...PHONE_CONTRACT_KEYS.buyData].sort())

    await setLocation(user.characterId, HOSTEL_PLACE_IDS[2], 9 * 60)
    const ch = await charge(user.userId, 'stop')
    expect(ch.ok).toBe(true)
    if (!ch.ok) return
    expect(Object.keys(ch).sort()).toEqual([...PHONE_CONTRACT_KEYS.charge].sort())

    const open = await openApp(user.userId, 'settings')
    expect(open.ok).toBe(true)
    if (!open.ok) return
    expect(Object.keys(open).sort()).toEqual([...PHONE_CONTRACT_KEYS.openApp].sort())

    expect(Object.keys(wall).sort()).toEqual([...PHONE_CONTRACT_KEYS.setWallpaper].sort())

    await setLocation(user.characterId, 'admin-block', 10 * 60)
    const ride = await takeRide(user.userId, 'bukka', 'okada', key())
    expect(ride.ok).toBe(true)
    if (!ride.ok) return
    expect(Object.keys(ride).sort()).toEqual([...PHONE_CONTRACT_KEYS.takeRide].sort())

    // toPhoneState shape
    expect(Object.keys(toPhoneState({
      battery: 1,
      charging: false,
      data_mb: 0,
      wallpaper: 'aau-dusk',
      unread: {},
      new_apps: [],
    })).sort()).toEqual([...PHONE_CONTRACT_KEYS.phoneState].sort())
  })
})
