import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { COURSES, topSpeed } from './race-trials-rules.js'

/*
 * Runs against the real database, so it is OFF unless you opt in with CARS_DB_TESTS=1 on a
 * scratch/branch database that has migrations 070, 092 and 094 applied. It creates and removes its own users.
 */
const on = process.env.CARS_DB_TESTS === '1'
const run = on ? describe : describe.skip
const users: string[] = []
let pool: typeof import('../db.js').pool
let fixtures: typeof import('../test/db-fixtures.js')
let cars: typeof import('./cars.js')
let trials: typeof import('./race-trials.js')
let racer: typeof import('./racer.js')
beforeAll(async () => {
  if (!on) return
  ;({ pool } = await import('../db.js'))
  fixtures = await import('../test/db-fixtures.js')
  cars = await import('./cars.js')
  trials = await import('./race-trials.js')
  racer = await import('./racer.js')
})
afterAll(async () => {
  if (!on) return
  for (const id of users) await fixtures.cleanupTestUser(id)
})
async function driver(cash = 200_000_000) {
  const u = await fixtures.createTestUser({ cash })
  users.push(u.userId)
  const bought = await cars.buyCar(u.userId, 'camry', true, randomUUID())
  if (!bought.ok) throw new Error(bought.error)
  const garage = await cars.getGarage(u.userId)
  if (!garage.ok) throw new Error(garage.error)
  return { ...u, carId: garage.cars[0]!.id }
}
const cashOf = async (characterId: string) => Number((await pool.query<{ cash: string }>(`SELECT cash FROM game_state WHERE character_id = $1`, [characterId])).rows[0]!.cash)
const giveXp = (characterId: string, xp: number) => pool.query(`INSERT INTO racer_stats (character_id, xp) VALUES ($1, $2) ON CONFLICT (character_id) DO UPDATE SET xp = $2`, [characterId, xp])

const ID = 'expressway-flat-out'
function runAt(share: number, model = 'camry', engine = 0) {
  const v = topSpeed(model, engine) * share
  const splits = COURSES[ID]!.checkpointsM.map((m) => Math.round((m / v) * 1000))
  return { ms: splits[splits.length - 1]!, splits }
}
const backdate = (trialId: string, ms: number) => pool.query(`UPDATE race_trials SET started_at = NOW() - make_interval(secs => $2) WHERE id = $1`, [trialId, ms / 1000])
const meta = { mode: 'ai' as const, place: 1, of: 3, beatFaster: 1, beatAiSkill: 0.95, crashed: false, night: false, comeback: false }

