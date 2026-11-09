import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

/*
 * Runs against the real database, so it is OFF unless you opt in with PITCH_DB_TESTS=1 on a
 * scratch/branch database that has migration 051 applied. It creates and removes its own user.
 */
const run = process.env.PITCH_DB_TESTS === '1' ? describe : describe.skip
const users: string[] = []
let pool: typeof import('../db.js').pool
let fixtures: typeof import('../test/db-fixtures.js')
let pitch: typeof import('./pitch.js')

beforeAll(async () => {
  if (process.env.PITCH_DB_TESTS !== '1') return
  ;({ pool } = await import('../db.js'))
  fixtures = await import('../test/db-fixtures.js')
  pitch = await import('./pitch.js')
})
afterEach(() => vi.restoreAllMocks())
afterAll(async () => {
  if (process.env.PITCH_DB_TESTS !== '1') return
  for (const id of users) await fixtures.cleanupTestUser(id)
})

async function player() {
  const u = await fixtures.createTestUser({ cash: 100_000 })
  users.push(u.userId)
  const ch = await pool.query<{ id: string }>(`SELECT id FROM characters WHERE user_id = $1`, [u.userId])
  return { userId: u.userId, characterId: ch.rows[0]!.id }
}
const cashOf = async (characterId: string) => Number((await pool.query(`SELECT cash FROM game_state WHERE character_id = $1`, [characterId])).rows[0].cash)
const makeReady = (id: string) => pool.query(`UPDATE hub_pitches SET ready_at = NOW() - INTERVAL '1 second' WHERE id = $1`, [id])

run('Innovation Hub pitch room (database)', { timeout: 90_000 }, () => {
  it('a yes is only revealed and paid after the review time, and only once', async () => {
    const p = await player()
    vi.spyOn(Math, 'random').mockReturnValue(0) // always a yes, smallest amount
    const started = await pitch.startPitch(p.userId, 'An app for keke')
    if (!started.ok) throw new Error(started.error)
    expect(started.pitch.result).toBeNull()
    // Too early: refused, nothing paid
    const early = await pitch.finishPitch(p.userId, started.pitch.id)
    expect(early.ok).toBe(false)
    expect(await cashOf(p.characterId)).toBe(100_000)
    await makeReady(started.pitch.id)
    const done = await pitch.finishPitch(p.userId, started.pitch.id)
    if (!done.ok) throw new Error(done.error)
    expect(done.pitch.result?.accepted).toBe(true)
    const paid = done.pitch.result!.amount
    expect(paid).toBeGreaterThanOrEqual(1_000_000)
    expect(paid).toBeLessThanOrEqual(5_000_000)
    expect(await cashOf(p.characterId)).toBe(100_000 + paid)
    // Calling finish again does not pay twice
    const again = await pitch.finishPitch(p.userId, started.pitch.id)
    expect(again.ok).toBe(true)
    expect(await cashOf(p.characterId)).toBe(100_000 + paid)
    const ledger = await pool.query(`SELECT amount FROM ledger WHERE character_id = $1 AND kind = 'pitch'`, [p.characterId])
    expect(ledger.rowCount).toBe(1)
  })

  it('a no pays nothing, the fifth pitch of a dry day is a yes, and a sixth is refused', async () => {
    const p = await player()
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // always a no
    for (let i = 1; i <= 4; i++) {
      const s = await pitch.startPitch(p.userId, `idea ${i}`)
      if (!s.ok) throw new Error(s.error)
      await makeReady(s.pitch.id)
      const f = await pitch.finishPitch(p.userId, s.pitch.id)
      if (!f.ok) throw new Error(f.error)
      expect(f.pitch.result?.accepted).toBe(false)
    }
    expect(await cashOf(p.characterId)).toBe(100_000)
    const fifth = await pitch.startPitch(p.userId, 'idea 5')
    if (!fifth.ok) throw new Error(fifth.error)
    await makeReady(fifth.pitch.id)
    const f5 = await pitch.finishPitch(p.userId, fifth.pitch.id)
    if (!f5.ok) throw new Error(f5.error)
    expect(f5.pitch.result?.accepted).toBe(true)
    expect(await cashOf(p.characterId)).toBe(100_000 + f5.pitch.result!.amount)
    const sixth = await pitch.startPitch(p.userId, 'idea 6')
    expect(sixth.ok).toBe(false)
  })

  it('a deck handed in before midnight is still found and paid after it', async () => {
    const p = await player()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const s = await pitch.startPitch(p.userId, 'late night deck')
    if (!s.ok) throw new Error(s.error)
    await pool.query(`UPDATE hub_pitches SET created_at = NOW() - INTERVAL '2 days', ready_at = NOW() - INTERVAL '1 second' WHERE id = $1`, [s.pitch.id])
    const status = await pitch.pitchStatus(p.userId)
    if (!status.ok) throw new Error('status failed')
    expect(status.pending?.id).toBe(s.pitch.id)
    const f = await pitch.finishPitch(p.userId, s.pitch.id)
    expect(f.ok).toBe(true)
    expect(await cashOf(p.characterId)).toBeGreaterThan(100_000)
  })
})
