import { randomBytes } from 'node:crypto'
import type { WebSocket } from 'ws'
import { pool } from '../db.js'
import { applyCash } from './game-state.js'

/*
 * Live crowd in a club. Every player inside is in a crowd group (venue_visits.group_no,
 * up to GROUP_SIZE); each group is one room here. Phones send where they stand and what
 * they're doing a few times a second and the room passes it on to the others, so you see
 * the people in your group walk, dance and sit. Money sprays rain on one room, and every
 * note is claimed on the server so it can only be picked once.
 *
 * Rooms live in this process's memory (one API process). The phone gets a short-lived
 * ticket over the normal logged-in API, then opens the socket with it.
 */

export type LivePose = 'idle' | 'walk' | 'sit' | 'dance' | 'bath'
const POSES = new Set<LivePose>(['idle', 'walk', 'sit', 'dance', 'bath'])

type PlayerInfo = {
  userId: string
  characterId: string
  username: string
  displayName: string
  appearance: unknown
  vip: boolean
}

type PlayerState = { x: number; y: number; z: number; h: number; pose: LivePose; moving: boolean }

type Member = {
  socket: WebSocket
  info: PlayerInfo
  state: PlayerState | null
  lastState: number
  picks: number[]
}

type Ticket = PlayerInfo & { venueId: string; night: number; group: number; expires: number }

const tickets = new Map<string, Ticket>()
const rooms = new Map<string, Map<string, Member>>()

const roomKey = (venueId: string, night: number, group: number) => `${venueId}:${night}:${group}`

/** One-minute ticket for opening the live socket (checked against venue_visits first). */
export async function createLiveTicket(userId: string, venueId: string, night: number) {
  const found = await pool.query<{
    character_id: string
    username: string
    display_name: string
    appearance: unknown
    group_no: number
    vip: boolean
  }>(
    `SELECT c.id AS character_id, u.username, u.username AS display_name, c.appearance,
            v.group_no, v.vip
     FROM venue_visits v
     JOIN characters c ON c.id = v.character_id
     JOIN users u ON u.id = c.user_id
     LEFT JOIN player_profiles pp ON pp.user_id = u.id
     WHERE u.id = $1 AND v.venue_id = $2 AND v.night_key = $3`,
    [userId, venueId, night],
  )
  const row = found.rows[0]
  if (!row) return null
  const token = randomBytes(24).toString('base64url')
  const now = Date.now()
  for (const [key, t] of tickets) if (t.expires < now) tickets.delete(key)
  tickets.set(token, {
    userId,
    characterId: row.character_id,
    username: row.username,
    displayName: row.display_name,
    appearance: row.appearance,
    vip: row.vip,
    venueId,
    night,
    group: row.group_no,
    expires: now + 60_000,
  })
  return { ticket: token, group: row.group_no }
}

function send(socket: WebSocket, message: unknown) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message))
}

function broadcast(key: string, message: unknown, except?: string) {
  const room = rooms.get(key)
  if (!room) return
  const text = JSON.stringify(message)
  for (const [userId, member] of room) {
    if (userId !== except && member.socket.readyState === member.socket.OPEN) member.socket.send(text)
  }
}

const publicInfo = (m: Member) => ({
  userId: m.info.userId,
  username: m.info.username,
  displayName: m.info.displayName,
  appearance: m.info.appearance,
  vip: m.info.vip,
  state: m.state,
})

function readState(raw: Record<string, unknown>): PlayerState | null {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const x = num(raw.x)
  const z = num(raw.z)
  const h = num(raw.h)
  const pose = typeof raw.pose === 'string' && POSES.has(raw.pose as LivePose) ? (raw.pose as LivePose) : null
  if (x == null || z == null || h == null || !pose) return null
  const clamp = (v: number) => Math.max(-30, Math.min(30, v))
  const y = Math.max(-1, Math.min(3, num(raw.y) ?? 0))
  return { x: clamp(x), y, z: clamp(z), h, pose, moving: raw.moving === true }
}

