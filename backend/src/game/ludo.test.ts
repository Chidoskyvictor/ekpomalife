import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyMove, applyRoll, HOME, legalTokens, newLudo, ringCell } from './ludo-engine.js'
import { act, dropLudoRoom, ludoView, openLudoRoom, setLudoHooks, setSeatAway } from './ludo-live.js'

describe('ludo-engine', () => {
  it('needs a 6 to leave base and passes the turn otherwise', () => {
    const s = newLudo([0, 2])
    expect(applyRoll(s, 3)).toMatchObject({ ok: true, passed: true })
    expect(s.turn).toBe(1)
    expect(applyRoll(s, 6).legal).toEqual([0, 1, 2, 3])
    applyMove(s, 0)
    expect(s.pos[1]![0]).toBe(0)
    expect(s.turn).toBe(1) // a 6 means roll again
    expect(s.dice).toBeNull()
  })

  it('refuses a roll while one is waiting and a move that is not legal', () => {
    const s = newLudo([0, 2])
    applyRoll(s, 6)
    expect(applyRoll(s, 2).ok).toBe(false)
    s.pos[0] = [5, -1, -1, -1]
    s.dice = 2
    expect(applyMove(s, 1)).toBeNull() // base token without a 6
    expect(applyMove(s, 0)).not.toBeNull()
  })

  it('rejects bad dice values', () => {
    const s = newLudo([0, 2])
    expect(applyRoll(s, 0).ok).toBe(false)
    expect(applyRoll(s, 7).ok).toBe(false)
    expect(applyRoll(s, 2.5).ok).toBe(false)
  })

  it('captures an opponent on any ring cell, even a start or star square (Naija rules)', () => {
    const s = newLudo([0, 2])
    // red step 10 = cell 10; yellow step 40 = cell (26+40)%52 = 14
    s.pos[0] = [8, -1, -1, -1]
    s.pos[1] = [36, -1, -1, -1] // cell 10
    expect(ringCell(2, 36)).toBe(10)
    s.dice = 2
    const res = applyMove(s, 0)
    expect(res!.captured).toEqual([{ seat: 1, token: 0 }])
    expect(s.pos[1]![0]).toBe(-1)

    const t = newLudo([0, 2])
    t.pos[0] = [6, -1, -1, -1]
    t.pos[1] = [34, -1, -1, -1] // cell 8, a "star" square elsewhere: still capturable
    t.dice = 2
    expect(applyMove(t, 0)!.captured).toEqual([{ seat: 1, token: 0 }])
    expect(t.pos[1]![0]).toBe(-1)

    const u = newLudo([0, 2])
    u.pos[0] = [51, -1, -1, -1] // red on its home lane
    u.pos[1] = [-1, -1, -1, -1]
    u.dice = 1
    expect(applyMove(u, 0)!.captured).toEqual([])
  })

  it('needs an exact roll to reach home and wins with all four home', () => {
    const s = newLudo([0, 2])
    s.pos[0] = [HOME, HOME, HOME, 54]
    s.dice = 3
    expect(legalTokens(s)).toEqual([])
    s.dice = 2
    expect(legalTokens(s)).toEqual([3])
    applyMove(s, 3)
    expect(s.winner).toBe(0)
    expect(applyRoll(s, 4).ok).toBe(false)
  })

  it('gives an extra roll on a 6 but not on other numbers', () => {
    const s = newLudo([0, 2])
    s.pos[0] = [10, -1, -1, -1]
    s.dice = 6
    expect(applyMove(s, 0)!.extra).toBe(true)
    expect(s.turn).toBe(0)
    s.dice = 4
    applyMove(s, 0)
    expect(s.turn).toBe(1)
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

  it('only the seat to move can roll, and the roll comes from the server', () => {
    expect(act(id, 1, { t: 'roll' })).toMatchObject({ ok: false })
    queue = [6]
    expect(act(id, 0, { t: 'roll' }).ok).toBe(true)
    const v = ludoView(id)
    expect(v.dice).toBe(6)
    expect(v.legal).toEqual([0, 1, 2, 3])
    expect(act(id, 0, { t: 'roll' }).ok).toBe(false) // must move first
  })

  it('ignores a move that is not legal and unknown actions', () => {
    queue = [3]
    act(id, 0, { t: 'roll' }) // no 6: passes to seat 1
    expect(ludoView(id).turn).toBe(1)
    expect(act(id, 1, { t: 'move', token: 0 }).ok).toBe(false)
    expect(act(id, 1, { t: 'win' }).ok).toBe(false)
  })

  it('settles only when the server sees a real win', () => {
    // Play seat 0 round the board: six, then move each token 55 steps with fixed rolls
    const rolls: number[] = []
    const plan: [number, number][] = []
    for (let t = 0; t < 4; t++) {
      plan.push([6, t]) // leave base
      for (let i = 0; i < 9; i++) plan.push([6, t]) // 54 steps
      plan.push([2, t]) // step 56
    }
    // Seat 1 never gets to play: every seat-0 roll of 6 re-rolls; the closing 2 passes the turn.
    // Feed a 3 to seat 1 (nothing legal, passes back) after each closing 2.
    for (const [r, t] of plan) {
      queue = [r]
      expect(act(id, 0, { t: 'roll' }).ok).toBe(true)
      expect(act(id, 0, { t: 'move', token: t })).toMatchObject({ ok: true })
      rolls.push(r)
      if (r === 2 && finished.length === 0 && ludoView(id).winner == null) {
        queue = [3]
        expect(act(id, 1, { t: 'roll' }).ok).toBe(true)
      }
    }
    expect(ludoView(id).winner).toBe(0)
    expect(finished).toEqual([0])
    expect(act(id, 0, { t: 'roll' }).ok).toBe(false)
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
    // 1 is not a 6: nothing can move, turn passes seat to seat
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
