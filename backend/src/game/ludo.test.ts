import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyMove, applyRoll, autoMove, HOME, legalMoves, newLudo, ringCell, type LudoState } from './ludo-engine.js'
import { act, dropLudoRoom, ludoView, openLudoRoom, setLudoHooks, setSeatAway } from './ludo-live.js'

const roll = (s: LudoState, a: number, b: number) => applyRoll(s, a, b)

describe('ludo-engine: two dice', () => {
  it('needs a 6 to leave base; no 6 passes the turn', () => {
    const s = newLudo([0, 2])
    expect(roll(s, 3, 4)).toMatchObject({ ok: true, passed: true })
    expect(s.turn).toBe(1)
    const t = newLudo([0, 2])
    expect(roll(t, 6, 1).passed).toBe(false)
    // only the 6 can take a seed out; the 1 cannot while everything is in base
    expect(legalMoves(t).every((m) => m.die === 0)).toBe(true)
  })

  it('6+1: the 6 brings a seed out, then the 1 moves a seed', () => {
    const s = newLudo([0, 2])
    roll(s, 6, 1)
    const out = applyMove(s, { token: 0, die: 0 })!
    expect(out).toMatchObject({ from: -1, to: 0, ended: false })
    expect(s.turn).toBe(0) // still on this roll
    const step = applyMove(s, { token: 0, die: 1 })!
    expect(step).toMatchObject({ from: 0, to: 1, ended: true, extra: false })
    expect(s.turn).toBe(1)
  })

  it('double six: two seeds out AND roll again', () => {
    const s = newLudo([0, 2])
    roll(s, 6, 6)
    applyMove(s, { token: 0, die: 0 })
    const res = applyMove(s, { token: 1, die: 1 })!
    expect(s.pos[0]).toEqual([0, 0, -1, -1])
    expect(res).toMatchObject({ ended: true, extra: true })
    expect(s.turn).toBe(0)
    expect(s.dice).toBeNull()
  })

  it('a single 6 gives no extra roll', () => {
    const s = newLudo([0, 2])
    s.pos[0] = [10, -1, -1, -1]
    roll(s, 6, 2)
    applyMove(s, { token: 0, die: 0 })
    const res = applyMove(s, { token: 0, die: 1 })!
    expect(res.extra).toBe(false)
    expect(s.turn).toBe(1)
  })

  it('4+3: one seed by 4 and another by 3, OR one seed by 7', () => {
    const s = newLudo([0, 2])
    s.pos[0] = [5, 20, -1, -1]
    roll(s, 4, 3)
    const moves = legalMoves(s)
    expect(moves).toContainEqual({ token: 0, die: 0 })
    expect(moves).toContainEqual({ token: 1, die: 1 })
    expect(moves).toContainEqual({ token: 0, die: 'sum' })
    expect(moves.some((m) => m.token === 2)).toBe(false) // base seeds can't use 4 or 3

    applyMove(s, { token: 0, die: 0 })
    applyMove(s, { token: 1, die: 1 })
    expect(s.pos[0]).toEqual([9, 23, -1, -1])

    const t = newLudo([0, 2])
    t.pos[0] = [5, 20, -1, -1]
    roll(t, 4, 3)
    const res = applyMove(t, { token: 0, die: 'sum' })!
    expect(res).toMatchObject({ from: 5, to: 12, steps: 7, ended: true })
    expect(t.pos[0]![0]).toBe(12)
  })

  it('the sum move is not offered once a die has been used, or for a base seed', () => {
    const s = newLudo([0, 2])
    s.pos[0] = [5, -1, -1, -1]
    roll(s, 6, 3)
    expect(legalMoves(s).some((m) => m.die === 'sum' && m.token === 1)).toBe(false)
    applyMove(s, { token: 1, die: 0 }) // bring out
    expect(legalMoves(s).some((m) => m.die === 'sum')).toBe(false)
  })

  it('a die with no legal use is lost and the turn ends', () => {
    const s = newLudo([0, 2])
    s.pos[0] = [5, -1, -1, -1]
    roll(s, 2, 3)
    applyMove(s, { token: 0, die: 0 })
    expect(s.turn).toBe(0)
    applyMove(s, { token: 0, die: 1 })
    expect(s.turn).toBe(1)
    // only one die can be played: the other overshoots home
    const t = newLudo([0, 2])
    t.pos[0] = [54, -1, -1, -1]
    roll(t, 2, 5)
    expect(legalMoves(t)).toEqual([{ token: 0, die: 0 }])
    expect(applyMove(t, { token: 0, die: 0 })!.ended).toBe(true)
    expect(t.pos[0]![0]).toBe(HOME)
    expect(t.turn).toBe(1)
  })

  it('refuses a roll while one is waiting, bad dice, and illegal moves', () => {
    const s = newLudo([0, 2])
    roll(s, 6, 6)
    expect(roll(s, 2, 2).ok).toBe(false)
    expect(applyMove(s, { token: 0, die: 'sum' })).toBeNull() // base seed can't sum
    const t = newLudo([0, 2])
    expect(roll(t, 0, 3).ok).toBe(false)
    expect(roll(t, 7, 3).ok).toBe(false)
    expect(roll(t, 2.5, 3).ok).toBe(false)
  })

  it('captures an opponent on any ring cell (Naija rules: no safe squares)', () => {
    const s = newLudo([0, 2])
    s.pos[0] = [8, -1, -1, -1]
    s.pos[1] = [36, -1, -1, -1] // yellow step 36 = cell 10
    expect(ringCell(2, 36)).toBe(10)
    roll(s, 2, 5)
    const res = applyMove(s, { token: 0, die: 0 })!
    expect(res.captured).toEqual([{ seat: 1, token: 0 }])
    expect(s.pos[1]![0]).toBe(-1)
  })

  it('a combined move only captures where it lands, not in between', () => {
    const s = newLudo([0, 2])
    s.pos[0] = [6, -1, -1, -1]
    s.pos[1] = [35, -1, -1, -1] // yellow on cell 9, between 6 and 13
    expect(ringCell(2, 35)).toBe(9)
    roll(s, 3, 4)
    const res = applyMove(s, { token: 0, die: 'sum' })!
    expect(res.captured).toEqual([])
    expect(s.pos[1]![0]).toBe(35)
  })

  it('does not capture on a home lane', () => {
    const s = newLudo([0, 2])
    s.pos[0] = [51, -1, -1, -1]
    roll(s, 1, 2)
    expect(applyMove(s, { token: 0, die: 0 })!.captured).toEqual([])
  })

  it('needs an exact count to reach home and wins with all four home', () => {
    const s = newLudo([0, 2])
    s.pos[0] = [HOME, HOME, HOME, 54]
    roll(s, 3, 4)
    expect(legalMoves(s)).toEqual([])
    const t = newLudo([0, 2])
    t.pos[0] = [HOME, HOME, HOME, 54]
    roll(t, 2, 5)
    applyMove(t, { token: 3, die: 0 })
    expect(t.winner).toBe(0)
    expect(roll(t, 1, 1).ok).toBe(false)
  })

  it('computer move prefers a capture', () => {
    const s = newLudo([0, 2])
    s.pos[0] = [8, 20, -1, -1]
    s.pos[1] = [36, -1, -1, -1]
    roll(s, 2, 1)
    expect(autoMove(s)).toEqual({ token: 0, die: 0 })
  })

  it('computer players finish a full 4-player game', () => {
    for (let game = 0; game < 20; game++) {
      const s = newLudo([0, 1, 2, 3])
      let guard = 0
      while (s.winner == null && guard++ < 20000) {
        if (s.dice == null) {
          const d = () => 1 + Math.floor(Math.random() * 6)
          applyRoll(s, d(), d())
          continue
        }
        expect(applyMove(s, autoMove(s)!)).not.toBeNull()
      }
      expect(s.winner).not.toBeNull()
    }
  })
})

