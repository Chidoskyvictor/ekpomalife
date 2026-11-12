import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/*
 * Runs against the real database, so it is OFF unless you opt in with CARS_DB_TESTS=1 on a
 * scratch/branch database that has migration 072 applied. It creates and removes its own users.
 */
const on = process.env.CARS_DB_TESTS === '1'
const run = on ? describe : describe.skip
const users: string[] = []
let pool: typeof import('../db.js').pool
let fixtures: typeof import('../test/db-fixtures.js')
let cars: typeof import('./cars.js')
let races: typeof import('./car-races.js')
beforeAll(async () => {
  if (!on) return
  ;({ pool } = await import('../db.js'))
  fixtures = await import('../test/db-fixtures.js')
  cars = await import('./cars.js')
  races = await import('./car-races.js')
})
afterAll(async () => {
  if (!on) return
  for (const id of users) await fixtures.cleanupTestUser(id)
})
/** A player with a car and `cash` left after buying it. */
async function driver(cash: number) {
  const u = await fixtures.createTestUser({ cash: cash + 5_000_000 })
  users.push(u.userId)
  const bought = await cars.buyCar(u.userId, 'corolla', true, randomUUID())
  if (!bought.ok) throw new Error(bought.error)
  return u
}
const cashOf = async (characterId: string) =>
  Number((await pool.query<{ cash: string }>(`SELECT cash FROM game_state WHERE character_id = $1`, [characterId])).rows[0]!.cash)
// 600 game metres apart: 26 s at full speed
const course = { destId: 'sazza', x: 0, z: 0, h: 0, destX: 600, destZ: 0 }
const raceOf = async (userId: string) => {
  const list = await races.listRaces(userId)
  if (!list.ok || !list.mine) throw new Error('no race')
  return list.mine
}

run('drag races (database)', { timeout: 120_000 }, () => {
  it('stakes go in once, the first believable finisher takes the pot less 5%', async () => {
    const a = await driver(100_000)
    const b = await driver(100_000)
    const key = randomUUID()
    const made = await races.createRace(a.userId, { ...course, stake: 20_000 }, key)
    const again = await races.createRace(a.userId, { ...course, stake: 20_000 }, key)
    expect(made.ok && again.ok).toBe(true)
    expect(await cashOf(a.characterId)).toBe(80_000)
    const race = await raceOf(a.userId)

    expect(await races.startRace(a.userId, race.id)).toMatchObject({ ok: false, reason: 'ALONE' })
    expect((await races.joinRace(b.userId, race.id, randomUUID())).ok).toBe(true)
    expect(await cashOf(b.characterId)).toBe(80_000)
    expect(await races.startRace(b.userId, race.id)).toMatchObject({ ok: false })
    expect((await races.startRace(a.userId, race.id)).ok).toBe(true)

    // Claiming from far away, or at once, is refused
    expect(await races.finishRace(b.userId, race.id, 100, 0)).toMatchObject({ ok: false, reason: 'NOT_THERE' })
    expect(await races.finishRace(b.userId, race.id, 600, 0)).toMatchObject({ ok: false, reason: 'TOO_FAST' })
    await pool.query(`UPDATE car_races SET starts_at = NOW() - INTERVAL '60 seconds' WHERE id = $1`, [race.id])
    expect((await races.finishRace(b.userId, race.id, 600, 0)).ok).toBe(true)
    // The loser arriving later changes nothing
    await races.finishRace(a.userId, race.id, 600, 0)
    expect(await cashOf(b.characterId)).toBe(80_000 + 38_000)
    expect(await cashOf(a.characterId)).toBe(80_000)
    expect(await raceOf(b.userId)).toMatchObject({ status: 'done', youWon: true, prize: 38_000 })
  })

  it('leaving before the start gives the stake back; the host leaving calls it off for all', async () => {
    const a = await driver(50_000)
    const b = await driver(50_000)
    await races.createRace(a.userId, { ...course, stake: 5_000 }, randomUUID())
    const race = await raceOf(a.userId)
    await races.joinRace(b.userId, race.id, randomUUID())
    expect((await races.leaveRace(b.userId, race.id)).ok).toBe(true)
    expect(await cashOf(b.characterId)).toBe(50_000)
    await races.joinRace(b.userId, race.id, randomUUID())
    expect((await races.leaveRace(a.userId, race.id)).ok).toBe(true)
    expect(await cashOf(a.characterId)).toBe(50_000)
    expect(await cashOf(b.characterId)).toBe(50_000)
  })

  it('giving up after the start loses the stake to the last racer left', async () => {
    const a = await driver(50_000)
    const b = await driver(50_000)
    await races.createRace(a.userId, { ...course, stake: 10_000 }, randomUUID())
    const race = await raceOf(a.userId)
    await races.joinRace(b.userId, race.id, randomUUID())
    await races.startRace(a.userId, race.id)
    expect((await races.leaveRace(a.userId, race.id)).ok).toBe(true)
    expect(await cashOf(a.characterId)).toBe(40_000)
    expect(await cashOf(b.characterId)).toBe(40_000 + 19_000)
  })

  it('refuses a stake you cannot pay and a second race at once', async () => {
    const a = await driver(1_000)
    expect(await races.createRace(a.userId, { ...course, stake: 5_000 }, randomUUID())).toMatchObject({ ok: false, reason: 'INSUFFICIENT_FUNDS' })
    expect((await races.createRace(a.userId, { ...course, stake: 0 }, randomUUID())).ok).toBe(true)
    expect(await races.createRace(a.userId, { ...course, stake: 0 }, randomUUID())).toMatchObject({ ok: false, reason: 'IN_RACE' })
    await races.leaveRace(a.userId, (await raceOf(a.userId)).id)
  })
})
