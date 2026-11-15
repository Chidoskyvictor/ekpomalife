import { randomBytes } from 'node:crypto'
import type { WebSocket } from 'ws'
import { pool } from '../db.js'
import { applyMove, replayTtt, type TttState } from './tictactoe-rules.js'
import { CHESS_MESSAGES, chessJoin, chessMessage, type ChessEmit } from './chess-match.js'
import { settleServerResult } from './games.js'
import { act as ludoAct, dropLudoRoom, ludoRoom, ludoView, setLudoHooks } from './ludo-live.js'

/*
 * Live match relay for Phone → Games. Both phones in a match join one room; each shot,
 * the shooter's final table and turn timeouts are passed to the other phone. The server
 * also remembers when each player was last connected, so a player who leaves can lose
 * by forfeit (see reportResult in games.ts).
 */

type Seat = { socket: WebSocket | null; characterId: string; lastSeen: number }
/** Last settled table per match, so a phone that rejoins picks up where the frame is. */
const lastTable = new Map<string, unknown>()
type Ticket = { matchId: string; characterId: string; seat: number; expires: number; game?: string }

const tickets = new Map<string, Ticket>()
const rooms = new Map<string, Map<number, Seat>>()
/** When the first player sat down; an opponent who never shows up is "away" from then. */
const openedAt = new Map<string, number>()
/** Server-side boards for staked games where the phones' word isn't enough (tic tac toe). */
const tttMatches = new Map<string, TttState>()

/** Winning seat of a server-judged match: 0 / 1, or null while undecided (or unknown). */
export function tttWinnerSeat(matchId: string) {
  return tttMatches.get(matchId)?.winnerSeat ?? null
}

/** Set by games.ts: pays out a decided match without waiting for either phone to report. */
let tttSettler: ((matchId: string) => Promise<unknown>) | null = null
export const onTttDecided = (fn: (matchId: string) => Promise<unknown>) => void (tttSettler = fn)

export const forgetTtt = (matchId: string) => void tttMatches.delete(matchId)

const tttView = (s: TttState) => ({ board: s.board, turn: s.turn, round: s.round, draws: s.draws, winnerSeat: s.winnerSeat, line: s.line, last: s.moves.at(-1) ?? null })

/** Messages a phone may send on to the other one. */
const RELAYED = new Set(['shot', 'settled', 'timeout', 'emote'])
/** Ludo is run by the server: phones ask to roll / move and the server answers both (ludo-live.ts). */
const LUDO_ACTIONS = new Set(['roll', 'move'])

setLudoHooks({
  broadcast: (matchId, msg) => {
    for (const seat of rooms.get(matchId)?.values() ?? []) send(seat.socket, msg)
  },
  finish: (matchId, winnerSeat) => {
    void settleServerResult(matchId, winnerSeat).catch((error) => console.error('ludo settle failed', error))
  },
})

export function createGameTicket(matchId: string, characterId: string, seat: number, game?: string) {
  const token = randomBytes(24).toString('base64url')
  const now = Date.now()
  for (const [key, t] of tickets) if (t.expires < now) tickets.delete(key)
  tickets.set(token, { matchId, characterId, seat, expires: now + 60_000, game })
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

/** Persist the move list (in order per match) so a restart can rebuild the board. */
const saving = new Map<string, Promise<unknown>>()
function saveTtt(matchId: string, state: TttState) {
  const history = JSON.stringify(state.history)
  const next = (saving.get(matchId) ?? Promise.resolve())
    .catch(() => {})
    .then(() => pool.query(`UPDATE game_matches SET ttt_moves = $2::jsonb WHERE id = $1`, [matchId, history]))
  saving.set(matchId, next)
  return next
}

async function loadTtt(matchId: string) {
  if (tttMatches.has(matchId)) return
  const found = await pool.query<{ ttt_moves: unknown }>(`SELECT ttt_moves FROM game_matches WHERE id = $1`, [matchId])
  if (!tttMatches.has(matchId)) tttMatches.set(matchId, replayTtt(found.rows[0]?.ttt_moves))
}

export async function joinGame(socket: WebSocket, token: string | undefined) {
  const ticket = token ? tickets.get(token) : undefined
  if (!ticket || ticket.expires < Date.now()) {
    send(socket, { t: 'error', error: 'Ticket expired. Reconnecting…' })
    socket.close(4001, 'bad ticket')
    return
  }
  tickets.delete(token!)
  if (ticket.game === 'tictactoe') {
    try {
      await loadTtt(ticket.matchId)
    } catch {
      send(socket, { t: 'error', error: 'Couldn’t load the board. Reconnecting…' })
      socket.close(4003, 'load failed')
      return
    }
  }
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
  if (ticket.game === 'tictactoe') {
    send(socket, { t: 'ttt', ...tttView(tttMatches.get(ticket.matchId)!) })
  }
  if (ticket.game === 'ludo') {
    ludoRoom(ticket.matchId)
    send(socket, ludoView(ticket.matchId))
  }
  if (lastTable.has(ticket.matchId)) send(socket, { t: 'settled', snap: lastTable.get(ticket.matchId) })
  send(other?.socket ?? null, { t: 'presence', online: true })
  // Chess is refereed by the server (chess-match.ts); other games just relay
  const emitChess: ChessEmit = (to, message) => {
    for (const n of to === 'both' ? [0, 1] : [to]) send(room!.get(n)?.socket ?? null, message)
  }
  if (ticket.game === 'chess') void chessJoin(ticket.matchId, ticket.seat as 0 | 1, emitChess).catch(() => {})

  socket.on('message', (data) => {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(String(data)) as Record<string, unknown>
    } catch {
      return
    }
    if (ticket.game === 'tictactoe' && msg.t === 'move') {
      // The server holds the board: validate the move, then tell both phones the result
      const state = tttMatches.get(ticket.matchId)
      if (!state) return
      seat.lastSeen = Date.now()
      const res = applyMove(state, ticket.seat, msg.cell)
      if (!res.ok) return send(socket, { t: 'ttt', ...tttView(state), error: res.error })
      const saved = saveTtt(ticket.matchId, state)
      const out = { t: 'ttt', ...tttView(state) }
      send(socket, out)
      send(room!.get(1 - ticket.seat)?.socket ?? null, out)
      if (state.winnerSeat !== null) void saved.then(() => tttSettler?.(ticket.matchId)).catch(() => {}) // phones' reports retry it
      return
    }
    if (ticket.game === 'chess' && typeof msg.t === 'string' && CHESS_MESSAGES.has(msg.t)) {
      seat.lastSeen = Date.now()
      void chessMessage(ticket.matchId, ticket.seat as 0 | 1, msg, emitChess).catch(() => {})
      return
    }
    if (ticket.game === 'ludo' && typeof msg.t === 'string' && LUDO_ACTIONS.has(msg.t)) {
      seat.lastSeen = Date.now()
      const out = ludoAct(ticket.matchId, ticket.seat, msg)
      if (!out.ok) send(socket, { t: 'error', error: out.error })
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
        // A decided board stays so a late report can still settle; open ones go with the room
        if (tttMatches.get(ticket.matchId)?.winnerSeat === null) tttMatches.delete(ticket.matchId)
        dropLudoRoom(ticket.matchId)
      }
    }, 15 * 60_000)
  })
}
