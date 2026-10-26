import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import { createId } from '../ids.js'
import { applyCash } from './game-state.js'
import { liveSpaceMoneyBlock } from './spaces-money.js'
import { isStickerId } from './stickers.js'

/** Group chat (hostel chats today). Message ids are the `seq` column, sent as strings. */

export const CHAT_MESSAGE_MAX = 500
export const CHAT_PAGE_SIZE = 50
/** Messages per user per minute, across all chats. */
export const CHAT_RATE_PER_MIN = 10

export type ChatSender = {
  userId: string
  /** Set on chat messages (invites link to this player's place). */
  username?: string
  displayName: string
  avatar: { color: string; emoji: string | null }
}

/** text · system ("X joined") · sticker (body = sticker id) · invite (body = host username) · visit (body = visited username) · money (body = naira amount) */
export type MessageKind = 'text' | 'system' | 'sticker' | 'invite' | 'visit' | 'money' | 'game'

/** Naira you can send in one go from a direct chat. */
export const TRANSFER_MIN = 100
export const TRANSFER_MAX = 500_000
/** Money sends per user per minute (on top of the general chat rate). */
export const TRANSFER_RATE_PER_MIN = 5

export type ChatMessage = {
  id: string
  chatId: string
  kind: MessageKind
  body: string
  createdAt: string
  /** Null for system messages. */
  sender: ChatSender | null
  mine: boolean
}

export type PlayerCard = ChatSender & { username: string }

export type ChatSummary = {
  id: string
  kind: 'hostel' | 'direct'
  /** Hostel name, or the other player's display name for direct chats. */
  title: string
  hostelId: string | null
  /** The other player in a direct chat. */
  peer: PlayerCard | null
  /** Hostel chats are pinned to the top of Messages and can't be unpinned. */
  pinned: boolean
  unread: number
  lastMessage: ChatMessage | null
}

type Fail = { ok: false; status: number; code: string; error: string }
const fail = (status: number, code: string, error: string): Fail => ({ ok: false, status, code, error })

type MessageRow = {
  seq: string
  chat_id: string
  kind: MessageKind
  body: string
  created_at: Date
  sender_id: string | null
  username: string | null
  display_name: string | null
  avatar_color: string | null
  avatar_emoji: string | null
}

const MESSAGE_SELECT = `
  SELECT m.seq::text AS seq, m.chat_id, m.kind, m.body, m.created_at, m.sender_id, u.username,
         u.username AS display_name,
         pp.avatar_color, pp.avatar_emoji
  FROM chat_messages m
  LEFT JOIN users u ON u.id = m.sender_id
  LEFT JOIN player_profiles pp ON pp.user_id = m.sender_id`

/** Reported messages are hidden from the player who reported them. */
const NOT_REPORTED_BY = (param: string) =>
  `NOT EXISTS (SELECT 1 FROM chat_reports r WHERE r.message_seq = m.seq AND r.reporter_id = ${param})`

function toMessage(row: MessageRow, viewerId: string): ChatMessage {
  return {
    id: row.seq,
    chatId: row.chat_id,
    kind: row.kind,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    sender:
      row.kind === 'system' || !row.sender_id
        ? null
        : {
            userId: row.sender_id,
            username: row.username ?? undefined,
            displayName: row.display_name ?? 'Player',
            avatar: { color: row.avatar_color ?? '#3d9ad6', emoji: row.avatar_emoji },
          },
    mine: row.sender_id === viewerId,
  }
}

// —— Used by hostels.ts inside its transactions ——

export async function createHostelChat(client: PoolClient, hostelId: string, title: string): Promise<string> {
  const id = createId()
  await client.query(`INSERT INTO chats (id, kind, hostel_id, title) VALUES ($1, 'hostel', $2, $3)`, [
    id,
    hostelId,
    title.slice(0, 80),
  ])
  return id
}

export async function chatIdForHostel(client: PoolClient | typeof pool, hostelId: string): Promise<string | null> {
  const found = await client.query<{ id: string }>(`SELECT id FROM chats WHERE hostel_id = $1`, [hostelId])
  return found.rows[0]?.id ?? null
}

/** Join starts at the newest message, so a new member isn't buried in old unread. */
export async function addChatMember(client: PoolClient, chatId: string, userId: string) {
  await client.query(
    `INSERT INTO chat_members (chat_id, user_id, last_read_seq)
     VALUES ($1, $2, COALESCE((SELECT MAX(seq) FROM chat_messages WHERE chat_id = $1), 0))
     ON CONFLICT (chat_id, user_id) DO NOTHING`,
    [chatId, userId],
  )
}

