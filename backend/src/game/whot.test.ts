import { describe, expect, it } from 'vitest'
import {
  autoMove,
  buildDeck,
  forfeit,
  callLastCard,
  canPlay,
  newWhot,
  pick,
  play,
  specialOf,
  type Card,
  type WhotState,
} from './whot-rules.js'

let nid = 1000
const c = (shape: Card['shape'], num: number): Card => ({ id: nid++, shape, num })

/** A hand-built state: seat 0 on turn, top of pile given. */
function setup(over: Partial<WhotState> & { hands: Card[][]; top: Card }): WhotState {
  const { hands, top, ...rest } = over
  const market = Array.from({ length: 20 }, (_, i) => c(i % 2 ? 'star' : 'square', 7 + (i % 2)))
  return {
    rules: { stackPicks: true, lastCardCall: true },
    hands,
    market,
    pile: [top],
    turn: 0,
    pending: 0,
    pendingKind: null,
    called: null,
    again: false,
    owesCall: null,
    winner: null,
    ...rest,
  }
}

describe('whot deck', () => {
  it('is the real 54-card pack with the right count per shape', () => {
    const deck = buildDeck()
    expect(deck).toHaveLength(54)
    const count = (shape: string) => deck.filter((d) => d.shape === shape).length
    expect(count('circle')).toBe(12)
    expect(count('triangle')).toBe(12)
    expect(count('cross')).toBe(9)
    expect(count('square')).toBe(9)
    expect(count('star')).toBe(7)
    expect(count('whot')).toBe(5)
    expect(deck.filter((d) => d.shape === 'whot').every((d) => d.num === 20)).toBe(true)
    expect(new Set(deck.map((d) => d.id)).size).toBe(54)
  })

  it('maps the specials', () => {
    expect(specialOf(c('circle', 1))).toBe('hold-on')
    expect(specialOf(c('circle', 2))).toBe('pick-two')
    expect(specialOf(c('circle', 5))).toBe('pick-three')
    expect(specialOf(c('circle', 8))).toBe('suspension')
    expect(specialOf(c('circle', 14))).toBe('general-market')
    expect(specialOf(c('whot', 20))).toBe('whot')
    expect(specialOf(c('circle', 7))).toBeNull()
  })

  it('deals six each and starts on a plain card', () => {
    for (let i = 0; i < 40; i++) {
      const s = newWhot(2 + (i % 3))
      expect(s.hands.every((h) => h.length === 6)).toBe(true)
      expect(specialOf(s.pile[0]!)).toBeNull()
      const all = [...s.hands.flat(), ...s.market, ...s.pile]
      expect(new Set(all.map((x) => x.id)).size).toBe(54)
    }
    expect(() => newWhot(1)).toThrow()
    expect(() => newWhot(5)).toThrow()
  })
})

