import { randomBytes } from 'node:crypto'
import type { WebSocket } from 'ws'
import { pool } from '../db.js'
import { joinToken, liveKitConfig, type LiveKitConfig } from './livekit.js'
import { cleanGameChat, GAME_CHAT_KEEP, RateLimiter } from './game-chat-rules.js'

/*
 * One chat (and one voice room) per live match/table, shared by every online game.
 * Text lives in memory only, for the length of the match; a reported line is copied to
 * game_chat_reports so an admin can read it. Only seated players get a ticket or a voice token.
 */

export type ChatKind = 'match' | 'whot' | 'ludo'
export const CHAT_KINDS = ['match', 'whot', 'ludo'] as const
export type Seated = { name: string; seat: number }
/** Finds the caller's seat in a live match/table, or null when they are not sitting at it. */
export type SeatLookup = (userId: string, kind: ChatKind, id: string) => Promise<Seated | null>

export type ChatLine = { id: number; seat: number; name: string; text: string; at: number }
type Sink = { send: (message: unknown) => void }

export const roomKey = (kind: ChatKind, id: string) => `${kind}:${id}`
export const gameVoiceRoom = (kind: ChatKind, id: string) => `game_${kind}_${id}`

export const dbSeatLookup: SeatLookup = async (userId, kind, id) => {
  const query =
    kind === 'match'
      ? `SELECT u.username AS name, CASE WHEN m.host_id = c.id THEN 0 ELSE 1 END AS seat
           FROM game_matches m JOIN characters c ON c.user_id = $1 AND (m.host_id = c.id OR m.guest_id = c.id)
           JOIN users u ON u.id = c.user_id WHERE m.id = $2 AND m.status = 'active'`
      : kind === 'whot'
        ? `SELECT u.username AS name, p.seat FROM whot_table_players p
             JOIN whot_tables t ON t.id = p.table_id JOIN characters c ON c.id = p.character_id AND c.user_id = $1
             JOIN users u ON u.id = c.user_id
            WHERE t.id = $2 AND p.left_at IS NULL AND t.status IN ('lobby', 'active')`
        : `SELECT u.username AS name, p.seat FROM ludo_table_players p
             JOIN ludo_tables t ON t.id = p.table_id JOIN characters c ON c.id = p.character_id AND c.user_id = $1
             JOIN users u ON u.id = c.user_id
            WHERE t.id = $2 AND p.left_at IS NULL AND t.status IN ('lobby', 'active')`
  const found = await pool.query<{ name: string; seat: number }>(query, [userId, id])
  return found.rows[0] ? { name: found.rows[0].name, seat: Number(found.rows[0].seat) } : null
}

/** The chat of one match/table: who is in it, the last lines, and the rate limit. */
export class GameChatRoom {
  readonly history: ChatLine[] = []
  private readonly limiter = new RateLimiter()
  private readonly members = new Map<string, { name: string; seat: number; sink: Sink }>()
  private nextId = 1

  constructor(readonly key: string) {}

  get size() {
    return this.members.size
  }

  join(userId: string, who: Seated, sink: Sink) {
    this.members.set(userId, { ...who, sink })
    sink.send({ t: 'hello', seat: who.seat, history: this.history })
  }

  /** Only drops the member if it is still this same connection (a reconnect may already have replaced it). */
  leave(userId: string, sink: Sink) {
    if (this.members.get(userId)?.sink === sink) this.members.delete(userId)
  }

  say(userId: string, raw: unknown, now = Date.now()): { ok: true; line: ChatLine } | { ok: false; error: string } {
    const member = this.members.get(userId)
    if (!member) return { ok: false, error: 'You are not in this chat.' }
    const clean = cleanGameChat(raw)
    if (!clean.ok) return clean
    if (!this.limiter.take(userId, now)) return { ok: false, error: 'Slow down a little.' }
    const line: ChatLine = { id: this.nextId++, seat: member.seat, name: member.name, text: clean.text, at: now }
    this.history.push(line)
    if (this.history.length > GAME_CHAT_KEEP) this.history.shift()
    for (const m of this.members.values()) m.sink.send({ t: 'msg', line })
    return { ok: true, line }
  }
}

