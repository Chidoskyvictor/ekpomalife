import { randomBytes } from 'node:crypto'
import type { WebSocket } from 'ws'
import type { WhotGame } from './whot-engine.js'
import type { CardShape } from 'whot/dist/shapes.js'
import {
  advancePastEliminated,
  activeSeatCount,
  botShapeChoice,
  buildPublicState,
  checkWinner,
  createWhotGame,
  handForSeat,
  pickCompatibleIndex,
  seatIndexFromPlayerId,
  tryPick,
  tryPlay,
  type WhotAlert,
} from './whot-engine.js'
import { finishWhotTable, recordWhotForfeit } from './whot-tables.js'

const TURN_MS = 30_000

type SeatInfo = { characterId: string; seat: number; name: string }

type LiveRoom = {
  tableId: string
  game: WhotGame
  names: string[]
  characterBySeat: Map<number, string>
  eliminated: Set<number>
  alerts: WhotAlert[]
  pot: number
  winnerSeat: number | null
  turnDeadline: number
  timer: ReturnType<typeof setTimeout> | null
  sockets: Map<number, WebSocket>
}

const rooms = new Map<string, LiveRoom>()
const tickets = new Map<string, { tableId: string; characterId: string; seat: number; expires: number }>()

export function createWhotTicket(tableId: string, characterId: string, seat: number) {
  const token = randomBytes(24).toString('base64url')
  tickets.set(token, { tableId, characterId, seat, expires: Date.now() + 60_000 })
  return token
}

export function startLiveTable(tableId: string, seats: SeatInfo[], pot: number) {
  const names = seats.sort((a, b) => a.seat - b.seat).map((s) => s.name)
  const game = createWhotGame(names.length)
  const characterBySeat = new Map<number, string>()
  for (const s of seats) characterBySeat.set(s.seat, s.characterId)
  const room: LiveRoom = {
    tableId,
    game,
    names,
    characterBySeat,
    eliminated: new Set(),
    alerts: [],
    pot,
    winnerSeat: null,
    turnDeadline: Date.now() + TURN_MS,
    timer: null,
    sockets: new Map(),
  }
  rooms.set(tableId, room)
  scheduleTurn(room)
}

export function getLiveTable(tableId: string) {
  return rooms.get(tableId) ?? null
}

export function finishLiveTable(tableId: string) {
  const room = rooms.get(tableId)
  if (room?.timer) clearTimeout(room.timer)
  rooms.delete(tableId)
}

function send(socket: WebSocket | null, msg: unknown) {
  if (socket && socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg))
}

function pushState(room: LiveRoom) {
  for (const [seat, socket] of room.sockets) {
    const publicState = buildPublicState(room.game, room.names, room.eliminated, room.alerts, room.winnerSeat)
    send(socket, {
      t: 'state',
      state: {
        ...publicState,
        pot: room.pot,
        turnSecondsLeft: Math.max(0, Math.ceil((room.turnDeadline - Date.now()) / 1000)),
        hand: handForSeat(room.game, seat),
        mySeat: seat,
      },
    })
  }
  room.alerts = []
}

function endGame(room: LiveRoom, winnerSeat: number) {
  room.winnerSeat = winnerSeat
  const winnerId = room.characterBySeat.get(winnerSeat)
  if (winnerId) void finishWhotTable(room.tableId, winnerId)
  pushState(room)
  if (room.timer) clearTimeout(room.timer)
}

function eliminateSeat(room: LiveRoom, seat: number) {
  room.eliminated.add(seat)
  const characterId = room.characterBySeat.get(seat)
  if (characterId) void recordWhotForfeit(room.tableId, characterId)
  advancePastEliminated(room.game, room.eliminated)
  const winner = checkWinner(room.game, room.eliminated)
  if (winner != null) {
    endGame(room, winner)
    return true
  }
  if (activeSeatCount(room.game, room.eliminated) <= 1) {
    const alive = [...room.characterBySeat.keys()].find((s) => !room.eliminated.has(s))
    if (alive != null) endGame(room, alive)
    return true
  }
  return false
}

