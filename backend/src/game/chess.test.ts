import { describe, expect, it } from 'vitest'
import {
  CHESS_CLOCK_MS,
  CHESS_READY_MS,
  checkClock,
  declineDraw,
  offerDraw,
  markJoined,
  newChessState,
  playMove,
  positionOf,
  resign,
  snapshotOf,
  type ChessState,
} from './chess-rules.js'

const T0 = 1_000_000
function started(): ChessState {
  const s = newChessState(T0)
  markJoined(s, 0, T0)
  markJoined(s, 1, T0)
  return s
}
const mv = (s: ChessState, seat: 0 | 1, from: string, to: string, at: number, promotion?: string) =>
  playMove(s, seat, { from, to, promotion }, at)

describe('chess referee', () => {
  it('starts the clock only when both players are here, and rejects moves before that', () => {
    const s = newChessState(T0)
    markJoined(s, 0, T0)
    expect(s.since).toBeNull()
    expect(mv(s, 0, 'e2', 'e4', T0 + 1)).toMatchObject({ ok: false })
    markJoined(s, 1, T0 + 5)
    expect(s.since).toBe(T0 + 5)
    expect(mv(s, 0, 'e2', 'e4', T0 + 10)).toMatchObject({ ok: true, san: 'e4' })
  })

  it('rejects illegal moves and moves out of turn', () => {
    const s = started()
    expect(mv(s, 1, 'e7', 'e5', T0 + 1)).toMatchObject({ ok: false, error: 'Not your turn.' })
    expect(mv(s, 0, 'e2', 'e5', T0 + 1)).toMatchObject({ ok: false, error: 'That move is not legal.' })
    expect(mv(s, 0, 'e7', 'e5', T0 + 1)).toMatchObject({ ok: false }) // not your piece
    expect(mv(s, 0, 'zz', '99', T0 + 1)).toMatchObject({ ok: false })
    expect(s.moves).toHaveLength(0)
  })

  it('decides checkmate on the server (fool’s mate: black wins)', () => {
    const s = started()
    mv(s, 0, 'f2', 'f3', T0 + 1)
    mv(s, 1, 'e7', 'e5', T0 + 2)
    mv(s, 0, 'g2', 'g4', T0 + 3)
    const last = mv(s, 1, 'd8', 'h4', T0 + 4)
    expect(last).toMatchObject({ ok: true, over: { winner: 1, reason: 'checkmate' } })
    expect(s.over).toEqual({ winner: 1, reason: 'checkmate' })
    expect(mv(s, 0, 'a2', 'a3', T0 + 5)).toMatchObject({ ok: false })
  })

  it('needs a promotion piece and applies it', () => {
    const s = started()
    // Walk a white pawn up the h-file: h4 g5 hxg5 ... simpler: replay a known short promotion line
    const line: [0 | 1, string, string][] = [
      [0, 'h2', 'h4'], [1, 'g7', 'g5'], [0, 'h4', 'g5'], [1, 'h7', 'h6'], [0, 'g5', 'h6'], [1, 'f7', 'f6'],
      [0, 'h6', 'h7'], [1, 'f6', 'f5'],
    ]
    let t = T0
    for (const [seat, a, b] of line) expect(mv(s, seat, a, b, (t += 1))).toMatchObject({ ok: true })
    expect(mv(s, 0, 'h7', 'g8', (t += 1))).toMatchObject({ ok: false }) // promotion missing
    expect(mv(s, 0, 'h7', 'g8', (t += 1), 'q')).toMatchObject({ ok: true })
    expect(positionOf(s).get('g8')).toMatchObject({ type: 'q', color: 'w' })
  })

  it('ends on stalemate as a draw', () => {
    const s = started()
    // Fast stalemate (10 moves)
    const line: [0 | 1, string, string][] = [
      [0, 'e2', 'e3'], [1, 'a7', 'a5'], [0, 'd1', 'h5'], [1, 'a8', 'a6'], [0, 'h5', 'a5'], [1, 'h7', 'h5'],
      [0, 'h2', 'h4'], [1, 'a6', 'h6'], [0, 'a5', 'c7'], [1, 'f7', 'f6'], [0, 'c7', 'd7'], [1, 'e8', 'f7'],
      [0, 'd7', 'b7'], [1, 'd8', 'd3'], [0, 'b7', 'b8'], [1, 'd3', 'h7'], [0, 'b8', 'c8'], [1, 'f7', 'g6'],
    ]
    let t = T0
    for (const [seat, a, b] of line) expect(mv(s, seat, a, b, (t += 1))).toMatchObject({ ok: true })
    expect(mv(s, 0, 'c8', 'e6', (t += 1))).toMatchObject({ ok: true, over: { winner: null, reason: 'stalemate' } })
  })

  it('charges the mover’s clock and lets the other clock stand', () => {
    const s = started()
    mv(s, 0, 'e2', 'e4', T0 + 30_000)
    expect(s.clocks).toEqual([CHESS_CLOCK_MS - 30_000, CHESS_CLOCK_MS])
    mv(s, 1, 'e7', 'e5', T0 + 30_000 + 12_000)
    expect(s.clocks).toEqual([CHESS_CLOCK_MS - 30_000, CHESS_CLOCK_MS - 12_000])
    expect(snapshotOf(s, T0 + 30_000 + 15_000).clocks[0]).toBe(CHESS_CLOCK_MS - 30_000 - 3_000)
  })

  it('a player who runs out of time loses; a late move is refused and loses', () => {
    const s = started()
    const late = T0 + CHESS_CLOCK_MS + 1
    expect(mv(s, 0, 'e2', 'e4', late)).toMatchObject({ ok: false })
    expect(s.over).toEqual({ winner: 1, reason: 'timeout' })
    expect(checkClock(started(), T0 + CHESS_CLOCK_MS - 1)).toBeNull()
  })

  it('resigning hands the win to the other seat', () => {
    const s = started()
    mv(s, 0, 'e2', 'e4', T0 + 1)
    expect(resign(s, 1)).toEqual({ winner: 0, reason: 'resign' })
    expect(resign(s, 0)).toEqual({ winner: 0, reason: 'resign' }) // already over: unchanged
  })

  it('when nobody sits down in time: the one who came wins, or nobody if neither did', () => {
    const one = newChessState(T0)
    markJoined(one, 1, T0 + 1)
    expect(checkClock(one, T0 + CHESS_READY_MS - 1)).toBeNull()
    expect(checkClock(one, T0 + CHESS_READY_MS + 1)).toEqual({ winner: 1, reason: 'abandoned' })
    expect(checkClock(newChessState(T0), T0 + CHESS_READY_MS + 1)).toEqual({ winner: null, reason: 'abandoned' })
  })

  it('a draw offer needs the other side to accept; a move or a decline cancels it', () => {
    const s = started()
    expect(offerDraw(s, 0)).toBeNull()
    expect(s.drawOffer).toBe(0)
    mv(s, 0, 'e2', 'e4', T0 + 1)
    expect(s.drawOffer).toBeNull()
    offerDraw(s, 1)
    declineDraw(s, 0)
    expect(s.drawOffer).toBeNull()
    offerDraw(s, 1)
    expect(offerDraw(s, 0)).toEqual({ winner: null, reason: 'agreed' })
    expect(s.over).toEqual({ winner: null, reason: 'agreed' })
  })

  it('draws by threefold repetition', () => {
    const s = started()
    let t = T0
    const shuffle: [0 | 1, string, string][] = [
      [0, 'g1', 'f3'], [1, 'g8', 'f6'], [0, 'f3', 'g1'], [1, 'f6', 'g8'],
      [0, 'g1', 'f3'], [1, 'g8', 'f6'], [0, 'f3', 'g1'], [1, 'f6', 'g8'],
    ]
    let last
    for (const [seat, a, b] of shuffle) last = mv(s, seat, a, b, (t += 1))
    expect(last).toMatchObject({ ok: true, over: { winner: null, reason: 'draw' } })
  })
})

