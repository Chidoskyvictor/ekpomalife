import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/* Runs on the dev database only when CHAT_DB_TESTS=1 (migration 085 applied). Creates and removes its own users. */
const run = process.env.CHAT_DB_TESTS === '1' ? describe : describe.skip
const users: string[] = []
let pool: typeof import('../db.js').pool
let fixtures: typeof import('../test/db-fixtures.js')
let chat: typeof import('./chat.js')
let store: typeof import('./photo-store.js')
beforeAll(async () => {
  if (process.env.CHAT_DB_TESTS !== '1') return
  ;({ pool } = await import('../db.js'))
  fixtures = await import('../test/db-fixtures.js')
  chat = await import('./chat.js')
  store = await import('./photo-store.js')
})
afterAll(async () => {
  if (process.env.CHAT_DB_TESTS !== '1') return
  for (const id of users) await fixtures.cleanupTestUser(id)
})
const player = async () => {
  const u = await fixtures.createTestUser()
  users.push(u.userId)
  return u.userId
}
const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('fake-image-bytes-for-test')])
async function setup() {
  const [a, b] = [await player(), await player()]
  const opened = await chat.openDirectChat(a, b)
  if (!opened.ok) throw new Error(opened.error)
  const sent = await chat.sendPhoto(a, opened.chat.id, jpeg(), 800, 600)
  if (!sent.ok) throw new Error(sent.error)
  return { a, b, chatId: opened.chat.id, seq: sent.message.id }
}
const keyOf = async (seq: string) => (await pool.query(`SELECT object_key FROM chat_photos WHERE message_seq = $1`, [seq])).rows[0].object_key as string | null

run('view-once photos (database)', { timeout: 90_000 }, () => {
  it('send stores metadata only, never the key or bytes in the message', async () => {
    const { a, seq, chatId } = await setup()
    const msgs = await chat.getMessages(a, chatId, {})
    const m = msgs.ok && msgs.messages.find((x) => x.id === seq)!
    expect(m && m.kind).toBe('photo')
    expect(JSON.parse(m ? m.body : '{}')).toEqual({ w: 800, h: 600, state: 'sent' })
    expect(JSON.stringify(m)).not.toContain('photo/')
    expect(await store.getPhoto((await keyOf(seq))!)).not.toBeNull()
  })

  it('opens once: the second open fails and the object is deleted on first open', async () => {
    const { b, seq } = await setup()
    const key = (await keyOf(seq))!
    const first = await chat.openPhoto(b, seq)
    expect(first.ok).toBe(true)
    expect(await store.getPhoto(key)).toBeNull()
    expect(await keyOf(seq)).toBeNull()
    expect(await chat.openPhoto(b, seq)).toMatchObject({ ok: false, code: 'GONE' })
    if (first.ok) {
      const token = first.url.split('/').pop()!
      expect(chat.redeemPhotoLink('someone-else', token)).toBeNull() // link used up even by a wrong person
      expect(chat.redeemPhotoLink(b, token)).toBeNull()
    }
  })

  it('the one-time link serves the bytes once, to the opener only', async () => {
    const { b, seq } = await setup()
    const r = await chat.openPhoto(b, seq)
    if (!r.ok) throw new Error('open failed')
    const token = r.url.split('/').pop()!
    expect(chat.redeemPhotoLink(b, token)?.data.equals(jpeg())).toBe(true)
    expect(chat.redeemPhotoLink(b, token)).toBeNull()
  })

  it('only the other chat member can open (not the sender, not outsiders)', async () => {
    const { a, seq } = await setup()
    const outsider = await player()
    expect(await chat.openPhoto(a, seq)).toMatchObject({ ok: false, code: 'OWN_PHOTO' })
    expect(await chat.openPhoto(outsider, seq)).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    const still = await pool.query(`SELECT status FROM chat_photos WHERE message_seq = $1`, [seq])
    expect(still.rows[0].status).toBe('sent')
  })

  it('opened state reaches the sender through sync and the message list', async () => {
    const { a, b, seq, chatId } = await setup()
    await chat.openPhoto(b, seq)
    const sync = await chat.getChatSync(a, chatId, 0)
    expect(sync.ok && sync.photos[seq]).toBe('opened')
  })

  it('a report keeps the photo hidden for 30 days; the sweep purges it after', async () => {
    const { b, seq } = await setup()
    await chat.openPhoto(b, seq)
    const rep = await chat.reportPhoto(b, seq, 'bad')
    expect(rep).toMatchObject({ ok: true, kept: true })
    const row = (await pool.query(`SELECT status, held_key, held_until FROM chat_photos WHERE message_seq = $1`, [seq])).rows[0]
    expect(row.status).toBe('reported')
    expect(await store.getPhoto(row.held_key)).not.toBeNull()
    await chat.sweepPhotos(new Date(Date.now() + 29 * 86_400_000))
    expect(await store.getPhoto(row.held_key)).not.toBeNull()
    await chat.sweepPhotos(new Date(Date.now() + 31 * 86_400_000))
    expect(await store.getPhoto(row.held_key)).toBeNull()
  })

  it('a photo reported without being opened first is not kept', async () => {
    const { b, seq } = await setup()
    expect(await chat.reportPhoto(b, seq, undefined)).toMatchObject({ ok: true, kept: false })
  })

  it('sweep deletes unopened photos after 7 days, not before', async () => {
    const { seq } = await setup()
    const key = (await keyOf(seq))!
    await chat.sweepPhotos(new Date(Date.now() + 6 * 86_400_000))
    expect(await store.getPhoto(key)).not.toBeNull()
    await chat.sweepPhotos(new Date(Date.now() + 8 * 86_400_000))
    expect(await store.getPhoto(key)).toBeNull()
    expect((await pool.query(`SELECT status FROM chat_photos WHERE message_seq = $1`, [seq])).rows[0].status).toBe('expired')
  })

  it('rejects non-images and group chats', async () => {
    const [a, b] = [await player(), await player()]
    const opened = await chat.openDirectChat(a, b)
    if (!opened.ok) throw new Error('chat')
    expect(await chat.sendPhoto(a, opened.chat.id, Buffer.from('<html>not an image at all</html>'), 10, 10)).toMatchObject({ code: 'BAD_PHOTO' })
  })
})