describe('ludo-live (server rolls, server decides)', () => {
  const sent: unknown[] = []
  const finished: number[] = []
  let queue: number[] = []
  const id = 'm1'
  setLudoHooks({
    broadcast: (_m, msg) => void sent.push(msg),
    finish: (_m, seat) => void finished.push(seat),
    roll: () => queue.shift() ?? 1,
  })
  afterEach(() => {
    dropLudoRoom(id)
    sent.length = 0
    finished.length = 0
    queue = []
  })

  it('only the seat to move can roll, and both dice come from the server', () => {
    expect(act(id, 1, { t: 'roll' })).toMatchObject({ ok: false })
    queue = [6, 2]
    expect(act(id, 0, { t: 'roll' }).ok).toBe(true)
    const v = ludoView(id)
    expect(v.dice).toEqual([6, 2])
    expect(v.moves.length).toBeGreaterThan(0)
    expect(act(id, 0, { t: 'roll' }).ok).toBe(false) // play the dice first
  })

  it('plays a move, rejects an illegal one and unknown actions', () => {
    queue = [3, 4]
    act(id, 0, { t: 'roll' }) // no 6: passes to seat 1
    expect(ludoView(id).turn).toBe(1)
    expect(act(id, 1, { t: 'move', token: 0, die: 0 }).ok).toBe(false)
    expect(act(id, 1, { t: 'win' }).ok).toBe(false)
    queue = [6, 1]
    act(id, 1, { t: 'roll' })
    expect(act(id, 1, { t: 'move', token: 0, die: 0 }).ok).toBe(true)
    expect(act(id, 1, { t: 'move', token: 0, die: 1 }).ok).toBe(true)
    expect(ludoView(id).turn).toBe(0)
  })
})

describe('ludo tables (2–4 players)', () => {
  const noop = { broadcast: () => {}, finish: () => {} }
  afterEach(() => {
    dropLudoRoom('tbl')
    vi.useRealTimers()
  })

  it('seats 3 and 4 players with their own colours and rotates turns', () => {
    openLudoRoom('tbl', 4, noop)
    const v = ludoView('tbl')
    expect(v.seats).toBe(4)
    expect(v.colors).toEqual([0, 1, 2, 3])
    setLudoHooks({ broadcast: () => {}, finish: () => {}, roll: () => 1 })
    for (const seat of [0, 1, 2, 3, 0]) {
      expect(ludoView('tbl').turn).toBe(seat)
      expect(act('tbl', seat, { t: 'roll' }).ok).toBe(true)
    }
  })

  it('plays quickly for a seat whose player has gone', () => {
    vi.useFakeTimers()
    setLudoHooks({ broadcast: () => {}, finish: () => {}, roll: () => 1 })
    openLudoRoom('tbl', 3, noop)
    setSeatAway('tbl', 0, true)
    vi.advanceTimersByTime(2600)
    expect(ludoView('tbl').last?.seat).toBe(0)
    expect(ludoView('tbl').turn).toBe(1)
  })
})
