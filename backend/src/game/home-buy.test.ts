import { describe, expect, it } from 'vitest'
import { HOME_GRID } from './home-grid.js'
import { checkHomePlacement, firstFreeHomeSpot, planStyle, sellBackPrice, type HomePlacement, type HomeShape } from './home-buy-rules.js'

const shapes = new Map<string, HomeShape>([
  ['chair', { id: 'chair', w: 1, d: 1, wall: false, maxPerHome: 2 }],
  ['table', { id: 'table', w: 2, d: 1, wall: false, maxPerHome: 1 }],
  ['poster', { id: 'poster', w: 1, d: 1, wall: true, maxPerHome: 3 }],
])
const spec = HOME_GRID['selfcon-g2']!
const at = (x: number, z: number, rot: 0 | 90 = 0) => ({ x, z, rot })

describe('checkHomePlacement', () => {
  const free = firstFreeHomeSpot(spec, shapes, [], 'chair')!

  it('finds a free spot and accepts it', () => {
    expect(free).not.toBeNull()
    expect(checkHomePlacement(spec, shapes, [], 'chair', free).ok).toBe(true)
  })

  it('refuses unknown items, outside tiles and the door tile', () => {
    expect(checkHomePlacement(spec, shapes, [], 'nope', free)).toMatchObject({ ok: false, code: 'UNKNOWN_ITEM' })
    expect(checkHomePlacement(spec, shapes, [], 'chair', at(-1, 0))).toMatchObject({ ok: false, code: 'OUT_OF_BOUNDS' })
    expect(checkHomePlacement(spec, shapes, [], 'chair', at(spec.start[0], spec.start[1]))).toMatchObject({ ok: false })
  })

  it('refuses overlaps and respects the per-home cap', () => {
    const placed: HomePlacement[] = [{ id: 'a', itemId: 'chair', ...free }]
    expect(checkHomePlacement(spec, shapes, placed, 'chair', free)).toMatchObject({ ok: false, code: 'OVERLAP' })
    const two: HomePlacement[] = [...placed, { id: 'b', itemId: 'chair', x: free.x + 1, z: free.z, rot: 0 }]
    expect(checkHomePlacement(spec, shapes, two, 'chair', at(free.x, free.z + 1))).toMatchObject({ ok: false, code: 'TOO_MANY' })
  })

  it('keeps wall pieces on the back wall row only', () => {
    const col = [...spec.floor[0]!].findIndex((c) => c === '1')
    expect(checkHomePlacement(spec, shapes, [], 'poster', at(col, 0)).ok).toBe(true)
    expect(checkHomePlacement(spec, shapes, [], 'poster', at(col, 3))).toMatchObject({ ok: false, code: 'WALL_ONLY' })
    expect(checkHomePlacement(spec, shapes, [], 'poster', at(col, 0, 90))).toMatchObject({ ok: false, code: 'BAD_ROTATION' })
  })

  it('does not let a wall piece collide with floor furniture (and the reverse)', () => {
    const col = [...spec.floor[0]!].findIndex((c, i) => c === '1' && spec.blocked[0]![i] !== '1')
    expect(col).toBeGreaterThanOrEqual(0)
    const wall: HomePlacement[] = [{ id: 'w', itemId: 'poster', x: col, z: 0, rot: 0 }]
    expect(checkHomePlacement(spec, shapes, wall, 'poster', at(col, 0))).toMatchObject({ ok: false, code: 'OVERLAP' })
    expect(checkHomePlacement(spec, shapes, wall, 'chair', at(col, 0)).ok).toBe(true)
  })

  it('refuses a piece that would wall off part of the home from the door', () => {
    // Fill every free tile but one with chairs/tables is overkill: use the real grid and wall off a corridor.
    const row = spec.floor.findIndex((r, z) => z > 0 && z < spec.rows - 1 && [...r].every((c, x) => c === '1' && spec.blocked[z]![x] !== '1'))
    expect(row).toBeGreaterThan(0)
    const wall: HomePlacement[] = []
    const many = new Map(shapes).set('long', { id: 'long', w: spec.cols, d: 1, wall: false, maxPerHome: 1 })
    const res = checkHomePlacement(spec, many, wall, 'long', at(0, row))
    expect(res.ok).toBe(false)
  })
})

describe('sellBackPrice', () => {
  it('pays half, rounded down', () => {
    expect(sellBackPrice(9500)).toBe(4750)
    expect(sellBackPrice(301)).toBe(150)
  })
})

describe('planStyle', () => {
  it('buys what is missing, reuses what you own, skips what is over the cap', () => {
    const owned: HomePlacement[] = [{ id: 'hp_1', itemId: 'table', x: 0, z: 0, rot: 0 }]
    const plan = planStyle(spec, shapes, owned, [
      { item: 'table', finish: '#a9744f' },
      { item: 'table', finish: null },
      { item: 'chair', finish: '#111111' },
      { item: 'nope' },
    ])
    expect(plan.moves.map((m) => m.id)).toEqual(['hp_1'])
    expect(plan.moves[0]!.finish).toBe('#a9744f')
    // The second table is over the one-per-home cap, the unknown item is unknown
    expect(plan.skipped).toEqual(['table', 'nope'])
    expect(plan.buys.map((b) => b.itemId)).toEqual(['chair'])
    expect(plan.result).toHaveLength(2)
    // Nothing overlaps afterwards
    for (const p of plan.result) {
      const rest = plan.result.filter((q) => q.id !== p.id)
      expect(checkHomePlacement(spec, shapes, rest, p.itemId, p).ok).toBe(true)
    }
  })

  it('leaves the original placements untouched', () => {
    const owned: HomePlacement[] = [{ id: 'hp_1', itemId: 'chair', x: 1, z: 1, rot: 0 }]
    planStyle(spec, shapes, owned, [{ item: 'chair' }])
    expect(owned[0]).toMatchObject({ x: 1, z: 1 })
  })
})
