import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/* Real-database test: OFF unless GIGS_DB_TESTS=1 on the dev Neon branch with migration 083 applied. */
const on = process.env.GIGS_DB_TESTS === '1'
const run = on ? describe : describe.skip
const users: string[] = []
let pool: typeof import('../db.js').pool
let fx: typeof import('../test/db-fixtures.js')
let g: typeof import('./gigs.js')
let home: typeof import('./gigs-home.js')
let mess: typeof import('./house-mess.js')

beforeAll(async () => {
  if (!on) return
  ;({ pool } = await import('../db.js'))
  fx = await import('../test/db-fixtures.js')
  g = await import('./gigs.js')
  home = await import('./gigs-home.js')
  mess = await import('./house-mess.js')
  // Neon may be cold: wake it before the first test (retry the first connection)
  for (let i = 0; i < 5; i++) {
    try {
      await pool.query('SELECT 1')
      break
    } catch {
      /* try again */
    }
  }
}, 180_000)
afterAll(async () => {
  if (!on) return
  for (const id of users) await fx.cleanupTestUser(id)
})

const k = () => randomUUID()
const cashOf = async (characterId: string) => Number((await pool.query(`SELECT cash FROM game_state WHERE character_id = $1`, [characterId])).rows[0].cash)
async function player(cash: number, lodging = 'selfcon-g2') {
  const u = await fx.createTestUser({ cash })
  users.push(u.userId)
  await pool.query(`UPDATE characters SET lodging_id = $2 WHERE id = $1`, [u.characterId, lodging])
  return u
}
function ok<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(JSON.stringify(r))
  return r as Extract<T, { ok: true }>
}
const post = async (owner: { userId: string }, over: Record<string, unknown> = {}) =>
  ok(await g.postGig(owner.userId, { category: 'decorator', title: 'Make my room nice', details: 'Modern, please', fee: 5000, budget: 3000, startInHours: 0, ...over }, k())) as { id: string }

