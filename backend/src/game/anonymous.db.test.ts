import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/*
 * Runs against the real database, so it is OFF unless you opt in with ANON_DB_TESTS=1 on a
 * scratch/branch database that has migration 048 applied. It creates and removes its own users.
 */
const run = process.env.ANON_DB_TESTS === '1' ? describe : describe.skip
const users: string[] = []
// Loaded only when opted in, so a plain `npm test` needs no database for this file
let pool: typeof import('../db.js').pool
let fixtures: typeof import('../test/db-fixtures.js')
let anon: typeof import('./anonymous.js')
beforeAll(async () => {
  if (process.env.ANON_DB_TESTS !== '1') return
  ;({ pool } = await import('../db.js'))
  fixtures = await import('../test/db-fixtures.js')
  anon = await import('./anonymous.js')
})
afterAll(async () => {
  if (process.env.ANON_DB_TESTS !== '1') return
  for (const id of users) await fixtures.cleanupTestUser(id)
})
async function player() {
  const u = await fixtures.createTestUser()
  users.push(u.userId)
  return u.userId
}

run('anonymous (database)', () => {
  const createPost = (...a: Parameters<typeof anon.createPost>) => anon.createPost(...a)
  const toggleLike = (...a: Parameters<typeof anon.toggleLike>) => anon.toggleLike(...a)
  const report = (...a: Parameters<typeof anon.report>) => anon.report(...a)
  const listFeed = (...a: Parameters<typeof anon.listFeed>) => anon.listFeed(...a)
  const blockAuthor = (...a: Parameters<typeof anon.blockAuthor>) => anon.blockAuthor(...a)
  const addComment = (...a: Parameters<typeof anon.addComment>) => anon.addComment(...a)
  it('one like per user per post; tapping again unlikes', async () => {
    const a = await player()
    const b = await player()
    const made = await createPost(a, { body: 'like me', color: 'violet', category: 'general' })
    if (!made.ok) throw new Error(made.error)
    const id = made.post.id
    const first = await toggleLike(b, id)
    const dupe = await Promise.all([toggleLike(a, id), toggleLike(a, id)]) // racing double tap
    expect(first).toMatchObject({ ok: true, liked: true, likes: 1 })
    const likes = await pool.query(`SELECT COUNT(*)::int AS n FROM anon_likes WHERE post_id = $1 AND user_id = $2`, [id, a])
    expect(likes.rows[0].n).toBeLessThanOrEqual(1)
    expect(dupe.every((r) => r.ok)).toBe(true)
    const off = await toggleLike(b, id)
    expect(off).toMatchObject({ ok: true, liked: false })
  })

  it('one report per user per item; 3 reports hide it; cannot report your own', async () => {
    const author = await player()
    const made = await createPost(author, { body: 'rude post', color: 'rose', category: 'rants' })
    if (!made.ok) throw new Error(made.error)
    const id = made.post.id
    const [r1, r2, r3] = [await player(), await player(), await player()]
    expect(await report(author, 'post', id, 'spam')).toMatchObject({ ok: false })
    expect(await report(r1, 'post', id, 'spam')).toMatchObject({ ok: true, already: false })
    expect(await report(r1, 'post', id, 'spam')).toMatchObject({ ok: true, already: true })
    await report(r2, 'post', id, 'bullying')
    let row = await pool.query(`SELECT status, report_count FROM anon_posts WHERE id = $1`, [id])
    expect(row.rows[0]).toMatchObject({ status: 'ok', report_count: 2 })
    await report(r3, 'post', id, 'harassment')
    row = await pool.query(`SELECT status, report_count FROM anon_posts WHERE id = $1`, [id])
    expect(row.rows[0]).toMatchObject({ status: 'hidden', report_count: 3 })
    const feed = await listFeed(r1, { sort: 'new' })
    expect(feed.posts.some((p) => p.id === id)).toBe(false)
  })

  it('wall posts stay out of the main feed; blocked authors disappear', async () => {
    const a = await player()
    const b = await player()
    const made = await createPost(a, { body: 'block test', color: 'sky', category: 'general' })
    if (!made.ok) throw new Error(made.error)
    expect((await listFeed(b, { sort: 'new' })).posts.some((p) => p.id === made.post.id)).toBe(true)
    await blockAuthor(b, 'post', made.post.id)
    expect((await listFeed(b, { sort: 'new' })).posts.some((p) => p.id === made.post.id)).toBe(false)
    const c = await addComment(a, made.post.id, 'my own comment')
    expect(JSON.stringify(c)).not.toContain(a)
  })
})