const rooms = new Map<string, GameChatRoom>()
const tickets = new Map<string, { userId: string; kind: ChatKind; id: string; who: Seated; expires: number }>()

export function chatRoom(kind: ChatKind, id: string) {
  const key = roomKey(kind, id)
  let room = rooms.get(key)
  if (!room) rooms.set(key, (room = new GameChatRoom(key)))
  return room
}

/** One-minute ticket to open the chat socket; null if the caller is not sitting at that match/table. */
export async function chatTicket(userId: string, kind: ChatKind, id: string, lookup: SeatLookup = dbSeatLookup) {
  const who = await lookup(userId, kind, id)
  if (!who) return null
  const now = Date.now()
  for (const [k, t] of tickets) if (t.expires < now) tickets.delete(k)
  const ticket = randomBytes(24).toString('base64url')
  tickets.set(ticket, { userId, kind, id, who, expires: now + 60_000 })
  return { ticket, seat: who.seat, voice: liveKitConfig() !== null }
}

/** LiveKit join token for the match/table's voice room (never recorded); null if not seated. */
export async function gameVoiceAccess(userId: string, kind: ChatKind, id: string, cfg: LiveKitConfig, lookup: SeatLookup = dbSeatLookup) {
  const who = await lookup(userId, kind, id)
  if (!who) return null
  const token = joinToken(cfg, { spaceId: id, room: gameVoiceRoom(kind, id), userId, name: who.name, canPublish: true, ttlSeconds: 30 * 60 })
  return { url: cfg.url, token }
}

export function joinGameChat(socket: WebSocket, token: string | undefined) {
  const ticket = token ? tickets.get(token) : undefined
  if (!ticket || ticket.expires < Date.now()) {
    socket.send(JSON.stringify({ t: 'error', error: 'Ticket expired.' }))
    socket.close(4001, 'bad ticket')
    return
  }
  tickets.delete(token!)
  const room = chatRoom(ticket.kind, ticket.id)
  const sink: Sink = { send: (m) => socket.readyState === socket.OPEN && socket.send(JSON.stringify(m)) }
  room.join(ticket.userId, ticket.who, sink)

  socket.on('message', (data) => {
    if (String(data).length > 2000) return
    let msg: { t?: unknown; text?: unknown; id?: unknown; reason?: unknown }
    try {
      msg = JSON.parse(String(data))
    } catch {
      return
    }
    if (msg.t === 'say') {
      const out = room.say(ticket.userId, msg.text)
      if (!out.ok) sink.send({ t: 'error', error: out.error })
    } else if (msg.t === 'report' && typeof msg.id === 'number') {
      const line = room.history.find((l) => l.id === msg.id)
      if (!line || line.seat === ticket.who.seat) return
      void pool
        .query(
          `INSERT INTO game_chat_reports (room_key, sender_name, body, sent_at, reporter_id, reason)
           VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), $5, $6) ON CONFLICT DO NOTHING`,
          [room.key, line.name, line.text, line.at, ticket.userId, typeof msg.reason === 'string' ? msg.reason.slice(0, 200) : null],
        )
        .then(() => sink.send({ t: 'reported', id: line.id }))
        .catch(() => sink.send({ t: 'error', error: 'Could not send the report.' }))
    }
  })
  socket.on('close', () => {
    room.leave(ticket.userId, sink)
    // The text is for this match only: forget it a while after everyone has gone
    if (room.size === 0) {
      setTimeout(() => {
        if (room.size === 0 && rooms.get(room.key) === room) rooms.delete(room.key)
      }, 10 * 60_000).unref()
    }
  })
}

export async function listGameChatReports(limit = 100) {
  const found = await pool.query(
    `SELECT r.id, r.room_key, r.sender_name, r.body, r.sent_at, r.reason, r.created_at, u.username AS reporter
       FROM game_chat_reports r JOIN users u ON u.id = r.reporter_id ORDER BY r.created_at DESC LIMIT $1`,
    [limit],
  )
  return found.rows
}