export async function removeChatMember(client: PoolClient, chatId: string, userId: string) {
  await client.query(`DELETE FROM chat_members WHERE chat_id = $1 AND user_id = $2`, [chatId, userId])
}

export async function postSystemMessage(client: PoolClient, chatId: string, body: string) {
  await client.query(`INSERT INTO chat_messages (chat_id, sender_id, kind, body) VALUES ($1, NULL, 'system', $2)`, [
    chatId,
    body.slice(0, CHAT_MESSAGE_MAX),
  ])
}

// —— Player-facing ——

async function isMember(chatId: string, userId: string) {
  const found = await pool.query(`SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`, [chatId, userId])
  return (found.rowCount ?? 0) > 0
}

const UNREAD_SQL = `
  SELECT COUNT(*)::int FROM chat_messages m
  WHERE m.chat_id = cm.chat_id AND m.seq > cm.last_read_seq
    AND (m.sender_id IS NULL OR m.sender_id <> cm.user_id)
    AND ${NOT_REPORTED_BY('cm.user_id')}`

type PlayerRow = {
  user_id: string
  username: string
  display_name: string
  avatar_color: string | null
  avatar_emoji: string | null
}

const toPlayerCard = (row: PlayerRow): PlayerCard => ({
  userId: row.user_id,
  username: row.username,
  displayName: row.display_name,
  avatar: { color: row.avatar_color ?? '#3d9ad6', emoji: row.avatar_emoji },
})

/**
 * Hostel chat pinned first, then conversations by newest message. Direct chats only show
 * once someone has said something (opening a chat and leaving doesn't clutter their list).
 */
export async function listChats(userId: string): Promise<ChatSummary[]> {
  const rows = await pool.query<
    {
      id: string
      kind: 'hostel' | 'direct'
      title: string
      hostel_id: string | null
      unread: number
      last_seq: string | null
    } & Partial<PlayerRow>
  >(
    `SELECT c.id, c.kind, c.title, c.hostel_id, (${UNREAD_SQL}) AS unread, last.seq AS last_seq,
            peer.user_id, peer.username, peer.display_name, peer.avatar_color, peer.avatar_emoji
     FROM chat_members cm
     JOIN chats c ON c.id = cm.chat_id
     LEFT JOIN LATERAL (SELECT MAX(seq)::text AS seq FROM chat_messages WHERE chat_id = c.id) last ON true
     LEFT JOIN LATERAL (
       SELECT u.id AS user_id, u.username, u.username AS display_name,
              pp.avatar_color, pp.avatar_emoji
       FROM chat_members other
       JOIN users u ON u.id = other.user_id
       LEFT JOIN player_profiles pp ON pp.user_id = u.id
       WHERE c.kind = 'direct' AND other.chat_id = c.id AND other.user_id <> cm.user_id
       LIMIT 1
     ) peer ON true
     WHERE cm.user_id = $1 AND (c.kind = 'hostel' OR last.seq IS NOT NULL)
     ORDER BY (c.kind = 'hostel') DESC, last.seq::bigint DESC NULLS LAST, c.created_at DESC
     LIMIT 100`,
    [userId],
  )
  const chats: ChatSummary[] = []
  for (const row of rows.rows) {
    const last = await pool.query<MessageRow>(
      `${MESSAGE_SELECT} WHERE m.chat_id = $1 AND ${NOT_REPORTED_BY('$2')} ORDER BY m.seq DESC LIMIT 1`,
      [row.id, userId],
    )
    const peer = row.kind === 'direct' && row.user_id ? toPlayerCard(row as PlayerRow) : null
    chats.push({
      id: row.id,
      kind: row.kind,
      title: peer ? peer.displayName : row.title,
      hostelId: row.hostel_id,
      peer,
      pinned: row.kind === 'hostel',
      unread: row.unread,
      lastMessage: last.rows[0] ? toMessage(last.rows[0], userId) : null,
    })
  }
  return chats
}

export const PLAYER_SEARCH_LIMIT = 10

