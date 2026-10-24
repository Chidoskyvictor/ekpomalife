import { pool } from '../db.js'
import { createId } from '../ids.js'
import {
  addChatMember,
  chatIdForHostel,
  createHostelChat,
  postSystemMessage,
  removeChatMember,
  type ChatSender,
} from './chat.js'
import { normalizeHostelName, validateHostelName } from './hostel-names.js'

/** Real off-campus hostels — created by players, shared, one per player. */

export const HOSTEL_SEARCH_LIMIT = 8
/** New hostels a player may add per 24h. */
export const HOSTEL_CREATES_PER_DAY = 3
/** Trigram similarity at which a new name counts as a re-spelling of an existing hostel. */
export const HOSTEL_SIMILAR_AT = 0.75

export type HostelSummary = { id: string; name: string; members: number }
export type HostelSearchHit = HostelSummary & { exact: boolean }

type Fail = { ok: false; status: number; code: string; error: string }
const fail = (status: number, code: string, error: string): Fail => ({ ok: false, status, code, error })

let trigramReady: boolean | null = null
async function hasTrigram() {
  if (trigramReady == null) {
    const found = await pool.query(`SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'`)
    trigramReady = (found.rowCount ?? 0) > 0
  }
  return trigramReady
}

const MEMBER_COUNT = `(SELECT COUNT(*)::int FROM hostel_members hm WHERE hm.hostel_id = h.id)`

/** Top matches for what the player is typing: exact first, then closest, then busiest. */
export async function searchHostels(q: string): Promise<{ normalized: string; results: HostelSearchHit[] }> {
  const normalized = normalizeHostelName(q)
  if (!normalized) return { normalized, results: [] }
  const like = `%${normalized}%`
  const trigram = await hasTrigram()
  const rows = await pool.query<{ id: string; name: string; members: number; exact: boolean }>(
    trigram
      ? `SELECT h.id, h.name, ${MEMBER_COUNT} AS members, h.normalized_name = $1 AS exact
         FROM hostels h
         WHERE h.normalized_name ILIKE $2 OR h.normalized_name % $1
         ORDER BY (h.normalized_name = $1) DESC, similarity(h.normalized_name, $1) DESC, members DESC
         LIMIT $3`
      : `SELECT h.id, h.name, ${MEMBER_COUNT} AS members, h.normalized_name = $1 AS exact
         FROM hostels h
         WHERE h.normalized_name ILIKE $2
         ORDER BY (h.normalized_name = $1) DESC, (h.normalized_name ILIKE $1 || '%') DESC,
                  LENGTH(h.normalized_name), members DESC
         LIMIT $3`,
    [normalized, like, HOSTEL_SEARCH_LIMIT],
  )
  return { normalized, results: rows.rows }
}

async function hostelSummary(id: string): Promise<HostelSummary | null> {
  const found = await pool.query<HostelSummary>(`SELECT h.id, h.name, ${MEMBER_COUNT} AS members FROM hostels h WHERE h.id = $1`, [id])
  return found.rows[0] ?? null
}

export async function getMyHostel(userId: string): Promise<{ hostel: HostelSummary; chatId: string | null } | null> {
  const found = await pool.query<{ hostel_id: string }>(`SELECT hostel_id FROM hostel_members WHERE user_id = $1`, [userId])
  const hostelId = found.rows[0]?.hostel_id
  if (!hostelId) return null
  const hostel = await hostelSummary(hostelId)
  if (!hostel) return null
  return { hostel, chatId: await chatIdForHostel(pool, hostelId) }
}

export type HostelExists = Fail & { matches: HostelSummary[] }

const existsFail = (matches: HostelSummary[], similar: boolean): HostelExists => ({
  ...fail(
    409,
    similar ? 'SIMILAR_EXISTS' : 'HOSTEL_EXISTS',
    similar
      ? `Did you mean ${matches[0]!.name}? It’s already on the list — join it, or try a different name.`
      : `${matches[0]!.name} is already on the list. Join it, or try a different name.`,
  ),
  matches,
})