describe('whot play', () => {
  it('matches on shape or number and refuses otherwise', () => {
    const s = setup({ top: c('circle', 4), hands: [[c('circle', 10), c('cross', 4), c('square', 7)], [c('star', 1)]] })
    expect(play(s, 0, s.hands[0]![2]!.id).ok).toBe(false)
    expect(play(s, 0, s.hands[0]![1]!.id).ok).toBe(true) // same number
    expect(s.turn).toBe(1)
  })

  it('refuses out-of-turn and unknown cards', () => {
    const s = setup({ top: c('circle', 4), hands: [[c('circle', 3)], [c('circle', 5)]] })
    expect(play(s, 1, s.hands[1]![0]!.id).ok).toBe(false)
    expect(play(s, 0, 99999).ok).toBe(false)
  })

  it('1 Hold On: the same player plays again', () => {
    const s = setup({ top: c('circle', 4), hands: [[c('circle', 1), c('circle', 7), c('star', 3)], [c('star', 4)]] })
    expect(play(s, 0, s.hands[0]![0]!.id).ok).toBe(true)
    expect(s.turn).toBe(0)
    expect(s.again).toBe(true)
    expect(play(s, 0, s.hands[0]![0]!.id).ok).toBe(true)
    expect(s.turn).toBe(1)
  })

  it('8 Suspension skips the next player (and returns to you in a 2-player game)', () => {
    const s = setup({ top: c('circle', 4), hands: [[c('circle', 8), c('star', 2)], [c('star', 4)], [c('star', 5)]] })
    play(s, 0, s.hands[0]![0]!.id)
    expect(s.turn).toBe(2)
    const t = setup({ top: c('circle', 4), hands: [[c('circle', 8), c('star', 2)], [c('star', 4)]] })
    play(t, 0, t.hands[0]![0]!.id)
    expect(t.turn).toBe(0)
  })

  it('14 General Market: everyone else picks one and you play again', () => {
    const s = setup({ top: c('circle', 4), hands: [[c('circle', 14), c('star', 2)], [c('star', 4)], [c('star', 5)]] })
    play(s, 0, s.hands[0]![0]!.id)
    expect(s.hands[1]).toHaveLength(2)
    expect(s.hands[2]).toHaveLength(2)
    expect(s.hands[0]).toHaveLength(1)
    expect(s.turn).toBe(0)
  })

  it('2 Pick Two: next player must pick two, or stack a 2 for four', () => {
    const s = setup({ top: c('circle', 4), hands: [[c('circle', 2), c('star', 3)], [c('star', 7), c('cross', 9)], [c('star', 1)]] })
    play(s, 0, s.hands[0]![0]!.id)
    expect(s.pending).toBe(2)
    expect(play(s, 1, s.hands[1]![0]!.id).ok).toBe(false) // not a 2
    expect(pick(s, 1).ok).toBe(true)
    expect(s.hands[1]).toHaveLength(4)
    expect(s.pending).toBe(0)
    expect(s.turn).toBe(2)

    const t = setup({ top: c('circle', 4), hands: [[c('circle', 2), c('star', 3)], [c('star', 2), c('cross', 9)], [c('star', 1)]] })
    play(t, 0, t.hands[0]![0]!.id)
    expect(play(t, 1, t.hands[1]![0]!.id).ok).toBe(true)
    expect(t.pending).toBe(4)
    expect(t.turn).toBe(2)
    pick(t, 2)
    expect(t.hands[2]).toHaveLength(5)
  })

  it('5 Pick Three only stacks on a 5, not on a 2', () => {
    const s = setup({ top: c('circle', 4), hands: [[c('circle', 5), c('star', 3)], [c('star', 2), c('cross', 5)], [c('star', 1)]] })
    play(s, 0, s.hands[0]![0]!.id)
    expect(s.pending).toBe(3)
    expect(canPlay(s, 1, s.hands[1]![0]!)).toBe(false)
    expect(canPlay(s, 1, s.hands[1]![1]!)).toBe(true)
  })

  it('with stacking off the next player just picks', () => {
    const s = setup({
      rules: { stackPicks: false, lastCardCall: true },
      top: c('circle', 4),
      hands: [[c('circle', 2), c('star', 3)], [c('star', 2), c('cross', 9)]],
    })
    play(s, 0, s.hands[0]![0]!.id)
    expect(canPlay(s, 1, s.hands[1]![0]!)).toBe(false)
    pick(s, 1)
    expect(s.hands[1]).toHaveLength(4)
  })

  it('20 Whot plays on anything, needs a call, and forces that shape', () => {
    const s = setup({ top: c('circle', 4), hands: [[c('whot', 20), c('star', 3)], [c('cross', 9), c('triangle', 3), c('whot', 20)]] })
    expect(play(s, 0, s.hands[0]![0]!.id).ok).toBe(false) // no call
    expect(play(s, 0, s.hands[0]![0]!.id, 'cross').ok).toBe(true)
    expect(s.called).toBe('cross')
    expect(canPlay(s, 1, s.hands[1]![1]!)).toBe(false)
    expect(canPlay(s, 1, s.hands[1]![0]!)).toBe(true)
    expect(canPlay(s, 1, s.hands[1]![2]!)).toBe(true) // another Whot
    play(s, 1, s.hands[1]![0]!.id)
    expect(s.called).toBeNull()
  })

  it('going to market takes one card and passes the turn', () => {
    const s = setup({ top: c('circle', 4), hands: [[c('star', 3)], [c('star', 4)]] })
    pick(s, 0)
    expect(s.hands[0]).toHaveLength(2)
    expect(s.turn).toBe(1)
    expect(pick(s, 0).ok).toBe(false)
  })

  it('wins on emptying the hand', () => {
    const s = setup({ top: c('circle', 4), hands: [[c('circle', 3)], [c('star', 4), c('star', 5)]] })
    play(s, 0, s.hands[0]![0]!.id)
    expect(s.winner).toBe(0)
    expect(pick(s, 1).ok).toBe(false)
  })

  it('reshuffles the pile when the market runs out', () => {
    const s = setup({ top: c('circle', 4), hands: [[c('star', 3)], [c('star', 4)]] })
    s.market = [c('cross', 1)]
    s.pile = [c('square', 2), c('square', 3), c('circle', 4)]
    s.pending = 3
    s.pendingKind = 'pick-three'
    pick(s, 0)
    expect(s.hands[0]).toHaveLength(4)
    expect(s.pile).toHaveLength(1)
  })
})