run('gigs (database)', { timeout: 120_000 }, () => {
  it('post -> apply -> hire holds escrow once; the full job pays the worker and returns the unspent budget', async () => {
    const owner = await player(100_000)
    const worker = await player(10_000)
    const { id } = await post(owner)
    ok(await g.applyToGig(worker.userId, id, 'I am good at this', k()))
    const hireKey = k()
    ok(await g.hireWorker(owner.userId, id, worker.userId, hireKey))
    expect(await cashOf(owner.characterId)).toBe(92_000)
    // same key again: replayed, not charged twice
    ok(await g.hireWorker(owner.userId, id, worker.userId, hireKey))
    expect(await cashOf(owner.characterId)).toBe(92_000)
    // a new key on an already hired job is refused
    expect((await g.hireWorker(owner.userId, id, worker.userId, k())).ok).toBe(false)
    const row = (await pool.query(`SELECT status, escrow FROM gigs WHERE id = $1`, [id])).rows[0]
    expect(row.status).toBe('hired')
    expect(Number(row.escrow)).toBe(8000)

    // worker's job key opens the house; a stranger has none
    const key = await g.jobKeyFor(worker.userId, owner.username)
    expect(key.ok && key.key?.gigId).toBe(id)
    const stranger = await player(1000)
    expect((await g.jobKeyFor(stranger.userId, owner.username)).ok && (await g.jobKeyFor(stranger.userId, owner.username)).key).toBeNull()
    expect((await home.getGigHome(stranger.userId, id)).ok).toBe(false)

    // decorate: place an item from the budget, move it, store it
    const view = ok(await home.getGigHome(worker.userId, id))
    expect(view.budgetLeft).toBe(3000)
    const item = view.catalog.find((i) => !i.starter && i.available && i.price > 0 && i.price <= 3000 && !i.wall)!
    expect(item).toBeTruthy()
    const placed = ok(await home.gigPlace(worker.userId, id, item.id, { x: 1, z: 1, rot: 0 }, null, k())) as { placedId: string; budgetLeft: number }
    expect(placed.budgetLeft).toBe(3000 - item.price)
    expect((await pool.query(`SELECT status FROM gigs WHERE id = $1`, [id])).rows[0].status).toBe('working')
    const snap = (await pool.query(`SELECT snapshot FROM gigs WHERE id = $1`, [id])).rows[0].snapshot
    expect(Array.isArray(snap)).toBe(true)
    const mine = (await pool.query(`SELECT character_id, paid FROM home_placements WHERE id = $1`, [placed.placedId])).rows[0]
    expect(mine.character_id).toBe(owner.characterId)
    ok(await home.gigMove(worker.userId, id, placed.placedId, { x: 2, z: 1, rot: 90 }, k()))
    ok(await home.gigStore(worker.userId, id, placed.placedId, k()))
    expect((await pool.query(`SELECT stored FROM home_placements WHERE id = $1`, [placed.placedId])).rows[0].stored).toBe(true)
    // a piece that is not in the owner's house can't be touched
    expect((await home.gigStore(worker.userId, id, 'hp_nope', k())).ok).toBe(false)
    // budget can't be overspent
    const dear = view.catalog.find((i) => !i.starter && i.available && i.price > 3000 - item.price && !i.wall)
    if (dear) expect((await home.gigPlace(worker.userId, id, dear.id, { x: 3, z: 3, rot: 0 }, null, k())).ok).toBe(false)

    // owner can't cancel once work started
    expect((await g.cancelGig(owner.userId, id, k())).ok).toBe(false)
    // not accepted before it is marked done
    expect((await g.acceptWork(owner.userId, id, k())).ok).toBe(false)
    ok(await g.markDone(worker.userId, id, k()))
    const acceptKey = k()
    ok(await g.acceptWork(owner.userId, id, acceptKey))
    ok(await g.acceptWork(owner.userId, id, acceptKey))
    expect(await cashOf(worker.characterId)).toBe(15_000)
    // owner paid 8000 up front, got the unspent budget back, kept the furniture
    expect(await cashOf(owner.characterId)).toBe(100_000 - 5000 - item.price)
    const after = (await pool.query(`SELECT status, escrow FROM gigs WHERE id = $1`, [id])).rows[0]
    expect(after.status).toBe('completed')
    expect(Number(after.escrow)).toBe(0)
    // a second accept with a new key does not pay again
    expect((await g.acceptWork(owner.userId, id, k())).ok).toBe(true)
    expect(await cashOf(worker.characterId)).toBe(15_000)

    // both rate, once each; rank/rating show up
    ok(await g.rateGig(owner.userId, id, 5))
    ok(await g.rateGig(worker.userId, id, 4))
    expect((await g.rateGig(owner.userId, id, 1)).ok).toBe(false)
    const people = await g.loadPeople(pool, [worker.userId, owner.userId])
    expect(people.get(worker.userId)).toMatchObject({ jobs: 1, rating: 5 })
    expect(people.get(worker.userId)!.rank.id).toBe('new')
    expect(people.get(owner.userId)!.ownerRating).toBe(4)
    // the key is closed after the job
    expect((await g.jobKeyFor(worker.userId, owner.username)).ok && (await g.jobKeyFor(worker.userId, owner.username)).key).toBeNull()
  })

  it('owner cancels before work starts and gets everything back', async () => {
    const owner = await player(50_000)
    const worker = await player(1000)
    const { id } = await post(owner, { category: 'cleaner', budget: 0, fee: 2000 })
    ok(await g.applyToGig(worker.userId, id, '', k()))
    ok(await g.hireWorker(owner.userId, id, worker.userId, k()))
    expect(await cashOf(owner.characterId)).toBe(48_000)
    ok(await g.cancelGig(owner.userId, id, k()))
    expect(await cashOf(owner.characterId)).toBe(50_000)
    expect(await cashOf(worker.characterId)).toBe(1000)
    expect((await g.cancelGig(owner.userId, id, k())).ok).toBe(true)
    expect(await cashOf(owner.characterId)).toBe(50_000)
  })

  it('cannot hire with too little cash, cannot hire someone who did not apply, cannot post what you cannot hold', async () => {
    const owner = await player(1000)
    const worker = await player(1000)
    expect((await g.postGig(owner.userId, { category: 'other', title: 'x', details: '', fee: 5000, budget: 0, startInHours: 0 }, k())).ok).toBe(false)
    const { id } = await post(owner, { category: 'other', fee: 800, budget: 0 })
    expect((await g.hireWorker(owner.userId, id, worker.userId, k())).ok).toBe(false)
    ok(await g.applyToGig(worker.userId, id, '', k()))
    await pool.query(`UPDATE game_state SET cash = 100 WHERE character_id = $1`, [owner.characterId])
    expect((await g.hireWorker(owner.userId, id, worker.userId, k())).ok).toBe(false)
    expect(await cashOf(owner.characterId)).toBe(100)
  })

  it('a job that starts later cannot be worked or marked done yet', async () => {
    const owner = await player(20_000)
    const worker = await player(0)
    const { id } = await post(owner, { category: 'driver', budget: 0, startInHours: 6 })
    ok(await g.applyToGig(worker.userId, id, '', k()))
    ok(await g.hireWorker(owner.userId, id, worker.userId, k()))
    expect((await g.startWork(worker.userId, id, k())).ok).toBe(false)
    expect((await g.markDone(worker.userId, id, k())).ok).toBe(false)
    expect((await g.jobKeyFor(worker.userId, owner.username)).ok && (await g.jobKeyFor(worker.userId, owner.username)).key).toBeNull()
  })

  it('auto-accept pays the worker 24h after done; a no-show window refunds the owner', async () => {
    const owner = await player(30_000)
    const worker = await player(0)
    const a = await post(owner, { category: 'dj', budget: 0, fee: 4000 })
    ok(await g.applyToGig(worker.userId, a.id, '', k()))
    ok(await g.hireWorker(owner.userId, a.id, worker.userId, k()))
    ok(await g.markDone(worker.userId, a.id, k()))
    await g.sweepGigs()
    expect((await pool.query(`SELECT status FROM gigs WHERE id = $1`, [a.id])).rows[0].status).toBe('done')
    await pool.query(`UPDATE gigs SET auto_accept_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [a.id])
    await g.sweepGigs()
    expect((await pool.query(`SELECT status FROM gigs WHERE id = $1`, [a.id])).rows[0].status).toBe('completed')
    expect(await cashOf(worker.characterId)).toBe(4000)

    const b = await post(owner, { category: 'cook', budget: 0, fee: 1500 })
    ok(await g.applyToGig(worker.userId, b.id, '', k()))
    ok(await g.hireWorker(owner.userId, b.id, worker.userId, k()))
    const mid = await cashOf(owner.characterId)
    await pool.query(`UPDATE gigs SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [b.id])
    await g.sweepGigs()
    expect((await pool.query(`SELECT status FROM gigs WHERE id = $1`, [b.id])).rows[0].status).toBe('cancelled')
    expect(await cashOf(owner.characterId)).toBe(mid + 1500)
  })

  it('dispute keeps the money held until support decides', async () => {
    const owner = await player(10_000)
    const worker = await player(0)
    const { id } = await post(owner, { category: 'other', budget: 0, fee: 3000 })
    ok(await g.applyToGig(worker.userId, id, '', k()))
    ok(await g.hireWorker(owner.userId, id, worker.userId, k()))
    expect((await g.disputeGig(owner.userId, id, 'not done', k())).ok).toBe(false) // not marked done yet
    ok(await g.markDone(worker.userId, id, k()))
    ok(await g.disputeGig(owner.userId, id, 'It was not done', k()))
    await pool.query(`UPDATE gigs SET auto_accept_at = NOW() - INTERVAL '1 day' WHERE id = $1`, [id])
    await g.sweepGigs()
    expect((await pool.query(`SELECT status, escrow FROM gigs WHERE id = $1`, [id])).rows[0]).toMatchObject({ status: 'disputed' })
    expect(await cashOf(worker.characterId)).toBe(0)
    ok(await g.resolveDispute(id, 'owner'))
    expect(await cashOf(owner.characterId)).toBe(10_000)
    expect((await g.resolveDispute(id, 'worker')).ok).toBe(false)
  })

  it('owner undo puts the layout back and stores what was added', async () => {
    const owner = await player(60_000)
    const worker = await player(0)
    const { id } = await post(owner, { budget: 4000, fee: 1000 })
    ok(await g.applyToGig(worker.userId, id, '', k()))
    ok(await g.hireWorker(owner.userId, id, worker.userId, k()))
    const view = ok(await home.getGigHome(worker.userId, id))
    const item = view.catalog.find((i) => !i.starter && i.available && i.price > 0 && i.price <= 4000 && !i.wall)!
    const placed = ok(await home.gigPlace(worker.userId, id, item.id, { x: 1, z: 1, rot: 0 }, null, k())) as { placedId: string }
    ok(await g.undoLayout(owner.userId, id, k()))
    expect((await pool.query(`SELECT stored FROM home_placements WHERE id = $1`, [placed.placedId])).rows[0].stored).toBe(true)
  })

  it('reports hide a post and a pro after three different reporters; ranks sort pros', async () => {
    const owner = await player(10_000)
    const { id } = await post(owner, { category: 'other', budget: 0 })
    const reporters = [await player(0), await player(0), await player(0)]
    for (const r of reporters) ok(await g.reportTarget(r.userId, { gigId: id }, 'spam'))
    ok(await g.reportTarget(reporters[0]!.userId, { gigId: id }, 'again')) // same reporter: no extra count
    expect((await pool.query(`SELECT report_count, hidden FROM gigs WHERE id = $1`, [id])).rows[0]).toMatchObject({ report_count: 3, hidden: true })
    const board = ok(await g.listBoard(reporters[0]!.userId))
    expect(board.gigs.find((x) => x.id === id)).toBeUndefined()

    const proA = await player(0)
    const proB = await player(0)
    ok(await g.saveMyPro(proA.userId, { categories: ['cleaner'], fromPrice: 1000, pitch: 'Spotless' }))
    ok(await g.saveMyPro(proB.userId, { categories: ['cleaner'], fromPrice: 500, pitch: 'Cheap' }))
    // proB has a finished, well-rated job: ranks above proA once the rank allows; at least sorts by rating
    const client = await pool.query(`INSERT INTO gigs (id, owner_id, worker_id, category, title, fee, status, expires_at, rating_worker, completed_at)
      VALUES ($1, $2, $3, 'cleaner', 't', 1000, 'completed', NOW(), 5, NOW())`, [`gig_${k()}`, owner.userId, proB.userId])
    expect(client.rowCount).toBe(1)
    const pros = ok(await g.listPros(owner.userId, 'cleaner')).pros.filter((p) => [proA.userId, proB.userId].includes(p.userId))
    expect(pros.map((p) => p.userId)).toEqual([proB.userId, proA.userId])
    for (const r of reporters) ok(await g.reportTarget(r.userId, { proId: proA.userId }, 'bad'))
    expect(ok(await g.listPros(owner.userId, 'cleaner')).pros.find((p) => p.userId === proA.userId)).toBeUndefined()
  })

  it('direct booking: the pro accepts and money is held; filtered words are masked', async () => {
    const owner = await player(20_000)
    const pro = await player(0)
    ok(await g.saveMyPro(pro.userId, { categories: ['cook'], fromPrice: 1000, pitch: 'I cook jollof' }))
    const { id } = await post(owner, { category: 'cook', title: 'Cook for me you idiot', budget: 0, fee: 2500, directTo: pro.userId })
    expect((await pool.query(`SELECT title FROM gigs WHERE id = $1`, [id])).rows[0].title).toBe('Cook for me you i****')
    expect(ok(await g.listBoard(pro.userId)).gigs.find((x) => x.id === id)).toBeUndefined()
    expect(ok(await g.listWorking(pro.userId)).gigs.find((x) => x.id === id)?.role).toBe('offered')
    ok(await g.respondToOffer(pro.userId, id, true, k()))
    expect(await cashOf(owner.characterId)).toBe(17_500)
    expect((await pool.query(`SELECT status, worker_id FROM gigs WHERE id = $1`, [id])).rows[0]).toMatchObject({ status: 'hired', worker_id: pro.userId })
  })

  it('cleaner: mess appears in the house, a tap clears it once, cleanliness rises, done needs a cleared prop, accept pays', async () => {
    const owner = await player(20_000)
    const worker = await player(0)
    const first = ok(await mess.getHouseMess(owner.username))
    expect(first.mess.length).toBeGreaterThanOrEqual(1)
    expect(first.cleanliness).toBe(100 - 12 * first.mess.length)
    const again = ok(await mess.getHouseMess(owner.username))
    expect(again.mess.map((m) => m.id)).toEqual(first.mess.map((m) => m.id)) // no new spawn until the wait is up
    const { id } = await post(owner, { category: 'cleaner', budget: 0, fee: 2000 })
    ok(await g.applyToGig(worker.userId, id, '', k()))
    ok(await g.hireWorker(owner.userId, id, worker.userId, k()))
    expect((await g.markDone(worker.userId, id, k())).ok).toBe(false) // nothing cleaned yet
    const target = first.mess[0]!
    const tapKey = k()
    const res = ok(await mess.cleanMess(worker.userId, id, target.id, tapKey)) as { cleanliness: number; cleaned: number }
    expect(res.cleaned).toBe(1)
    expect(res.cleanliness).toBe(100 - 12 * (first.mess.length - 1))
    ok(await mess.cleanMess(worker.userId, id, target.id, tapKey)) // replay
    const repeat = ok(await mess.cleanMess(worker.userId, id, target.id, k())) as { message: string; cleaned: number }
    expect(repeat.message).toBe('Already cleaned.')
    expect(repeat.cleaned).toBe(1)
    // a stranger and a decorator job can't clean
    const stranger = await player(0)
    expect((await mess.cleanMess(stranger.userId, id, first.mess[1]?.id ?? 'x', k())).ok).toBe(false)
    ok(await g.markDone(worker.userId, id, k()))
    ok(await g.acceptWork(owner.userId, id, k()))
    expect(await cashOf(worker.characterId)).toBe(2000)
    // the key is closed once the job is paid
    expect((await mess.cleanMess(worker.userId, id, first.mess[1]?.id ?? 'x', k())).ok).toBe(false)
  })

  it('notifications follow where the job stands, for each side', async () => {
    const owner = await player(10_000)
    const worker = await player(0)
    const { id } = await post(owner, { category: 'other', budget: 0, fee: 1500 })
    ok(await g.applyToGig(worker.userId, id, '', k()))
    expect((await g.gigNotifications(owner.userId)).map((n) => n.id)).toContain(`gig-apps-${id}-1`)
    ok(await g.hireWorker(owner.userId, id, worker.userId, k()))
    expect((await g.gigNotifications(worker.userId)).map((n) => n.id)).toContain(`gig-hired-${id}`)
    ok(await g.markDone(worker.userId, id, k()))
    expect((await g.gigNotifications(owner.userId)).map((n) => n.id)).toContain(`gig-done-${id}`)
    ok(await g.acceptWork(owner.userId, id, k()))
    expect((await g.gigNotifications(worker.userId)).map((n) => n.id)).toContain(`gig-paid-${id}`)
    expect((await g.gigNotifications(owner.userId)).map((n) => n.id)).toContain(`gig-rate-${id}`)
    const disputes = ok(await g.listDisputes())
    expect(Array.isArray(disputes.disputes) && Array.isArray(disputes.reports)).toBe(true)
  })
})