/** Add a new hostel. Same or near-same name → HOSTEL_EXISTS / SIMILAR_EXISTS with the match to join. */
export async function createHostel(
  userId: string,
  rawName: string,
): Promise<{ ok: true; hostel: HostelSummary; created: true } | HostelExists | Fail> {
  const valid = validateHostelName(rawName)
  if (!valid.ok) return fail(400, 'BAD_NAME', valid.error)

  const existing = await pool.query<{ id: string }>(`SELECT id FROM hostels WHERE normalized_name = $1`, [valid.normalized])
  if (existing.rows[0]) {
    const hostel = await hostelSummary(existing.rows[0].id)
    if (hostel) return existsFail([hostel], false)
  }
  if (await hasTrigram()) {
    const similar = await pool.query<HostelSummary>(
      `SELECT h.id, h.name, ${MEMBER_COUNT} AS members FROM hostels h
       WHERE similarity(h.normalized_name, $1) >= $2
       ORDER BY similarity(h.normalized_name, $1) DESC LIMIT 3`,
      [valid.normalized, HOSTEL_SIMILAR_AT],
    )
    if (similar.rows.length) return existsFail(similar.rows, true)
  }

  const recent = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM hostels WHERE created_by = $1 AND created_at > NOW() - INTERVAL '1 day'`,
    [userId],
  )
  if ((recent.rows[0]?.n ?? 0) >= HOSTEL_CREATES_PER_DAY) {
    return fail(429, 'CREATE_LIMIT', 'You’ve added a few hostels today — try again tomorrow, or join one from the list.')
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const id = createId()
    const inserted = await client.query(
      `INSERT INTO hostels (id, name, normalized_name, created_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (normalized_name) DO NOTHING`,
      [id, valid.name, valid.normalized, userId],
    )
    if ((inserted.rowCount ?? 0) === 0) {
      // Someone added the same hostel a moment ago — point to theirs
      await client.query('ROLLBACK')
      const raced = await pool.query<{ id: string }>(`SELECT id FROM hostels WHERE normalized_name = $1`, [valid.normalized])
      const hostel = raced.rows[0] ? await hostelSummary(raced.rows[0].id) : null
      return hostel ? existsFail([hostel], false) : fail(409, 'CONFLICT', 'Try again.')
    }
    await createHostelChat(client, id, valid.name)
    await client.query('COMMIT')
    return { ok: true, hostel: { id, name: valid.name, members: 0 }, created: true }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function displayNameOf(userId: string) {
  const found = await pool.query<{ name: string }>(
    `SELECT COALESCE(pp.display_name, u.name) AS name FROM users u
     LEFT JOIN player_profiles pp ON pp.user_id = u.id WHERE u.id = $1`,
    [userId],
  )
  return found.rows[0]?.name ?? 'A neighbour'
}

export async function joinHostel(
  userId: string,
  hostelId: string,
): Promise<{ ok: true; hostel: HostelSummary; chatId: string } | Fail> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const hostel = await client.query<{ id: string; name: string }>(`SELECT id, name FROM hostels WHERE id = $1 FOR UPDATE`, [hostelId])
    const row = hostel.rows[0]
    if (!row) {
      await client.query('ROLLBACK')
      return fail(404, 'NOT_FOUND', 'That hostel isn’t on the list any more.')
    }
    const current = await client.query<{ hostel_id: string }>(`SELECT hostel_id FROM hostel_members WHERE user_id = $1`, [userId])
    if (current.rows[0] && current.rows[0].hostel_id !== hostelId) {
      await client.query('ROLLBACK')
      return fail(409, 'ALREADY_IN_HOSTEL', 'You’re already in a hostel. Leave it first to join another.')
    }
    let chatId = await chatIdForHostel(client, hostelId)
    if (!chatId) chatId = await createHostelChat(client, hostelId, row.name)
    if (!current.rows[0]) {
      await client.query(`INSERT INTO hostel_members (hostel_id, user_id) VALUES ($1, $2)`, [hostelId, userId])
      await addChatMember(client, chatId, userId)
      await postSystemMessage(client, chatId, `${await displayNameOf(userId)} joined ${row.name}`)
      // Your own "joined" line isn't unread for you
      await client.query(
        `UPDATE chat_members SET last_read_seq = (SELECT MAX(seq) FROM chat_messages WHERE chat_id = $1)
         WHERE chat_id = $1 AND user_id = $2`,
        [chatId, userId],
      )
    }
    await client.query('COMMIT')
    const summary = await hostelSummary(hostelId)
    return { ok: true, hostel: summary ?? { id: hostelId, name: row.name, members: 1 }, chatId }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function leaveHostel(userId: string): Promise<{ ok: true } | Fail> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const current = await client.query<{ hostel_id: string; name: string }>(
      `DELETE FROM hostel_members hm USING hostels h
       WHERE hm.user_id = $1 AND h.id = hm.hostel_id
       RETURNING hm.hostel_id, h.name`,
      [userId],
    )
    const left = current.rows[0]
    if (!left) {
      await client.query('ROLLBACK')
      return fail(404, 'NOT_IN_HOSTEL', 'You’re not in a hostel.')
    }
    const chatId = await chatIdForHostel(client, left.hostel_id)
    if (chatId) {
      await removeChatMember(client, chatId, userId)
      await postSystemMessage(client, chatId, `${await displayNameOf(userId)} left ${left.name}`)
    }
    await client.query('COMMIT')
    return { ok: true }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export type Neighbour = ChatSender & { joinedAt: string; isMe: boolean }

/** Everyone in the player's hostel (members only). */
export async function listNeighbours(userId: string, hostelId: string): Promise<{ ok: true; neighbours: Neighbour[] } | Fail> {
  const member = await pool.query(`SELECT 1 FROM hostel_members WHERE hostel_id = $1 AND user_id = $2`, [hostelId, userId])
  if ((member.rowCount ?? 0) === 0) return fail(403, 'NOT_MEMBER', 'Join this hostel to see your neighbours.')
  const rows = await pool.query<{
    user_id: string
    display_name: string
    avatar_color: string | null
    avatar_emoji: string | null
    joined_at: Date
  }>(
    `SELECT hm.user_id, COALESCE(pp.display_name, u.name) AS display_name, pp.avatar_color, pp.avatar_emoji, hm.joined_at
     FROM hostel_members hm
     JOIN users u ON u.id = hm.user_id
     LEFT JOIN player_profiles pp ON pp.user_id = hm.user_id
     WHERE hm.hostel_id = $1
     ORDER BY hm.joined_at`,
    [hostelId],
  )
  return {
    ok: true,
    neighbours: rows.rows.map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      avatar: { color: row.avatar_color ?? '#3d9ad6', emoji: row.avatar_emoji },
      joinedAt: row.joined_at.toISOString(),
      isMe: row.user_id === userId,
    })),
  }
}
