import { describe, expect, it } from 'vitest'
import {
  advancePastEliminated,
  createWhotGame,
  seatIndexFromPlayerId,
  tryPick,
  tryPlay,
} from './whot-engine.js'

describe('whot-engine', () => {
  it('rejects play when not your turn', () => {
    const game = createWhotGame(2)
    const active = game.turn.next()
    const seat = seatIndexFromPlayerId(active!.id)
    const other = seat === 0 ? 1 : 0
    const res = tryPlay(game, other, 0)
    expect(res.ok).toBe(false)
  })

  it('advances turn after pick when no pick penalty', () => {
    const game = createWhotGame(2)
    const seat = seatIndexFromPlayerId(game.turn.next()!.id)
    const before = game.turn.next()?.id
    tryPick(game, seat)
    advancePastEliminated(game, new Set())
    const after = game.turn.next()?.id
    expect(after).not.toBe(before)
  })

  it('validates illegal card play', () => {
    const game = createWhotGame(2)
    const seat = seatIndexFromPlayerId(game.turn.next()!.id)
    const player = game.players[seat]!
    const bad = player.hand().findIndex((c) => !c.matches(game.pile.top()) && c.shape !== 'Whot')
    if (bad < 0) return
    const res = tryPlay(game, seat, bad)
    expect(res.ok).toBe(false)
  })

  it('rotates among three players', () => {
    const game = createWhotGame(3)
    const seen = new Set<number>()
    for (let i = 0; i < 3; i++) {
      const p = game.turn.next()
      seen.add(p!.id)
      tryPick(game, seatIndexFromPlayerId(p!.id))
      advancePastEliminated(game, new Set())
    }
    expect(seen.size).toBe(3)
  })
})
