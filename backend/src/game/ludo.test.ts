import { afterEach, describe, expect, it } from 'vitest'
import { applyMove, applyRoll, HOME, isSafeCell, legalTokens, newLudo, ringCell } from './ludo-engine.js'
import { act, dropLudoRoom, ludoView, setLudoHooks } from './ludo-live.js'

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

  it('captures an opponent on a normal cell but not on a safe one', () => {
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
    t.pos[1] = [34, -1, -1, -1] // cell 8, safe
    expect(isSafeCell(8)).toBe(true)
    t.dice = 2
    expect(applyMove(t, 0)!.captured).toEqual([])
    expect(t.pos[1]![0]).toBe(34)
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
