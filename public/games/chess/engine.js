// Ekpoma Life chess engine: a small alpha-beta minimax over chess.js. Runs in a Worker so the
// phone never freezes while it thinks; game.js falls back to calling bestMove() directly.
import { Chess } from './chess.js'

const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 }
const MATE = 100000

function evaluate(game) {
  let score = 0
  const board = game.board()
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c]
      if (!p) continue
      // Centre squares are worth a little; pawns like to advance
      const centre = 3.5 - Math.max(Math.abs(c - 3.5), Math.abs(r - 3.5)) // 0..3
      let v = VALUE[p.type]
      if (p.type === 'n' || p.type === 'b') v += centre * 8
      else if (p.type === 'p') v += (p.color === 'w' ? 6 - r : r - 1) * 6 + centre * 3
      else if (p.type === 'q') v += centre * 2
      score += p.color === 'w' ? v : -v
    }
  }
  return score
}

function ordered(moves) {
  return moves
    .map((m) => ({ m, s: (m.captured ? 10 * VALUE[m.captured] - VALUE[m.piece] / 10 : 0) + (m.promotion ? 800 : 0) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.m)
}

export function bestMove(fen, level = 'medium') {
  const depth = level === 'easy' ? 1 : level === 'hard' ? 3 : 2
  const noise = level === 'easy' ? 120 : level === 'hard' ? 0 : 20
  const deadline = Date.now() + (level === 'hard' ? 3000 : 1500)
  const game = new Chess(fen)
  const sign = game.turn() === 'w' ? 1 : -1
  let timedOut = false

  function search(d, alpha, beta, color) {
    const moves = game.moves({ verbose: true })
    if (moves.length === 0) return game.isCheck() ? -(MATE + d) : 0
    if (d === 0 || Date.now() > deadline) {
      if (Date.now() > deadline) timedOut = true
      return color * evaluate(game)
    }
    let best = -Infinity
    for (const m of ordered(moves)) {
      game.move({ from: m.from, to: m.to, promotion: m.promotion })
      const score = -search(d - 1, -beta, -alpha, -color)
      game.undo()
      if (score > best) best = score
      if (best > alpha) alpha = best
      if (alpha >= beta) break
    }
    return best
  }

  const moves = ordered(game.moves({ verbose: true }))
  if (!moves.length) return null
  let pick = moves[0]
  let top = -Infinity
  for (const m of moves) {
    game.move({ from: m.from, to: m.to, promotion: m.promotion })
    const score = -search(depth - 1, -Infinity, Infinity, -sign) + (noise ? (Math.random() - 0.5) * 2 * noise : 0)
    game.undo()
    if (score > top) {
      top = score
      pick = m
    }
    if (timedOut && pick) break
  }
  return { from: pick.from, to: pick.to, promotion: pick.promotion }
}

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = (event) => {
    const { id, fen, level } = event.data
    self.postMessage({ id, move: bestMove(fen, level) })
  }
}
