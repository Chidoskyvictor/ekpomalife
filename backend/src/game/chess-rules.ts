import { Chess, type Color } from 'chess.js'

/*
 * Chess referee for online matches (pure: no database, no sockets). Seat 0 (the host) plays
 * white, seat 1 black. The server replays the move list with chess.js on every move, so a
 * phone can't make an illegal move, move out of turn, stop its clock or claim a win.
 */

export const CHESS_CLOCK_MS = 10 * 60_000
/** How long both players have to sit down before the one who showed up can take the win. */
export const CHESS_READY_MS = 3 * 60_000

export type ChessMove = { from: string; to: string; promotion?: string }
export type ChessReason = 'checkmate' | 'resign' | 'timeout' | 'stalemate' | 'draw' | 'abandoned'
export type ChessOutcome = { winner: 0 | 1 | null; reason: ChessReason }

export type ChessState = {
  moves: ChessMove[]
  /** Time left for [white, black] as of `since` (or as of now when the clock is stopped). */
  clocks: [number, number]
  /** Epoch ms when the side to move started thinking; null until both players have arrived. */
  since: number | null
  createdAt: number
  joined: [boolean, boolean]
  over: ChessOutcome | null
}

export function newChessState(now: number): ChessState {
  return { moves: [], clocks: [CHESS_CLOCK_MS, CHESS_CLOCK_MS], since: null, createdAt: now, joined: [false, false], over: null }
}

export const colorOfSeat = (seat: number): Color => (seat === 0 ? 'w' : 'b')
const seatOfColor = (c: Color): 0 | 1 => (c === 'w' ? 0 : 1)

export function positionOf(state: ChessState) {
  const game = new Chess()
  for (const m of state.moves) game.move({ from: m.from, to: m.to, promotion: m.promotion })
  return game
}

/** Seat whose turn it is. */
export const seatToMove = (state: ChessState): 0 | 1 => (state.moves.length % 2 === 0 ? 0 : 1)

/** Time the player to move still has right now. */
export function remainingMs(state: ChessState, now: number) {
  const seat = seatToMove(state)
  const spent = state.since == null || state.over ? 0 : Math.max(0, now - state.since)
  return Math.max(0, state.clocks[seat] - spent)
}

/** Both clocks as they stand at `now`. */
export function clocksAt(state: ChessState, now: number): [number, number] {
  const out: [number, number] = [state.clocks[0], state.clocks[1]]
  out[seatToMove(state)] = remainingMs(state, now)
  return out
}

/** Can this side still checkmate with what it has left? (King alone, or with one minor piece, cannot.) */
function canMate(game: Chess, color: Color) {
  const pieces = game.board().flat().filter((p) => p && p.color === color && p.type !== 'k')
  if (pieces.length === 0) return false
  if (pieces.length === 1 && (pieces[0]!.type === 'n' || pieces[0]!.type === 'b')) return false
  return true
}

/** Somebody ran out of time, or never came: who wins (or a draw if the other side can't mate)? */
function loseOnTime(state: ChessState, loserSeat: 0 | 1): ChessOutcome {
  const winner = (1 - loserSeat) as 0 | 1
  if (!canMate(positionOf(state), colorOfSeat(winner))) return { winner: null, reason: 'draw' }
  return { winner, reason: 'timeout' }
}

/** A player joined the live match. Starts the clock once both have been seen. */
export function markJoined(state: ChessState, seat: 0 | 1, now: number) {
  state.joined[seat] = true
  if (state.joined[0] && state.joined[1] && state.since == null && !state.over) state.since = now
}

/** When the server should next look at this match (epoch ms), or null if it's over. */
export function nextDeadline(state: ChessState): number | null {
  if (state.over) return null
  if (state.since == null) return state.createdAt + CHESS_READY_MS
  return state.since + state.clocks[seatToMove(state)]
}

/** Apply a time check: settles the match if a clock ran out or nobody/one player never showed. */
export function checkClock(state: ChessState, now: number): ChessOutcome | null {
  if (state.over) return state.over
  if (state.since == null) {
    if (now < state.createdAt + CHESS_READY_MS) return null
    const [a, b] = state.joined
    state.over = a === b ? { winner: null, reason: 'abandoned' } : { winner: a ? 0 : 1, reason: 'abandoned' }
    return state.over
  }
  if (remainingMs(state, now) > 0) return null
  state.clocks[seatToMove(state)] = 0
  state.over = loseOnTime(state, seatToMove(state))
  return state.over
}

export type MoveResult =
  | { ok: true; san: string; over: ChessOutcome | null }
  | { ok: false; error: string }

/** A player's move. Mutates `state` only when it is legal, in turn and on time. */
export function playMove(state: ChessState, seat: 0 | 1, move: ChessMove, now: number): MoveResult {
  if (checkClock(state, now) && state.over) return { ok: false, error: 'The game is over.' }
  if (state.since == null) return { ok: false, error: 'Waiting for your opponent to sit down.' }
  if (seat !== seatToMove(state)) return { ok: false, error: 'Not your turn.' }
  const game = positionOf(state)
  let made
  try {
    made = game.move({ from: String(move.from), to: String(move.to), promotion: move.promotion ? String(move.promotion) : undefined })
  } catch {
    return { ok: false, error: 'That move is not legal.' }
  }
  state.clocks[seat] = Math.max(1, remainingMs(state, now))
  state.moves.push({ from: made.from, to: made.to, ...(made.promotion ? { promotion: made.promotion } : {}) })
  state.since = now
  if (game.isCheckmate()) state.over = { winner: seat, reason: 'checkmate' }
  else if (game.isStalemate()) state.over = { winner: null, reason: 'stalemate' }
  else if (game.isDraw()) state.over = { winner: null, reason: 'draw' }
  return { ok: true, san: made.san, over: state.over }
}

/** A player gives up. */
export function resign(state: ChessState, seat: 0 | 1): ChessOutcome | null {
  if (state.over) return state.over
  state.clocks = clocksAt(state, Date.now())
  state.over = { winner: (1 - seat) as 0 | 1, reason: 'resign' }
  return state.over
}

/** What a phone needs to draw the board. */
export function snapshotOf(state: ChessState, now: number) {
  const game = positionOf(state)
  const last = state.moves.length ? state.moves[state.moves.length - 1]! : null
  return {
    fen: game.fen(),
    moves: state.moves,
    turn: seatToMove(state),
    clocks: clocksAt(state, now),
    started: state.since != null || state.moves.length > 0,
    check: game.isCheck(),
    last,
    over: state.over,
  }
}

export { seatOfColor }