/** "Message someone: @user" — players whose username (or display name) starts with q. */
export async function searchPlayers(userId: string, rawQuery: string): Promise<PlayerCard[]> {
  const q = rawQuery.trim().replace(/^@+/, '').toLowerCase()
  if (q.length < 2 || !/^[a-z0-9_ .'-]+$/.test(q)) return []
  const prefix = `${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`
  const rows = await pool.query<PlayerRow>(
    `SELECT u.id AS user_id, u.username, u.username AS display_name,
            pp.avatar_color, pp.avatar_emoji
     FROM users u
     LEFT JOIN player_profiles pp ON pp.user_id = u.id
     WHERE u.id <> $1
       AND EXISTS (SELECT 1 FROM characters c WHERE c.user_id = u.id)
       AND LOWER(u.username) LIKE $2
     ORDER BY (LOWER(u.username) = $3) DESC, LENGTH(u.username), u.username
     LIMIT $4`,
    [userId, prefix, q, PLAYER_SEARCH_LIMIT],
  )
  return rows.rows.map(toPlayerCard)
}

/** Find or start the one direct chat between two players. */
export async function openDirectChat(
  userId: string,
  otherUserId: string,
): Promise<{ ok: true; chat: ChatSummary } | Fail> {
  if (otherUserId === userId) return fail(400, 'SELF', 'That’s you — pick someone else to message.')
  const other = await pool.query<PlayerRow>(
    `SELECT u.id AS user_id, u.username, u.username AS display_name,
            pp.avatar_color, pp.avatar_emoji
     FROM users u LEFT JOIN player_profiles pp ON pp.user_id = u.id WHERE u.id = $1`,
    [otherUserId],
  )
  const peerRow = other.rows[0]
  if (!peerRow) return fail(404, 'NOT_FOUND', 'That player isn’t around any more.')

  const key = [userId, otherUserId].sort().join(':')
  const client = await pool.connect()
  let chatId: string
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO chats (id, kind, title, direct_key) VALUES ($1, 'direct', '', $2)
       ON CONFLICT (direct_key) DO NOTHING`,
      [createId(), key],
    )
    const found = await client.query<{ id: string }>(`SELECT id FROM chats WHERE direct_key = $1`, [key])
    chatId = found.rows[0]!.id
    for (const member of [userId, otherUserId]) {
      await client.query(
        `INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2) ON CONFLICT (chat_id, user_id) DO NOTHING`,
        [chatId, member],
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  const peer = toPlayerCard(peerRow)
  return {
    ok: true,
    chat: { id: chatId, kind: 'direct', title: peer.displayName, hostelId: null, peer, pinned: false, unread: 0, lastMessage: null },
  }
}

export async function unreadTotal(userId: string): Promise<number> {
  const result = await pool.query<{ total: number }>(
    `SELECT COALESCE(SUM((${UNREAD_SQL})), 0)::int AS total FROM chat_members cm WHERE cm.user_id = $1`,
    [userId],
  )
  return result.rows[0]?.total ?? 0
}

/**
 * Page of messages, oldest first. No cursor → latest page. `before` → older page (scroll up).
 * `after` → anything newer (polling while the chat is open).
 */
export async function getMessages(
  userId: string,
  chatId: string,
  cursor: { before?: number; after?: number; limit?: number },
): Promise<{ ok: true; messages: ChatMessage[]; hasMore: boolean } | Fail> {
  if (!(await isMember(chatId, userId))) return fail(403, 'NOT_MEMBER', 'Join this hostel to see its chat.')
  const limit = Math.min(Math.max(cursor.limit ?? CHAT_PAGE_SIZE, 1), CHAT_PAGE_SIZE)

  if (cursor.after != null) {
    const rows = await pool.query<MessageRow>(
      `${MESSAGE_SELECT} WHERE m.chat_id = $1 AND m.seq > $2 AND ${NOT_REPORTED_BY('$3')}
       ORDER BY m.seq ASC LIMIT 100`,
      [chatId, cursor.after, userId],
    )
    return { ok: true, messages: rows.rows.map((row) => toMessage(row, userId)), hasMore: false }
  }

  const params: unknown[] = [chatId, userId, limit + 1]
  let older = ''
  if (cursor.before != null) {
    params.push(cursor.before)
    older = `AND m.seq < $4`
  }
  const rows = await pool.query<MessageRow>(
    `${MESSAGE_SELECT} WHERE m.chat_id = $1 ${older} AND ${NOT_REPORTED_BY('$2')}
     ORDER BY m.seq DESC LIMIT $3`,
    params,
  )
  const hasMore = rows.rows.length > limit
  const page = rows.rows.slice(0, limit).reverse()
  return { ok: true, messages: page.map((row) => toMessage(row, userId)), hasMore }
}

async function chatKindOf(chatId: string) {
  const found = await pool.query<{ kind: 'hostel' | 'direct' }>(`SELECT kind FROM chats WHERE id = $1`, [chatId])
  return found.rows[0]?.kind ?? null
}

async function insertMessage(
  client: PoolClient | typeof pool,
  userId: string,
  chatId: string,
  kind: MessageKind,
  body: string,
) {
  const inserted = await client.query<{ seq: string }>(
    `INSERT INTO chat_messages (chat_id, sender_id, kind, body) VALUES ($1, $2, $3, $4) RETURNING seq::text AS seq`,
    [chatId, userId, kind, body],
  )
  const seq = inserted.rows[0]!.seq
  await client.query(
    `UPDATE chat_members SET last_read_seq = GREATEST(last_read_seq, $3) WHERE chat_id = $1 AND user_id = $2`,
    [chatId, userId, seq],
  )
  return seq
}

/**
 * Send a text, a sticker (`rawBody` = sticker id) or a "come over" invite (direct chats only;
 * the body is filled with the sender's username so the other player can visit).
 */
export async function sendMessage(
  userId: string,
  chatId: string,
  rawBody: string,
  kind: 'text' | 'sticker' | 'invite' | 'visit' = 'text',
): Promise<{ ok: true; message: ChatMessage } | Fail> {
  let body = rawBody.replace(/\r\n/g, '\n').trim()
  if (kind === 'sticker' && !isStickerId(body)) return fail(400, 'BAD_STICKER', 'Pick a sticker from the list.')
  if (kind === 'text') {
    if (!body) return fail(400, 'EMPTY', 'Type a message first.')
    if (body.length > CHAT_MESSAGE_MAX) {
      return fail(400, 'TOO_LONG', `Keep it under ${CHAT_MESSAGE_MAX} characters.`)
    }
  }
  if (!(await isMember(chatId, userId))) return fail(403, 'NOT_MEMBER', 'Join this hostel to chat.')
  if (kind === 'invite') {
    if ((await chatKindOf(chatId)) !== 'direct') return fail(400, 'DIRECT_ONLY', 'Invites work in one-to-one chats.')
    const me = await pool.query<{ username: string }>(`SELECT username FROM users WHERE id = $1`, [userId])
    body = me.rows[0]?.username ?? ''
  }
  if (kind === 'visit') {
    // "You visited @x" / "@you visited your place" — the body is the visited player's username
    if ((await chatKindOf(chatId)) !== 'direct') return fail(400, 'DIRECT_ONLY', 'Visits work in one-to-one chats.')
    const peer = await pool.query<{ username: string }>(
      `SELECT u.username FROM chat_members cm JOIN users u ON u.id = cm.user_id WHERE cm.chat_id = $1 AND cm.user_id <> $2`,
      [chatId, userId],
    )
    body = peer.rows[0]?.username ?? ''
  }

  const recent = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM chat_messages
     WHERE sender_id = $1 AND created_at > NOW() - INTERVAL '1 minute'`,
    [userId],
  )
  if ((recent.rows[0]?.n ?? 0) >= CHAT_RATE_PER_MIN) {
    return fail(429, 'SLOW_DOWN', 'You’re sending messages quickly — wait a moment and try again.')
  }

  const seq = await insertMessage(pool, userId, chatId, kind, body)
  const row = await pool.query<MessageRow>(`${MESSAGE_SELECT} WHERE m.seq = $1`, [seq])
  return { ok: true, message: toMessage(row.rows[0]!, userId) }
}

