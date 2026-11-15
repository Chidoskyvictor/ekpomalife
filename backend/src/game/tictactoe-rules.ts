/*
 * Tic tac toe rules, decided on the server for staked matches. Seat 0 (the host) is always X,
 * seat 1 is O. A drawn round is simply replayed (the other seat opens), so every match ends
 * with exactly one winner and the stake logic never needs a "draw" outcome.
 */

export type Mark = 'X' | 'O'
export type Cell = Mark | null

export type TttState = {
  board: Cell[]
  turn: Mark
  /** Who opens this round; swaps after every drawn round. */
  starter: Mark
  round: number
  draws: number
  moves: number[]
  /** Every cell played across all rounds, in order (what gets stored). */
  history: number[]
  /** Winning seat (0 = X, 1 = O), set once and final. */
  winnerSeat: 0 | 1 | null
  line: number[]
}

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]

/** Rebuild a match from its stored cells; stops at the first one that doesn't fit. */
export function replayTtt(history: unknown): TttState {
  const state = newTtt()
  if (!Array.isArray(history)) return state
  for (const cell of history) if (!applyMove(state, state.turn === 'X' ? 0 : 1, cell).ok) break
  return state
}

export const markOfSeat = (seat: number): Mark => (seat === 0 ? 'X' : 'O')

export function newTtt(): TttState {
  return { board: Array<Cell>(9).fill(null), turn: 'X', starter: 'X', round: 1, draws: 0, moves: [], history: [], winnerSeat: null, line: [] }
}

export function lineWinner(board: Cell[]): { mark: Mark; line: number[] } | null {
  for (const line of LINES) {
    const [a, b, c] = line as [number, number, number]
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { mark: board[a]!, line }
  }
  return null
}

/** Play `cell` for `seat`. Mutates and returns the state, or an error that leaves it untouched. */
export function applyMove(state: TttState, seat: number, cell: unknown): { ok: true; state: TttState } | { ok: false; error: string } {
  if (seat !== 0 && seat !== 1) return { ok: false, error: 'Not a player.' }
  if (state.winnerSeat !== null) return { ok: false, error: 'The match is over.' }
  if (typeof cell !== 'number' || !Number.isInteger(cell) || cell < 0 || cell > 8) return { ok: false, error: 'No such square.' }
  if (state.turn !== markOfSeat(seat)) return { ok: false, error: 'Not your turn.' }
  if (state.board[cell]) return { ok: false, error: 'That square is taken.' }
  state.board[cell] = state.turn
  state.moves.push(cell)
  state.history.push(cell)
  const won = lineWinner(state.board)
  if (won) {
    state.winnerSeat = won.mark === 'X' ? 0 : 1
    state.line = won.line
  } else if (state.board.every(Boolean)) {
    // Drawn: replay the round, the other side opens
    state.draws += 1
    state.round += 1
    state.board = Array<Cell>(9).fill(null)
    state.moves = []
    state.starter = state.starter === 'X' ? 'O' : 'X'
    state.turn = state.starter
  } else {
    state.turn = state.turn === 'X' ? 'O' : 'X'
  }
  return { ok: true, state }
}
