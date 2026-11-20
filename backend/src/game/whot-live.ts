import { randomBytes } from 'node:crypto'
import type { WebSocket } from 'ws'
import {
  autoMove,
  callLastCard,
  DEFAULT_RULES,
  forfeit,
  newWhot,
  pick,
  play,
  viewFor,
  type Shape,
  type WhotEvent,
  type WhotRules,
  type WhotState,
} from './whot-rules.js'
import { finishWhotTable, recordWhotForfeit } from './whot-tables.js'

/*
 * Live Naija Whot tables. The server holds the deck and every hand, checks every action, and
 * decides the winner (settled by whot-tables.ts); phones only ask to play / pick / call.
 */

const TURN_MS = 30_000
/** A seat whose phone is disconnected gets its turns played for it, quickly. */
const AWAY_TURN_MS = 2_000

type SeatInfo = { characterId: string; seat: number; name: string }

type LiveRoom = {
  tableId: string
  state: WhotState
  names: string[]
  characterBySeat: Map<number, string>
  away: Set<number>
  events: WhotEvent[]
  pot: number
  turnDeadline: number
  timer: ReturnType<typeof setTimeout> | null
  sockets: Map<number, WebSocket>
  settled: boolean
}

const rooms = new Map<string, LiveRoom>()
const tickets = new Map<string, { tableId: string; characterId: string; seat: number; expires: number }>()
/** House rules chosen when the table was created (tables only live minutes before they start). */
const tableRules = new Map<string, WhotRules>()

export function setWhotTableRules(tableId: string, rules: Partial<WhotRules>) {
  tableRules.set(tableId, { ...DEFAULT_RULES, ...rules })
}

export function createWhotTicket(tableId: string, characterId: string, seat: number) {
  const token = randomBytes(24).toString('base64url')
  tickets.set(token, { tableId, characterId, seat, expires: Date.now() + 60_000 })
  return token
}

export function startLiveTable(tableId: string, seats: SeatInfo[], pot: number) {
  const ordered = [...seats].sort((a, b) => a.seat - b.seat)
  // Seat numbers may have gaps if someone left the lobby: the engine seats are 0..n-1
  const room: LiveRoom = {
    tableId,
    state: newWhot(ordered.length, tableRules.get(tableId) ?? DEFAULT_RULES),
    names: ordered.map((s) => s.name),
    characterBySeat: new Map(ordered.map((s, i) => [i, s.characterId])),
    away: new Set(),
    events: [],
    pot,
    turnDeadline: 0,
    timer: null,
    sockets: new Map(),
    settled: false,
  }
  tableRules.delete(tableId)
  seatMap.set(tableId, new Map(ordered.map((s, i) => [s.seat, i])))
  rooms.set(tableId, room)
  arm(room)
}

/** table seat number → engine seat */
const seatMap = new Map<string, Map<number, number>>()

/** Players with an open socket on a live Whot table right now. */
export function whotConnected() {
  let n = 0
  for (const room of rooms.values()) for (const sock of room.sockets.values()) if (sock.readyState === sock.OPEN) n++
  return n
}

export function getLiveTable(tableId: string) {
  return rooms.get(tableId) ?? null
}

export function finishLiveTable(tableId: string) {
  const room = rooms.get(tableId)
  if (room?.timer) clearTimeout(room.timer)
  rooms.delete(tableId)
  seatMap.delete(tableId)
}

function send(socket: WebSocket | null | undefined, msg: unknown) {
  if (socket && socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg))
}

function pushState(room: LiveRoom) {
  const events = room.events
  room.events = []
  const secondsLeft = Math.max(0, Math.ceil((room.turnDeadline - Date.now()) / 1000))
  for (const [seat, socket] of room.sockets) {
    send(socket, {
      t: 'state',
      state: {
        ...viewFor(room.state, seat),
        names: room.names,
        pot: room.pot,
        mySeat: seat,
        turnSecondsLeft: secondsLeft,
        events,
      },
    })
  }
}

function settle(room: LiveRoom) {
  const winner = room.state.winner
  if (winner == null || room.settled) return
  room.settled = true
  if (room.timer) clearTimeout(room.timer)
  const winnerId = room.characterBySeat.get(winner)
  if (winnerId) void finishWhotTable(room.tableId, winnerId)
}

function arm(room: LiveRoom) {
  if (room.timer) clearTimeout(room.timer)
  if (room.state.winner != null) return
  const wait = room.away.has(room.state.turn) ? AWAY_TURN_MS : TURN_MS
  room.turnDeadline = Date.now() + wait
  room.timer = setTimeout(() => {
    if (room.state.winner != null) return
    const res = autoMove(room.state, room.state.turn)
    if (res.ok) room.events.push(...res.events)
    afterAction(room)
  }, wait)
  room.timer.unref?.()
}

function afterAction(room: LiveRoom) {
  if (room.state.winner != null) {
    settle(room)
  } else {
    arm(room)
  }
  pushState(room)
}

type Action = { t: 'play'; cardId: number; shape?: Shape } | { t: 'pick' } | { t: 'call' }

export function applyAction(room: LiveRoom, seat: number, action: Action): { ok: true } | { ok: false; error: string } {
  if (room.state.out?.[seat]) return { ok: false, error: 'You are out.' }
  const res =
    action.t === 'play'
      ? play(room.state, seat, action.cardId, action.shape)
      : action.t === 'pick'
        ? pick(room.state, seat)
        : callLastCard(room.state, seat)
  if (!res.ok) return res
  room.events.push(...res.events)
  afterAction(room)
  return { ok: true }
}

function seatLeft(room: LiveRoom, seat: number) {
  room.away.add(seat)
  const characterId = room.characterBySeat.get(seat)
  if (characterId) void recordWhotForfeit(room.tableId, characterId)
  room.events.push(...forfeit(room.state, seat))
  afterAction(room)
}

export function joinWhot(socket: WebSocket, token: string | undefined) {
  const ticket = token ? tickets.get(token) : undefined
  if (!ticket || ticket.expires < Date.now()) {
    send(socket, { t: 'error', error: 'Ticket expired.' })
    socket.close(4001, 'bad ticket')
    return
  }
  tickets.delete(token!)
  const room = rooms.get(ticket.tableId)
  const seat = seatMap.get(ticket.tableId)?.get(ticket.seat)
  if (!room || seat == null) {
    send(socket, { t: 'error', error: 'Table not live.' })
    socket.close(4002, 'no room')
    return
  }
  const old = room.sockets.get(seat)
  if (old && old !== socket) old.close(4003, 'replaced')
  room.sockets.set(seat, socket)
  room.away.delete(seat)
  pushState(room)

  socket.on('message', (data) => {
    let msg: { t?: string; cardId?: number; shape?: Shape }
    try {
      msg = JSON.parse(String(data)) as typeof msg
    } catch {
      return
    }
    let action: Action | null = null
    if (msg.t === 'play' && typeof msg.cardId === 'number') action = { t: 'play', cardId: msg.cardId, shape: msg.shape }
    else if (msg.t === 'pick') action = { t: 'pick' }
    else if (msg.t === 'call') action = { t: 'call' }
    if (!action) return
    const out = applyAction(room, seat, action)
    if (!out.ok) send(socket, { t: 'error', error: out.error })
  })

  socket.on('close', () => {
    if (room.sockets.get(seat) !== socket) return
    room.sockets.delete(seat)
    if (room.state.winner != null) return
    seatLeft(room, seat)
  })
}