describe('chess special rules (through the referee)', () => {
  const play = (s: ChessState, line: [0 | 1, string, string][]) => {
    let t = T0
    for (const [seat, a, b] of line) expect(mv(s, seat, a, b, (t += 1))).toMatchObject({ ok: true })
    return t
  }

  it('castles king-side (rook jumps over)', () => {
    const s = started()
    play(s, [[0, 'e2', 'e4'], [1, 'e7', 'e5'], [0, 'g1', 'f3'], [1, 'b8', 'c6'], [0, 'f1', 'c4'], [1, 'g8', 'f6']])
    expect(mv(s, 0, 'e1', 'g1', T0 + 50)).toMatchObject({ ok: true })
    const p = positionOf(s)
    expect(p.get('g1')).toMatchObject({ type: 'k', color: 'w' })
    expect(p.get('f1')).toMatchObject({ type: 'r', color: 'w' })

  })

  it('refuses castling after the king has moved', () => {
    const s = started()
    play(s, [[0, 'e2', 'e4'], [1, 'e7', 'e5'], [0, 'g1', 'f3'], [1, 'b8', 'c6'], [0, 'f1', 'e2'], [1, 'g8', 'f6'], [0, 'e1', 'f1'], [1, 'f8', 'e7'], [0, 'f1', 'e1'], [1, 'e8', 'g8']])
    expect(mv(s, 0, 'e1', 'g1', T0 + 90)).toMatchObject({ ok: false })
  })

  it('en passant is only available immediately, and removes the pawn', () => {
    const s = started()
    play(s, [[0, 'e2', 'e4'], [1, 'a7', 'a6'], [0, 'e4', 'e5'], [1, 'd7', 'd5']])
    expect(mv(s, 0, 'e5', 'd6', T0 + 20)).toMatchObject({ ok: true })
    const p = positionOf(s)
    expect(p.get('d5')).toBeFalsy()
    expect(p.get('d6')).toMatchObject({ type: 'p', color: 'w' })

    const late = started()
    play(late, [[0, 'e2', 'e4'], [1, 'a7', 'a6'], [0, 'e4', 'e5'], [1, 'd7', 'd5'], [0, 'h2', 'h3'], [1, 'h7', 'h6']])
    expect(mv(late, 0, 'e5', 'd6', T0 + 30)).toMatchObject({ ok: false })
  })

  it('must answer a check, and a pinned piece cannot move', () => {
    const s = started()
    play(s, [[0, 'e2', 'e4'], [1, 'e7', 'e5'], [0, 'd1', 'h5'], [1, 'b8', 'c6'], [0, 'h5', 'f7']])
    // white queen on f7 checks the king: a random pawn move is illegal, taking the queen is fine
    expect(mv(s, 1, 'a7', 'a6', T0 + 40)).toMatchObject({ ok: false })
    expect(mv(s, 1, 'e8', 'f7', T0 + 41)).toMatchObject({ ok: true })
  })
})
