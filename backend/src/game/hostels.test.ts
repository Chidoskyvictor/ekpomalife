import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { pool } from '../db.js'
import { cleanupTestUser, createTestUser } from '../test/db-fixtures.js'
import {
  CHAT_RATE_PER_MIN,
  getMessages,
  listChats,
  markRead,
  openDirectChat,
  reportMessage,
  searchPlayers,
  sendMessage,
  unreadTotal,
} from './chat.js'
import { createHostel, getMyHostel, joinHostel, leaveHostel, listNeighbours, searchHostels } from './hostels.js'

const usersToClean: string[] = []
const hostelsToClean: string[] = []

afterAll(async () => {
  // Hostels outlive their creator (created_by → NULL), so remove the test ones explicitly
  if (hostelsToClean.length) await pool.query(`DELETE FROM hostels WHERE id = ANY($1::text[])`, [hostelsToClean])
  for (const id of usersToClean) await cleanupTestUser(id)
})

async function player() {
  const user = await createTestUser()
  usersToClean.push(user.userId)
  return user
}

describe('Hostels + hostel chat (DB)', () => {
  it('dedupes names, joins, chats, reads, reports and leaves', async () => {
    const a = await player()
    const b = await player()
    const tag = randomUUID().slice(0, 8)

    // Create, then the same hostel typed differently comes back instead of a duplicate
    const created = await createHostel(a.userId, `Saint Zq${tag} Hostel`)
    expect(created.ok).toBe(true)
    if (!created.ok) return
    hostelsToClean.push(created.hostel.id)
    expect(created.created).toBe(true)

    // Same hostel typed differently → "already on the list" with the match to join
    const again = await createHostel(b.userId, `st. zq${tag}`)
    expect(again.ok).toBe(false)
    if (again.ok) return
    expect(again.code).toBe('HOSTEL_EXISTS')
    expect('matches' in again && again.matches[0]?.id).toBe(created.hostel.id)

    // A near re-spelling is caught too
    const typo = await createHostel(b.userId, `Saint Zq${tag}x Hostel`)
    expect(typo.ok).toBe(false)
    if (typo.ok) return
    expect(['SIMILAR_EXISTS', 'HOSTEL_EXISTS']).toContain(typo.code)

    const search = await searchHostels(`zq${tag}`)
    expect(search.results.some((hit) => hit.id === created.hostel.id)).toBe(true)
    const exact = await searchHostels(`St Zq${tag} hostel`)
    expect(exact.results[0]?.exact).toBe(true)

    // Join: system message, member counts, neighbours
    const joinA = await joinHostel(a.userId, created.hostel.id)
    expect(joinA.ok).toBe(true)
    if (!joinA.ok) return
    const chatId = joinA.chatId
    const joinB = await joinHostel(b.userId, created.hostel.id)
    expect(joinB.ok).toBe(true)
    if (!joinB.ok) return
    expect(joinB.hostel.members).toBe(2)
    expect((await getMyHostel(a.userId))?.chatId).toBe(chatId)

    const neighbours = await listNeighbours(a.userId, created.hostel.id)
    expect(neighbours.ok && neighbours.neighbours.length).toBe(2)

    const firstPage = await getMessages(a.userId, chatId, {})
    expect(firstPage.ok).toBe(true)
    if (!firstPage.ok) return
    const system = firstPage.messages.filter((m) => m.kind === 'system').map((m) => m.body)
    expect(system.some((body) => body.endsWith(`joined Saint Zq${tag} Hostel`))).toBe(true)
    expect(firstPage.messages.every((m) => m.kind !== 'system' || m.sender === null)).toBe(true)

    // Send + unread + read
    const sent = await sendMessage(b.userId, chatId, '  hello neighbours  ')
    expect(sent.ok).toBe(true)
    if (!sent.ok) return
    expect(sent.message.body).toBe('hello neighbours')
    expect(sent.message.mine).toBe(true)
    expect(sent.message.sender?.userId).toBe(b.userId)

    expect(await unreadTotal(a.userId)).toBeGreaterThanOrEqual(1)
    const chats = await listChats(a.userId)
    expect(chats[0]?.pinned).toBe(true)
    expect(chats[0]?.lastMessage?.body).toBe('hello neighbours')

    const newer = await getMessages(a.userId, chatId, { after: Number(firstPage.messages.at(-1)!.id) })
    expect(newer.ok && newer.messages.map((m) => m.body)).toContain('hello neighbours')

    await markRead(a.userId, chatId, Number(sent.message.id))
    expect(await unreadTotal(a.userId)).toBe(0)

    // Length limit
    const long = await sendMessage(a.userId, chatId, 'x'.repeat(501))
    expect(long.ok).toBe(false)
    if (long.ok) return
    expect(long.code).toBe('TOO_LONG')

    // Report hides the message for the reporter only
    expect((await reportMessage(a.userId, Number(sent.message.id), 'spam')).ok).toBe(true)
    const afterReport = await getMessages(a.userId, chatId, {})
    expect(afterReport.ok && afterReport.messages.some((m) => m.id === sent.message.id)).toBe(false)
    const senderView = await getMessages(b.userId, chatId, {})
    expect(senderView.ok && senderView.messages.some((m) => m.id === sent.message.id)).toBe(true)
    expect((await reportMessage(b.userId, Number(sent.message.id), undefined)).ok).toBe(false)

    // 10 messages a minute (b already sent one)
    for (let i = 1; i < CHAT_RATE_PER_MIN; i++) {
      const ok = await sendMessage(b.userId, chatId, `msg ${i}`)
      expect(ok.ok).toBe(true)
    }
    const tooFast = await sendMessage(b.userId, chatId, 'one more')
    expect(tooFast.ok).toBe(false)
    if (tooFast.ok) return
    expect(tooFast.code).toBe('SLOW_DOWN')

    // Paging: older page before the newest message
    const latest = await getMessages(b.userId, chatId, { limit: 3 })
    expect(latest.ok && latest.hasMore).toBe(true)
    if (!latest.ok) return
    const older = await getMessages(b.userId, chatId, { before: Number(latest.messages[0]!.id), limit: 3 })
    expect(older.ok && older.messages.every((m) => Number(m.id) < Number(latest.messages[0]!.id))).toBe(true)

    // One hostel per player
    const other = await createHostel(a.userId, `Zq${tag} Annex`)
    expect(other.ok).toBe(true)
    if (!other.ok) return
    hostelsToClean.push(other.hostel.id)
    const second = await joinHostel(a.userId, other.hostel.id)
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.code).toBe('ALREADY_IN_HOSTEL')

    // Leave: out of the chat, "left" message for the rest
    expect((await leaveHostel(a.userId)).ok).toBe(true)
    expect(await getMyHostel(a.userId)).toBeNull()
    const locked = await getMessages(a.userId, chatId, {})
    expect(locked.ok).toBe(false)
    const rest = await getMessages(b.userId, chatId, {})
    expect(rest.ok && rest.messages.at(-1)?.body.includes('left')).toBe(true)
  }, 180_000)

  it('direct messages: find by @username, one chat per pair, hidden until someone speaks', async () => {
    const a = await player()
    const b = await player()

    const found = await searchPlayers(a.userId, `@${b.username.slice(0, 8)}`)
    expect(found.some((p) => p.userId === b.userId && p.username === b.username)).toBe(true)
    expect((await searchPlayers(a.userId, a.username)).some((p) => p.userId === a.userId)).toBe(false)

    const first = await openDirectChat(a.userId, b.userId)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const again = await openDirectChat(b.userId, a.userId)
    expect(again.ok && again.chat.id).toBe(first.chat.id)
    expect(first.chat.peer?.userId).toBe(b.userId)

    // Nothing said yet → not in either list
    expect((await listChats(b.userId)).some((c) => c.id === first.chat.id)).toBe(false)

    const sent = await sendMessage(a.userId, first.chat.id, 'hey neighbour')
    expect(sent.ok).toBe(true)
    const bChats = await listChats(b.userId)
    const dm = bChats.find((c) => c.id === first.chat.id)
    expect(dm?.kind).toBe('direct')
    expect(dm?.peer?.userId).toBe(a.userId)
    expect(dm?.unread).toBe(1)
    expect(dm?.lastMessage?.body).toBe('hey neighbour')

    const self = await openDirectChat(a.userId, a.userId)
    expect(self.ok).toBe(false)
  }, 180_000)
})