/** A phone opened the live socket. */
export function joinLive(socket: WebSocket, token: string | undefined) {
  const ticket = token ? tickets.get(token) : undefined
  if (!ticket || ticket.expires < Date.now()) {
    send(socket, { t: 'error', error: 'Ticket expired. Reconnecting…' })
    socket.close(4001, 'bad ticket')
    return
  }
  tickets.delete(token!)
  const key = roomKey(ticket.venueId, ticket.night, ticket.group)
  let room = rooms.get(key)
  if (!room) rooms.set(key, (room = new Map()))
  // Same player on a second tab/phone: the newer connection wins
  room.get(ticket.userId)?.socket.close(4002, 'replaced')
  const { venueId: _v, night: _n, group: _g, expires: _e, ...info } = ticket
  const me: Member = { socket, info, state: null, lastState: 0, picks: [] }
  room.set(ticket.userId, me)

  send(socket, {
    t: 'snapshot',
    group: ticket.group,
    players: [...room.values()].filter((m) => m !== me).map(publicInfo),
  })
  broadcast(key, { t: 'join', player: publicInfo(me) }, ticket.userId)

  socket.on('message', (data) => {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(String(data)) as Record<string, unknown>
    } catch {
      return
    }
    if (msg.t === 'state') {
      const now = Date.now()
      if (now - me.lastState < 80) return // at most ~12 updates a second
      const state = readState(msg)
      if (!state) return
      me.lastState = now
      me.state = state
      broadcast(key, { t: 'state', userId: me.info.userId, ...state }, me.info.userId)
    } else if (msg.t === 'pick') {
      void pickNote(key, me, msg)
    }
  })

  socket.on('close', () => {
    const current = rooms.get(key)
    if (current?.get(me.info.userId) !== me) return
    current.delete(me.info.userId)
    if (!current.size) rooms.delete(key)
    broadcast(key, { t: 'leave', userId: me.info.userId })
  })
}

/* —— Money spray —— */

export type SprayNote = { note: number; value: number }

/** Tell a group a spray started (called after the payment has committed). */
export function announceSpray(
  venueId: string,
  night: number,
  group: number,
  spray: { id: string; by: string; byUsername: string; amount: number; notes: SprayNote[]; endsAt: number },
) {
  broadcast(roomKey(venueId, night, group), { t: 'spray', ...spray })
}

async function pickNote(key: string, me: Member, msg: Record<string, unknown>) {
  const sprayId = typeof msg.sprayId === 'string' ? msg.sprayId : null
  const note = typeof msg.note === 'number' && Number.isInteger(msg.note) ? msg.note : null
  if (!sprayId || note == null) return
  // A human can't tap more than ~8 notes a second
  const now = Date.now()
  me.picks = me.picks.filter((t) => now - t < 1000)
  if (me.picks.length >= 8) return
  me.picks.push(now)

  const [venueId, night, group] = key.split(':')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const claimed = await client.query<{ value: string }>(
      `UPDATE venue_spray_notes n SET picked_by = $3, picked_at = NOW()
       FROM venue_sprays s
       WHERE n.spray_id = $1 AND n.note_no = $2 AND n.picked_by IS NULL
         AND s.id = n.spray_id AND s.ends_at > NOW() AND s.sprayer_id <> $3
         AND s.venue_id = $4 AND s.night_key = $5 AND s.group_no = $6
       RETURNING n.value::text AS value`,
      [sprayId, note, me.info.characterId, venueId, Number(night), Number(group)],
    )
    const value = Number(claimed.rows[0]?.value ?? 0)
    if (!value) {
      await client.query('ROLLBACK')
      send(me.socket, { t: 'missed', sprayId, note })
      return
    }
    const credited = await applyCash(client, me.info.characterId, value, 'Picked sprayed money', 'spray_pick')
    if (!credited.ok) {
      await client.query('ROLLBACK')
      send(me.socket, { t: 'missed', sprayId, note })
      return
    }
    await client.query('COMMIT')
    send(me.socket, { t: 'got', sprayId, note, value, cash: credited.cash })
    broadcast(key, { t: 'picked', sprayId, note, by: me.info.displayName }, me.info.userId)
  } catch {
    await client.query('ROLLBACK').catch(() => undefined)
  } finally {
    client.release()
  }
}

/** How many players are connected in a room (for tests / debugging). */
export function liveCount(venueId: string, night: number, group: number) {
  return rooms.get(roomKey(venueId, night, group))?.size ?? 0
}
