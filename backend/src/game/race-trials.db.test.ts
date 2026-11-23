import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { COURSES, topSpeed } from './race-trials-rules.js'

/*
 * Runs against the real database, so it is OFF unless you opt in with CARS_DB_TESTS=1 on a
 * scratch/branch database that has migrations 070 and 092 applied. It creates and removes its own users.
 */
const on = process.env.CARS_DB_TESTS === '1'
const run = on ? describe : describe.skip
const users: string[] = []
let pool: typeof import('../db.js').pool
let fixtures: typeof import('../test/db-fixtures.js')
let cars: typeof import('./cars.js')
let trials: typeof import('./race-trials.js')
beforeAll(async () => {
  if (!on) return
  ;({ pool } = await import('../db.js'))
  fixtures = await import('../test/db-fixtures.js')
  cars = await import('./cars.js')
  trials = await import('./race-trials.js')
})
afterAll(async () => {
  if (!on) return
  for (const id of users) await fixtures.cleanupTestUser(id)
})
async function driver() {
  const u = await fixtures.createTestUser({ cash: 20_000_000 })
  users.push(u.userId)
  const bought = await cars.buyCar(u.userId, 'camry', true, randomUUID())
  if (!bought.ok) throw new Error(bought.error)
  return u
}

const ID = 'expressway-flat-out'
/** An honest run at `share` of the Camry's top speed. */
function runAt(share: number) {
  const v = topSpeed('camry') * share
  const splits = COURSES[ID]!.checkpointsM.map((m) => Math.round((m / v) * 1000))
  return { ms: splits[splits.length - 1]!, splits }
}
/** Pretend the run began `ms` ago (the server's clock is what counts). */
const backdate = (trialId: string, ms: number) => pool.query(`UPDATE race_trials SET started_at = NOW() - make_interval(secs => $2) WHERE id = $1`, [trialId, ms / 1000])

run('time trials (database)', { timeout: 120_000 }, () => {
  it('needs a car, and refuses an unknown route', async () => {
    const u = await fixtures.createTestUser({ cash: 1_000_000 })
    users.push(u.userId)
    expect(await trials.startTrial(u.userId, ID)).toMatchObject({ ok: false, reason: 'NO_CAR' })
    expect(await trials.startTrial(u.userId, 'nope')).toMatchObject({ ok: false, reason: 'NO_COURSE' })
  })

  it('counts an honest run, ranks it, keeps only your best, and takes it once', async () => {
    const a = await driver()
    const slow = runAt(0.6)
    const t1 = await trials.startTrial(a.userId, ID)
    if (!t1.ok) throw new Error(t1.error)
    await backdate(t1.trialId, slow.ms + 3000)
    const first = await trials.finishTrial(a.userId, t1.trialId, slow.ms, slow.splits)
    expect(first).toMatchObject({ ok: true, personalBest: true, previousBest: null })
    // The same run cannot be handed in twice
    expect(await trials.finishTrial(a.userId, t1.trialId, slow.ms, slow.splits)).toMatchObject({ ok: false, reason: 'DONE' })

    const fast = runAt(0.9)
    const t2 = await trials.startTrial(a.userId, ID)
    if (!t2.ok) throw new Error(t2.error)
    await backdate(t2.trialId, fast.ms + 3000)
    const second = await trials.finishTrial(a.userId, t2.trialId, fast.ms, fast.splits)
    expect(second).toMatchObject({ ok: true, personalBest: true, previousBest: slow.ms })

    const board = await trials.leaderboard(a.userId, ID)
    if (!board.ok) throw new Error(board.error)
    expect(board.mine).toMatchObject({ ms: fast.ms })
    expect(board.mine!.rank).toBeGreaterThanOrEqual(1)
    expect(board.board.length).toBeLessThanOrEqual(10)
    // one row per player, fastest first, with your own marked
    const mine = board.board.filter((r) => r.you)
    expect(mine.length).toBeLessThanOrEqual(1)
    expect(board.board.map((r) => r.ms)).toEqual([...board.board.map((r) => r.ms)].sort((x, y) => x - y))
    if (mine[0]) expect(mine[0]).toMatchObject({ ms: fast.ms, car: 'Toyota Camry' })
  })

  it('refuses a faked time and a run handed in too soon, and the fake never shows on the board', async () => {
    const a = await driver()
    const impossible = runAt(2)
    const t1 = await trials.startTrial(a.userId, ID)
    if (!t1.ok) throw new Error(t1.error)
    await backdate(t1.trialId, 60_000)
    expect(await trials.finishTrial(a.userId, t1.trialId, impossible.ms, impossible.splits)).toMatchObject({ ok: false, reason: 'TOO_FAST' })

    // A believable time claimed straight after setting off: the server's clock says it did not take that long
    const honest = runAt(0.8)
    const t2 = await trials.startTrial(a.userId, ID)
    if (!t2.ok) throw new Error(t2.error)
    expect(await trials.finishTrial(a.userId, t2.trialId, honest.ms, honest.splits)).toMatchObject({ ok: false, reason: 'CLOCK' })

    const board = await trials.leaderboard(a.userId, ID)
    if (!board.ok) throw new Error(board.error)
    expect(board.mine).toBeNull()
    const rejected = await pool.query(`SELECT status, reject_reason FROM race_trials WHERE character_id = $1 ORDER BY started_at`, [a.characterId])
    expect(rejected.rows.map((r) => r.reject_reason)).toEqual(['TOO_FAST', 'CLOCK'])
  })

  it("cannot hand in somebody else's run", async () => {
    const a = await driver()
    const b = await driver()
    const t = await trials.startTrial(a.userId, ID)
    if (!t.ok) throw new Error(t.error)
    const ok = runAt(0.8)
    await backdate(t.trialId, ok.ms + 3000)
    expect(await trials.finishTrial(b.userId, t.trialId, ok.ms, ok.splits)).toMatchObject({ ok: false, reason: 'GONE' })
  })
})
