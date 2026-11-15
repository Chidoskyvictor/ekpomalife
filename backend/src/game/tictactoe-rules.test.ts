import { describe, expect, it } from 'vitest'
import { applyMove, newTtt, replayTtt } from './tictactoe-rules.js'

function play(moves: [number, number][]) {
  const s = newTtt()
  for (const [seat, cell] of moves) {
    const r = applyMove(s, seat, cell)
    if (!r.ok) throw new Error(r.error)
  }
  return s
}

describe('tic tac toe rules', () => {
  it('X (seat 0) opens and turns alternate', () => {
    const s = newTtt()
    expect(applyMove(s, 1, 4)).toMatchObject({ ok: false, error: 'Not your turn.' })
    expect(applyMove(s, 0, 4).ok).toBe(true)
    expect(applyMove(s, 0, 0)).toMatchObject({ ok: false })
    expect(applyMove(s, 1, 0).ok).toBe(true)
  })

  it('rejects taken squares, bad squares and spectators', () => {
    const s = play([[0, 4]])
    expect(applyMove(s, 1, 4)).toMatchObject({ ok: false, error: 'That square is taken.' })
    expect(applyMove(s, 1, 9)).toMatchObject({ ok: false })
    expect(applyMove(s, 1, 1.5)).toMatchObject({ ok: false })
    expect(applyMove(s, 1, '1')).toMatchObject({ ok: false })
    expect(applyMove(s, 2, 1)).toMatchObject({ ok: false })
  })

  it('decides the winner by the board, and locks the match', () => {
    const s = play([[0, 0], [1, 3], [0, 1], [1, 4], [0, 2]])
    expect(s.winnerSeat).toBe(0)
    expect(s.line).toEqual([0, 1, 2])
    expect(applyMove(s, 1, 5)).toMatchObject({ ok: false, error: 'The match is over.' })
  })

  it('O can win', () => {
    const s = play([[0, 0], [1, 2], [0, 1], [1, 4], [0, 8], [1, 6]])
    expect(s.winnerSeat).toBe(1)
  })

  it('a draw replays the round with the other seat opening', () => {
    // X O X / X O O / O X X
    const s = play([[0, 0], [1, 1], [0, 2], [1, 4], [0, 3], [1, 5], [0, 7], [1, 6], [0, 8]])
    expect(s.winnerSeat).toBeNull()
    expect(s.draws).toBe(1)
    expect(s.round).toBe(2)
    expect(s.board.every((c) => c === null)).toBe(true)
    expect(s.turn).toBe('O')
    expect(applyMove(s, 0, 4)).toMatchObject({ ok: false, error: 'Not your turn.' })
    expect(applyMove(s, 1, 4).ok).toBe(true)
  })

  it('replays a stored history, across a drawn round, to the same state', () => {
    const s = play([[0, 0], [1, 1], [0, 2], [1, 4], [0, 3], [1, 5], [0, 7], [1, 6], [0, 8], [1, 4], [0, 0]])
    const r = replayTtt(s.history)
    expect(r).toEqual(s)
    expect(replayTtt('junk')).toEqual(newTtt())
    expect(replayTtt([4, 4, 9]).history).toEqual([4])
  })
})