run('racer rewards (database)', { timeout: 300_000 }, () => {
  it('buys upgrades one level at a time, charges the price, and rank unlocks the higher levels', async () => {
    const a = await driver()
    const before = await cashOf(a.characterId)
    const one = await cars.upgradeCar(a.userId, a.carId, 'engine', randomUUID())
    expect(one.ok).toBe(true)
    const paid = before - (await cashOf(a.characterId))
    expect(paid).toBeGreaterThan(0)
    // level 2 needs Okada Rider (200 XP)
    expect(await cars.upgradeCar(a.userId, a.carId, 'engine', randomUUID())).toMatchObject({ ok: false, reason: 'RANK' })
    await giveXp(a.characterId, 200)
    expect((await cars.upgradeCar(a.userId, a.carId, 'engine', randomUUID())).ok).toBe(true)
    // level 3 needs Street Racer
    expect(await cars.upgradeCar(a.userId, a.carId, 'engine', randomUUID())).toMatchObject({ ok: false, reason: 'RANK' })
    await giveXp(a.characterId, 1800)
    expect((await cars.upgradeCar(a.userId, a.carId, 'engine', randomUUID())).ok).toBe(true)
    expect(await cars.upgradeCar(a.userId, a.carId, 'engine', randomUUID())).toMatchObject({ ok: false, reason: 'MAX' })
    const garage = await cars.getGarage(a.userId)
    if (!garage.ok) throw new Error(garage.error)
    expect(garage.cars[0]!.up).toEqual({ engine: 3, tyres: 0, brakes: 0 })
  })

  it('a repeated tap pays once, and you cannot upgrade a car that is not yours or lack the money', async () => {
    const a = await driver()
    const key = randomUUID()
    const before = await cashOf(a.characterId)
    await cars.upgradeCar(a.userId, a.carId, 'tyres', key)
    await cars.upgradeCar(a.userId, a.carId, 'tyres', key)
    const price = before - (await cashOf(a.characterId))
    expect((await cars.getGarage(a.userId)).ok && (await cars.getGarage(a.userId) as { cars: { up: { tyres: number } }[] }).cars[0]!.up.tyres).toBe(1)
    expect(price).toBeGreaterThan(0)
    const b = await driver()
    expect(await cars.upgradeCar(b.userId, a.carId, 'brakes', randomUUID())).toMatchObject({ ok: false })
    const poor = await driver(20_000_000)
    await pool.query(`UPDATE game_state SET cash = 100 WHERE character_id = $1`, [poor.characterId])
    expect(await cars.upgradeCar(poor.userId, poor.carId, 'brakes', randomUUID())).toMatchObject({ ok: false, reason: 'INSUFFICIENT_FUNDS' })
  })

  it('pays XP and badges for an accepted run, less for a repeat, and never for a rejected one', async () => {
    const a = await driver()
    const r = runAt(0.8)
    const t1 = await trials.startTrial(a.userId, ID)
    if (!t1.ok) throw new Error(t1.error)
    await backdate(t1.trialId, r.ms + 3000)
    const first = await trials.finishTrial(a.userId, t1.trialId, r.ms, r.splits, meta)
    if (!first.ok) throw new Error(first.error)
    expect(first.reward.xp).toBeGreaterThan(60)
    expect(first.reward.badges).toEqual(expect.arrayContaining(['first-win', 'ai-pro', 'clean-race', 'top-10']))
    // the same time again is not a personal best: much less XP, no repeat badges
    const t2 = await trials.startTrial(a.userId, ID)
    if (!t2.ok) throw new Error(t2.error)
    await backdate(t2.trialId, r.ms + 3000)
    const again = await trials.finishTrial(a.userId, t2.trialId, r.ms, r.splits, meta)
    if (!again.ok) throw new Error(again.error)
    expect(again.reward.xp).toBeLessThan(first.reward.xp)
    expect(again.reward.badges).toEqual([])
    const card = await racer.racerCard(pool, a.characterId)
    expect(card.xp).toBe(first.reward.xp + again.reward.xp)
    expect(card.wins).toBe(2)
    // a faked run earns nothing
    const t3 = await trials.startTrial(a.userId, ID)
    if (!t3.ok) throw new Error(t3.error)
    await backdate(t3.trialId, 60_000)
    const fake = runAt(2)
    expect(await trials.finishTrial(a.userId, t3.trialId, fake.ms, fake.splits, meta)).toMatchObject({ ok: false })
    expect((await racer.racerCard(pool, a.characterId)).xp).toBe(card.xp)
  })

  it('an engine upgrade raises the speed limit the server checks against, a stock car does not get it', async () => {
    const a = await driver()
    await giveXp(a.characterId, 5000)
    for (let i = 0; i < 3; i++) expect((await cars.upgradeCar(a.userId, a.carId, 'engine', randomUUID())).ok).toBe(true)
    // faster than a stock Camry can ever go, honest for an engine level 3 Camry
    const quick = runAt(0.99, 'camry', 3)
    expect(quick.ms).toBeLessThan(runAt(0.99, 'camry', 0).ms)
    const t = await trials.startTrial(a.userId, ID)
    if (!t.ok) throw new Error(t.error)
    await backdate(t.trialId, quick.ms + 3000)
    expect(await trials.finishTrial(a.userId, t.trialId, quick.ms, quick.splits)).toMatchObject({ ok: true })
    const board = await trials.leaderboard(a.userId, ID)
    if (!board.ok) throw new Error(board.error)
    const mine = board.board.find((x) => x.you)
    expect(mine?.upgrades).toBe('E3 T0 B0')
    expect(mine?.racerRank.name).toBeTruthy()
    // the same time in a stock car is refused
    const b = await driver()
    const t2 = await trials.startTrial(b.userId, ID)
    if (!t2.ok) throw new Error(t2.error)
    await backdate(t2.trialId, quick.ms + 3000)
    expect(await trials.finishTrial(b.userId, t2.trialId, quick.ms, quick.splits)).toMatchObject({ ok: false, reason: 'TOO_FAST' })
  })
})