describe('last card call', () => {
  it('penalises a player who does not call, before the next action', () => {
    const s = setup({ top: c('circle', 4), hands: [[c('circle', 3), c('star', 3)], [c('circle', 9), c('cross', 4)]] })
    play(s, 0, s.hands[0]![0]!.id)
    expect(s.owesCall).toBe(0)
    play(s, 1, s.hands[1]![0]!.id)
    expect(s.hands[0]).toHaveLength(3) // 1 + penalty 2
    expect(s.owesCall).toBe(1) // player 1 is now on one card too
  })

  it('no penalty if they call in time', () => {
    const s = setup({ top: c('circle', 4), hands: [[c('circle', 3), c('star', 3)], [c('circle', 9), c('cross', 4)]] })
    play(s, 0, s.hands[0]![0]!.id)
    expect(callLastCard(s, 0).ok).toBe(true)
    play(s, 1, s.hands[1]![0]!.id)
    expect(s.hands[0]).toHaveLength(1)
  })

  it('is ignored when the house rule is off', () => {
    const s = setup({
      rules: { stackPicks: true, lastCardCall: false },
      top: c('circle', 4),
      hands: [[c('circle', 3), c('star', 3)], [c('circle', 9), c('cross', 4)]],
    })
    play(s, 0, s.hands[0]![0]!.id)
    play(s, 1, s.hands[1]![0]!.id)
    expect(s.hands[0]).toHaveLength(1)
  })
})

describe('whot simulation', () => {
  it('computer players always finish a full game without losing a card', () => {
    for (let g = 0; g < 60; g++) {
      const players = 2 + (g % 3)
      const s = newWhot(players, { stackPicks: g % 2 === 0, lastCardCall: true })
      let guard = 0
      while (s.winner == null && guard++ < 4000) {
        expect(autoMove(s, s.turn).ok).toBe(true)
        expect(s.hands.flat().length + s.market.length + s.pile.length).toBe(54)
      }
      expect(s.winner).not.toBeNull()
    }
  })
})

describe('forfeit', () => {
  it('returns a leaver’s cards to the market, skips them, and crowns the last player', () => {
    const s = setup({ top: c('circle', 4), hands: [[c('star', 3)], [c('star', 4), c('cross', 4)], [c('star', 5)]] })
    forfeit(s, 1)
    expect(s.hands[1]).toHaveLength(0)
    expect(s.market.length).toBe(22)
    pick(s, 0)
    expect(s.turn).toBe(2) // seat 1 skipped
    forfeit(s, 2)
    expect(s.winner).toBe(0)
  })
})