/**
 * A small "challenged you to a game" note in the direct chat between two players
 * (body = JSON: { matchId, game, stake }). Starts the chat if they've never talked.
 */
export async function postGameNotice(fromUserId: string, toUserId: string, body: string) {
  const opened = await openDirectChat(fromUserId, toUserId)
  if (!opened.ok) return
  await insertMessage(pool, fromUserId, opened.chat.id, 'game', body)
}

/**
 * Send naira to the other player in a direct chat. Both wallets move in one transaction
 * (rows locked in a fixed order), each gets a ledger line, and a "money" message lands in the chat.
 */
export async function sendMoney(
  userId: string,
  chatId: string,
  amount: number,
): Promise<{ ok: true; message: ChatMessage; cash: number; version: number } | Fail> {
  if (!Number.isInteger(amount) || amount < TRANSFER_MIN || amount > TRANSFER_MAX) {
    return fail(400, 'BAD_AMOUNT', `Send between ₦${TRANSFER_MIN.toLocaleString()} and ₦${TRANSFER_MAX.toLocaleString()}.`)
  }
  if ((await chatKindOf(chatId)) !== 'direct') return fail(400, 'DIRECT_ONLY', 'You can only send money in a one-to-one chat.')
  if (!(await isMember(chatId, userId))) return fail(403, 'NOT_MEMBER', 'You are not in this chat.')

  const recent = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM chat_messages
     WHERE sender_id = $1 AND kind = 'money' AND created_at > NOW() - INTERVAL '1 minute'`,
    [userId],
  )
  if ((recent.rows[0]?.n ?? 0) >= TRANSFER_RATE_PER_MIN) {
    return fail(429, 'SLOW_DOWN', 'Easy — wait a minute before sending more money.')
  }

  const people = await pool.query<{ user_id: string; character_id: string; username: string }>(
    `SELECT cm.user_id, c.id AS character_id, u.username
     FROM chat_members cm
     JOIN users u ON u.id = cm.user_id
     JOIN characters c ON c.user_id = cm.user_id
     JOIN game_state g ON g.character_id = c.id
     WHERE cm.chat_id = $1`,
    [chatId],
  )
  const me = people.rows.find((row) => row.user_id === userId)
  const peer = people.rows.find((row) => row.user_id !== userId)
  if (!me) return fail(409, 'NO_WALLET', 'Finish setting up your character first.')
  if (!peer) return fail(409, 'PEER_NO_WALLET', 'They can’t receive money yet.')
  const inSpace = await liveSpaceMoneyBlock([userId, peer.user_id])
  if (inSpace) return fail(409, 'IN_LIVE_SPACE', inSpace)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Lock both wallets in id order so two people paying each other at once can't deadlock
    await client.query(
      `SELECT character_id FROM game_state WHERE character_id = ANY($1::text[]) ORDER BY character_id FOR UPDATE`,
      [[me.character_id, peer.character_id]],
    )
    const out = await applyCash(client, me.character_id, -amount, `Sent to @${peer.username}`, 'transfer_out')
    if (!out.ok) {
      await client.query('ROLLBACK')
      return out.error === 'INSUFFICIENT_FUNDS'
        ? fail(400, 'INSUFFICIENT_FUNDS', 'You don’t have that much cash.')
        : fail(409, 'NO_WALLET', 'Finish setting up your character first.')
    }
    const received = await applyCash(client, peer.character_id, amount, `From @${me.username}`, 'transfer_in')
    if (!received.ok) {
      await client.query('ROLLBACK')
      return fail(409, 'PEER_NO_WALLET', 'They can’t receive money yet.')
    }
    const seq = await insertMessage(client, userId, chatId, 'money', String(amount))
    await client.query('COMMIT')
    const row = await pool.query<MessageRow>(`${MESSAGE_SELECT} WHERE m.seq = $1`, [seq])
    return { ok: true, message: toMessage(row.rows[0]!, userId), cash: out.cash, version: out.version }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/** Who you'd be visiting: name and look for the room screen. */
export async function getHostCard(username: string) {
  const found = await pool.query<{
    user_id: string
    username: string
    display_name: string
    appearance: unknown
    lodging_id: string | null
  }>(
    `SELECT u.id AS user_id, u.username, u.username AS display_name, c.appearance, c.lodging_id
     FROM users u
     JOIN characters c ON c.user_id = u.id
     LEFT JOIN player_profiles pp ON pp.user_id = u.id
     WHERE LOWER(u.username) = LOWER($1)`,
    [username],
  )
  const row = found.rows[0]
  if (!row) return null
  return {
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    appearance: row.appearance,
    lodgingId: row.lodging_id,
  }
}

export async function markRead(userId: string, chatId: string, seq: number) {
  await pool.query(
    `UPDATE chat_members SET last_read_seq = GREATEST(last_read_seq, $3) WHERE chat_id = $1 AND user_id = $2`,
    [chatId, userId, seq],
  )
}

export async function reportMessage(
  userId: string,
  seq: number,
  reason: string | undefined,
): Promise<{ ok: true } | Fail> {
  const found = await pool.query<{ chat_id: string; sender_id: string | null; kind: string }>(
    `SELECT chat_id, sender_id, kind FROM chat_messages WHERE seq = $1`,
    [seq],
  )
  const message = found.rows[0]
  if (!message || !(await isMember(message.chat_id, userId))) return fail(404, 'NOT_FOUND', 'Message not found.')
  if (message.kind === 'system') return fail(400, 'SYSTEM', 'That’s a system message.')
  if (message.sender_id === userId) return fail(400, 'OWN_MESSAGE', 'You can’t report your own message.')
  await pool.query(
    `INSERT INTO chat_reports (message_seq, reporter_id, reason) VALUES ($1, $2, $3)
     ON CONFLICT (message_seq, reporter_id) DO NOTHING`,
    [seq, userId, reason?.slice(0, 200) ?? null],
  )
  return { ok: true }
}
