import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/*
 * Runs against the real database, so it is OFF unless you opt in with CHAT_DB_TESTS=1 on a
 * scratch/branch database that has migration 054 applied. It creates and removes its own users.
 */
const run = process.env.CHAT_DB_TESTS === '1' ? describe : describe.skip
const users: string[] = []
let pool: typeof import('../db.js').pool
let fixtures: typeof import('../test/db-fixtures.js')
let chat: typeof import('./chat.js')
beforeAll(async () => {
  if (process.env.CHAT_DB_TESTS !== '1') return
  ;({ pool } = await import('../db.js'))
  fixtures = await import('../test/db-fixtures.js')
  chat = await import('./chat.js')
})
afterAll(async () => {
  if (process.env.CHAT_DB_TESTS !== '1') return
  for (const id of users) await fixtures.cleanupTestUser(id)
})
async function player() {
  const u = await fixtures.createTestUser()
  users.push(u.userId)
  return u.userId
}
async function directChat(a: string, b: string) {
  const opened = await chat.openDirectChat(a, b)
  if (!opened.ok) throw new Error(opened.error)
  return opened.chat.id
}
async function say(from: string, chatId: string, body: string, replyTo?: number) {
  const res = await chat.sendMessage(from, chatId, body, 'text', replyTo)
  if (!res.ok) throw new Error(res.error)
  return res.message
}

run('chat replies, reactions and receipts (database)', () => {
  it('replies must point at a message in the same chat', async () => {
    const [a, b, c] = [await player(), await player(), await player()]
    const ab = await directChat(a, b)
    const ac = await directChat(a, c)
    const original = await say(a, ab, 'hello there\nsecond line')
    const ok = await say(b, ab, 'hi', Number(original.id))
    expect(ok.replyTo).toMatchObject({ id: original.id, text: 'hello there' })
    const other = await chat.sendMessage(a, ac, 'cross', 'text', Number(original.id))
    expect(other).toMatchObject({ ok: false, code: 'BAD_REPLY' })
    await chat.postNudge(a, b, 'hello')
    const nudge = await pool.query(`SELECT seq FROM chat_messages WHERE chat_id = $1 AND kind = 'nudge'`, [ab])
    const bad = await chat.sendMessage(b, ab, 'x', 'text', Number(nudge.rows[0].seq))
    expect(bad).toMatchObject({ ok: false, code: 'BAD_REPLY' })
  })

  it('one reaction per player: set, replace, clear; members only', async () => {
    const [a, b, outsider] = [await player(), await player(), await player()]
    const ab = await directChat(a, b)
    const msg = Number((await say(a, ab, 'react')).id)
    expect(await chat.setReaction(b, msg, '👍')).toMatchObject({ ok: true, reactions: [{ emoji: '👍' }] })
    const replaced = await chat.setReaction(b, msg, '❤️')
    expect(replaced.ok && replaced.reactions).toHaveLength(1)
    expect(replaced.ok && replaced.reactions[0]!.emoji).toBe('❤️')
    expect(await chat.setReaction(outsider, msg, '👍')).toMatchObject({ ok: false, status: 404 })
    expect(await chat.setReaction(b, msg, '🔥')).toMatchObject({ ok: false, code: 'BAD_EMOJI' })
    const cleared = await chat.clearReaction(b, msg)
    expect(cleared.ok && cleared.reactions).toHaveLength(0)
  })

  it('ticks: sent → delivered on fetch → read on open; switch off hides blue and shares no reads', async () => {
    const [a, b] = [await player(), await player()]
    const ab = await directChat(a, b)
    const msg = await say(a, ab, 'tick')
    expect(await chat.getReceipts(a, ab)).toEqual({ delivered: '0', read: '0' })
    await chat.getMessages(b, ab, {})
    expect(await chat.getReceipts(a, ab)).toEqual({ delivered: msg.id, read: '0' })
    await chat.markRead(b, ab, Number(msg.id))
    expect(await chat.getReceipts(a, ab)).toEqual({ delivered: msg.id, read: msg.id })
    // a turns receipts off: no blue for a
    await chat.setReadReceiptsPref(a, false)
    expect(await chat.getReceipts(a, ab)).toEqual({ delivered: msg.id, read: '0' })
    await chat.setReadReceiptsPref(a, true)
    // b turns receipts off: b's reads aren't shared, delivered still is
    await chat.setReadReceiptsPref(b, false)
    const second = await say(a, ab, 'again')
    await chat.getMessages(b, ab, {})
    await chat.markRead(b, ab, Number(second.id))
    expect(await chat.getReceipts(a, ab)).toEqual({ delivered: second.id, read: msg.id })
  })
})
