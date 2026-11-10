import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/*
 * Runs against the real database, so it is OFF unless you opt in with CARS_DB_TESTS=1 on a
 * scratch/branch database that has migration 070 applied. It creates and removes its own users.
 */
const on = process.env.CARS_DB_TESTS === '1'
const run = on ? describe : describe.skip
const users: string[] = []
let pool: typeof import('../db.js').pool
let fixtures: typeof import('../test/db-fixtures.js')
let cars: typeof import('./cars.js')
beforeAll(async () => {
  if (!on) return
  ;({ pool } = await import('../db.js'))
  fixtures = await import('../test/db-fixtures.js')
  cars = await import('./cars.js')
})
afterAll(async () => {
  if (!on) return
  for (const id of users) await fixtures.cleanupTestUser(id)
})
async function player(cash: number) {
  const u = await fixtures.createTestUser({ cash })
  users.push(u.userId)
  return u
}
const cashOf = async (characterId: string) =>
  Number((await pool.query<{ cash: string }>(`SELECT cash FROM game_state WHERE character_id = $1`, [characterId])).rows[0]!.cash)

run('cars (database)', { timeout: 90_000 }, () => {
  it('a hostel player needs parking; buying with it charges car + 500k once, even on a retry', async () => {
    const u = await player(10_000_000)
    const refused = await cars.buyCar(u.userId, 'corolla', false, randomUUID())
    expect(refused).toMatchObject({ ok: false, reason: 'NEEDS_PARKING' })
    expect(await cashOf(u.characterId)).toBe(10_000_000)

    const key = randomUUID()
    const first = await cars.buyCar(u.userId, 'corolla', true, key)
    const again = await cars.buyCar(u.userId, 'corolla', true, key)
    expect(first.ok && again.ok).toBe(true)
    expect(await cashOf(u.characterId)).toBe(10_000_000 - 4_500_000 - 500_000)
    const garage = await cars.getGarage(u.userId)
    if (!garage.ok) throw new Error(garage.error)
    expect(garage.cars).toHaveLength(1)
    expect(garage.cars[0]).toMatchObject({ model: 'corolla', active: true, paid: 4_500_000 })
    expect(garage.needsParking).toBe(false)
  })

  it('refuses when the wallet is short, and charges nothing', async () => {
    const u = await player(1_000_000)
    const res = await cars.buyCar(u.userId, 'camry', true, randomUUID())
    expect(res).toMatchObject({ ok: false, reason: 'INSUFFICIENT_FUNDS' })
    expect(await cashOf(u.characterId)).toBe(1_000_000)
    const garage = await cars.getGarage(u.userId)
    expect(garage.ok && garage.cars.length === 0 && garage.needsParking).toBe(true)
  })

  it('drive, paint and sell back at 60%; the next car becomes the active one', async () => {
    const u = await player(30_000_000)
    const a = await cars.buyCar(u.userId, 'corolla', true, randomUUID())
    const b = await cars.buyCar(u.userId, 'camry', false, randomUUID())
    if (!a.ok || !b.ok) throw new Error('buy failed')
    const [corolla, camry] = b.cars
    expect(corolla!.active).toBe(true)
    expect(camry!.active).toBe(false)

    const drove = await cars.driveCar(u.userId, camry!.id, randomUUID())
    if (!drove.ok) throw new Error(drove.error)
    expect(drove.cars.map((c) => c.active)).toEqual([false, true])

    expect(await cars.paintCar(u.userId, camry!.id, '#123456', randomUUID())).toMatchObject({ ok: false, reason: 'UNKNOWN_PAINT' })
    const painted = await cars.paintCar(u.userId, camry!.id, '#2f6bf0', randomUUID())
    expect(painted.ok && painted.cars[1]!.color).toBe('#2f6bf0')

    const before = await cashOf(u.characterId)
    const sold = await cars.sellCar(u.userId, camry!.id, randomUUID())
    if (!sold.ok) throw new Error(sold.error)
    expect(await cashOf(u.characterId)).toBe(before + 3_000_000)
    expect(sold.cars).toHaveLength(1)
    expect(sold.cars[0]).toMatchObject({ id: corolla!.id, active: true })
    expect(await cars.sellCar(u.userId, camry!.id, randomUUID())).toMatchObject({ ok: false })
  })
})