function runBotTurn(room: LiveRoom, seat: number) {
  const player = room.game.players[seat]
  if (!player?.turn) return
  if (player.toPick > 0 || !player.canPlay()) {
    tryPick(room.game, seat)
  } else {
    const idx = pickCompatibleIndex(room.game, seat)
    if (idx >= 0) {
      const hand = player.hand()
      const shape = hand[idx]?.shape === 'Whot' ? botShapeChoice() : undefined
      const res = tryPlay(room.game, seat, idx, shape)
      if (res.ok) {
        if (res.lastCard) room.alerts.push({ kind: 'last-card', seat })
        if (res.checkup) room.alerts.push({ kind: 'checkup', seat })
      }
    } else {
      tryPick(room.game, seat)
    }
  }
  advancePastEliminated(room.game, room.eliminated)
  const winner = checkWinner(room.game, room.eliminated)
  if (winner != null) endGame(room, winner)
}

function onTurnTimeout(room: LiveRoom) {
  const current = room.game.turn.next()
  if (!current || room.winnerSeat != null) return
  const seat = seatIndexFromPlayerId(current.id)
  if (room.eliminated.has(seat)) return
  if (current.toPick > 0 || !current.canPlay()) tryPick(room.game, seat)
  else tryPick(room.game, seat)
  advancePastEliminated(room.game, room.eliminated)
  const winner = checkWinner(room.game, room.eliminated)
  if (winner != null) endGame(room, winner)
  else {
    room.turnDeadline = Date.now() + TURN_MS
    scheduleTurn(room)
    pushState(room)
  }
}

function scheduleTurn(room: LiveRoom) {
  if (room.timer) clearTimeout(room.timer)
  room.timer = setTimeout(() => onTurnTimeout(room), TURN_MS)
  room.turnDeadline = Date.now() + TURN_MS
}

function applyMove(room: LiveRoom, seat: number, action: { type: 'play'; cardIndex: number; shape?: CardShape } | { type: 'pick' }) {
  if (room.winnerSeat != null) return { ok: false, error: 'Game over.' }
  if (room.eliminated.has(seat)) return { ok: false, error: 'You are out.' }
  let res
  if (action.type === 'pick') {
    res = tryPick(room.game, seat)
  } else {
    res = tryPlay(room.game, seat, action.cardIndex, action.shape)
    if (res.ok) {
      if (res.lastCard) room.alerts.push({ kind: 'last-card', seat })
      if (res.checkup) room.alerts.push({ kind: 'checkup', seat })
    }
  }
  if (!res.ok) return res
  advancePastEliminated(room.game, room.eliminated)
  const winner = checkWinner(room.game, room.eliminated)
  if (winner != null) {
    endGame(room, winner)
    return { ok: true as const }
  }
  scheduleTurn(room)
  pushState(room)
  return { ok: true as const }
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
  if (!room) {
    send(socket, { t: 'error', error: 'Table not live.' })
    socket.close(4002, 'no room')
    return
  }
  const old = room.sockets.get(ticket.seat)
  if (old && old !== socket) old.close(4003, 'replaced')
  room.sockets.set(ticket.seat, socket)
  pushState(room)

  socket.on('message', (data) => {
    let msg: { t?: string; cardIndex?: number; shape?: CardShape }
    try {
      msg = JSON.parse(String(data)) as { t?: string; cardIndex?: number; shape?: CardShape }
    } catch {
      return
    }
    if (msg.t === 'play' && typeof msg.cardIndex === 'number') {
      const out = applyMove(room, ticket.seat, { type: 'play', cardIndex: msg.cardIndex, shape: msg.shape })
      if (!out.ok) send(socket, { t: 'error', error: out.error })
    } else if (msg.t === 'pick') {
      const out = applyMove(room, ticket.seat, { type: 'pick' })
      if (!out.ok) send(socket, { t: 'error', error: out.error })
    }
  })

  socket.on('close', () => {
    if (room.sockets.get(ticket.seat) !== socket) return
    room.sockets.delete(ticket.seat)
    if (room.winnerSeat != null) return
    if (!eliminateSeat(room, ticket.seat)) {
      scheduleTurn(room)
      pushState(room)
    }
  })
}
