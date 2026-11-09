import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/* Real-database test: OFF unless DAILY_DB_TESTS=1 on the dev Neon branch with migration 065 applied. */
const run = process.env.DAILY_DB_TESTS === '1' ? describe : describe.skip
const users: string[] = []
let pool: typeof import('../db.js').pool
let fixtures: typeof import('../test/db-fixtures.js')
let hooks: typeof import('./daily-hooks.js')
beforeAll(async () => {
  if (process.env.DAILY_DB_TESTS !== '1') return
  ;({ pool } = await import('../db.js'))
  fixtures = await import('../test/db-fixtures.js')
  hooks = await import('./daily-hooks.js')
})
afterAll(async () => {
  if (process.env.DAILY_DB_TESTS !== '1') return
  for (const id of users) await fixtures.cleanupTestUser(id)
})

run('daily hooks (database)', { timeout: 60_000 }, () => {
  it('check-in pays once a day into game_state.cash + ledger', async () => {
    const u = await fixtures.createTestUser({ cash: 100_000 })
    users.push(u.userId)
    const first = await hooks.checkIn(u.userId)
    if (!first.ok) throw new Error(first.error)
    expect(first.checkin).toMatchObject({ granted: 5_000, streak: 1, firstToday: true, checkedInToday: true })
    const again = await hooks.checkIn(u.userId)
    if (!again.ok) throw new Error(again.error)
    expect(again.checkin).toMatchObject({ granted: 0, firstToday: false, streak: 1 })
    const gs = await pool.query(`SELECT cash, version FROM game_state WHERE character_id = $1`, [u.characterId])
    expect(Number(gs.rows[0].cash)).toBe(105_000)
    expect(gs.rows[0].version).toBe(2)
    const led = await pool.query(`SELECT amount FROM ledger WHERE character_id = $1 AND kind = 'daily_checkin'`, [u.characterId])
    expect(led.rows).toHaveLength(1)
  })

  it('a missed day resets the streak to day 1', async () => {
    const u = await fixtures.createTestUser()
    users.push(u.userId)
    await pool.query(`INSERT INTO login_streaks (character_id, current_streak, best_streak, last_checkin_day) VALUES ($1, 4, 6, 1)`, [u.characterId])
    const r = await hooks.checkIn(u.userId)
    if (!r.ok) throw new Error(r.error)
    expect(r.checkin).toMatchObject({ streak: 1, best: 6, granted: 5_000 })
  })

  it('stories: max 2 a day, choice applies once and changes stats', async () => {
    const u = await fixtures.createTestUser({ cash: 50_000 })
    users.push(u.userId)
    const a = await hooks.nextStory(u.userId, { roll: 0, rand: 0 })
    if (!a.ok || !a.story) throw new Error('expected a story')
    const same = await hooks.nextStory(u.userId, { roll: 0.9 })
    expect(same.ok && same.story?.seq).toBe(a.story.seq) // still pending, not a new one
    const res = await hooks.chooseStory(u.userId, a.story.seq, 0)
    expect(res.ok).toBe(true)
    const dupe = await hooks.chooseStory(u.userId, a.story.seq, 1)
    expect(dupe.ok).toBe(false)
    // too soon for a second one
    const soon = await hooks.nextStory(u.userId, { roll: 0 })
    expect(soon.ok && soon.story).toBeNull()
    const later = await hooks.nextStory(u.userId, { roll: 0, rand: 0.5, nowMs: Date.now() + 4 * 3600_000 })
    if (!later.ok || !later.story) throw new Error('expected second story')
    expect(later.story.eventId).not.toBe(a.story.eventId)
    await hooks.chooseStory(u.userId, later.story.seq, 0)
    const third = await hooks.nextStory(u.userId, { roll: 0, nowMs: Date.now() + 9 * 3600_000 })
    expect(third.ok && third.story).toBeNull()
  })
})
