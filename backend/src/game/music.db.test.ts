import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/* Runs against the real database: OFF unless MUSIC_DB_TESTS=1 on a scratch/branch DB with migration 086 applied. */
const on = process.env.MUSIC_DB_TESTS === '1'
import { vi } from 'vitest'
vi.setConfig({ testTimeout: 60000, hookTimeout: 60000 })
const run = on ? describe : describe.skip
const users: string[] = []
let pool: typeof import('../db.js').pool
let fixtures: typeof import('../test/db-fixtures.js')
let music: typeof import('./music.js')
beforeAll(async () => {
  if (!on) return
  ;({ pool } = await import('../db.js'))
  fixtures = await import('../test/db-fixtures.js')
  music = await import('./music.js')
})
afterAll(async () => {
  if (!on) return
  for (const id of users) await fixtures.cleanupTestUser(id)
  await pool.end()
})
const player = async () => {
  const u = await fixtures.createTestUser()
  users.push(u.userId)
  return u.userId
}

run('music (database)', () => {
  it('knows the four songs', () => {
    expect(music.isTrackId('abena')).toBe(true)
    expect(music.isTrackId('nope')).toBe(false)
  })

  it('like and unlike are idempotent, one heart per player', async () => {
    const a = await player()
    const b = await player()
    const base = (await music.listTrackStats(a)).find((t) => t.id === 'abena')!.likes
    await music.setLike(a, 'abena', true)
    const again = await music.setLike(a, 'abena', true)
    expect(again).toMatchObject({ ok: true, track: { liked: true, likes: base + 1 } })
    await Promise.all([music.setLike(b, 'abena', true), music.setLike(b, 'abena', true)])
    expect((await music.listTrackStats(b)).find((t) => t.id === 'abena')!.likes).toBe(base + 2)
    await music.setLike(a, 'abena', false)
    const off = await music.setLike(a, 'abena', false)
    expect(off).toMatchObject({ ok: true, track: { liked: false, likes: base + 1 } })
    await music.setLike(b, 'abena', false)
  })

  it('rejects unknown songs', async () => {
    const a = await player()
    expect(await music.setLike(a, 'nope', true)).toMatchObject({ ok: false, code: 404 })
    expect(await music.countStream(a, 'nope')).toMatchObject({ ok: false, code: 404 })
  })

  it('counts a stream once per player per track per hour', async () => {
    const a = await player()
    const b = await player()
    const base = (await music.listTrackStats(a)).find((t) => t.id === 'shakara')!.streams
    const racing = await Promise.all([music.countStream(a, 'shakara'), music.countStream(a, 'shakara')])
    expect(racing.filter((r) => r.ok && r.counted)).toHaveLength(1)
    expect(await music.countStream(b, 'shakara')).toMatchObject({ ok: true, counted: true })
    expect(await music.countStream(a, 'abena')).toMatchObject({ ok: true, counted: true })
    expect((await music.listTrackStats(a)).find((t) => t.id === 'shakara')!.streams).toBe(base + 2)
    await pool.query(`UPDATE music_streams SET created_at = NOW() - INTERVAL '61 minutes' WHERE user_id = $1 AND track_id = 'shakara'`, [a])
    expect(await music.countStream(a, 'shakara')).toMatchObject({ ok: true, counted: true })
  })
})
