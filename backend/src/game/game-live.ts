import { randomBytes } from 'node:crypto'
import type { WebSocket } from 'ws'

/*
 * Live match relay for Phone → Games. Both phones in a match join one room; each shot,
 * the shooter's final table and turn timeouts are passed to the other phone. The server
 * also remembers when each player was last connected, so a player who leaves can lose
 * by forfeit (see reportResult in games.ts).
 */

type Seat = { socket: WebSocket | null; characterId: string; lastSeen: number }
/** Last settled table per match, so a phone that rejoins picks up where the frame is. */
const lastTable = new Map<string, unknown>()
type Ticket = { matchId: string; characterId: string; seat: number; expires: number }

const tickets = new Map<string, Ticket>()
const rooms = new Map<string, Map<number, Seat>>()
/** When the first player sat down; an opponent who never shows up is "away" from then. */
const openedAt = new Map<string, number>()

/** Messages a phone may send on to the other one. */
const RELAYED = new Set(['shot', 'settled', 'timeout', 'emote'])

export function createGameTicket(matchId: string, characterId: string, seat: number) {
  const token = randomBytes(24).toString('base64url')
  const now = Date.now()
  for (const [key, t] of tickets) if (t.expires < now) tickets.delete(key)
  tickets.set(token, { matchId, characterId, seat, expires: now + 60_000 })
  return token
}

function send(socket: WebSocket | null, message: unknown) {
  if (socket && socket.readyState === socket.OPEN) socket.send(JSON.stringify(message))
}

/** Seconds since the opponent was last connected to this match (0 if connected now). */
export function opponentAwaySeconds(matchId: string, characterId: string) {
  const room = rooms.get(matchId)
  const seat = room && [...room.values()].find((s) => s.characterId === characterId)
  if (!seat) return room ? (Date.now() - (openedAt.get(matchId) ?? Date.now())) / 1000 : 0 // never connected
  if (seat.socket && seat.socket.readyState === seat.socket.OPEN) return 0
  return (Date.now() - seat.lastSeen) / 1000
}

export function joinGame(socket: WebSocket, token: string | undefined) {
  const ticket = token ? tickets.get(token) : undefined
  if (!ticket || ticket.expires < Date.now()) {
    send(socket, { t: 'error', error: 'Ticket expired. Reconnecting…' })
    socket.close(4001, 'bad ticket')
    return
  }
  tickets.delete(token!)
  let room = rooms.get(ticket.matchId)
  if (!room) {
    rooms.set(ticket.matchId, (room = new Map()))
    openedAt.set(ticket.matchId, Date.now())
  }
  const old = room.get(ticket.seat)
  if (old?.socket && old.socket !== socket) old.socket.close(4002, 'replaced')
  const seat: Seat = { socket, characterId: ticket.characterId, lastSeen: Date.now() }
  room.set(ticket.seat, seat)
  const other = room.get(1 - ticket.seat)
  const otherOnline = !!other?.socket && other.socket.readyState === other.socket.OPEN
  send(socket, { t: 'hello', seat: ticket.seat, opponentOnline: otherOnline })
  if (lastTable.has(ticket.matchId)) send(socket, { t: 'settled', snap: lastTable.get(ticket.matchId) })
  send(other?.socket ?? null, { t: 'presence', online: true })

  socket.on('message', (data) => {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(String(data)) as Record<string, unknown>
    } catch {
      return
    }
    if (typeof msg.t !== 'string' || !RELAYED.has(msg.t)) return
    seat.lastSeen = Date.now()
    if (msg.t === 'settled' && String(data).length < 16_000) lastTable.set(ticket.matchId, msg.snap)
    send(room!.get(1 - ticket.seat)?.socket ?? null, msg)
  })

  socket.on('close', () => {
    if (room!.get(ticket.seat) !== seat) return
    seat.socket = null
    seat.lastSeen = Date.now()
    send(room!.get(1 - ticket.seat)?.socket ?? null, { t: 'presence', online: false })
    // Forget the room a while after both have gone
    setTimeout(() => {
      const r = rooms.get(ticket.matchId)
      if (r && [...r.values()].every((s) => !s.socket)) {
        rooms.delete(ticket.matchId)
        openedAt.delete(ticket.matchId)
        lastTable.delete(ticket.matchId)
      }
    }, 15 * 60_000)
  })
}
