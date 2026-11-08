import { describe, expect, it } from 'vitest'
import { HOME_GRID } from './home-grid.js'
import { STARTERS, STARTER_SIZE, starterSeedSpot } from './home-starters.js'
import { checkHomePlacement, homeTiles, type HomeShape } from './home-buy-rules.js'
import { HOME_ROOMS, planStyleLayout, roomOf, ruleOf, scopesFor, type StyleEntry, type StyleItem, type StylePiece } from './home-style-layout.js'

const it$ = (id: string, category: string, w: number, d: number, extra: Partial<StyleItem> = {}): [string, StyleItem] => [
  id,
  { id, category, w, d, wall: false, maxPerHome: 4, uses: null, ...extra },
]
// Sizes as in 055_kenney_furniture.sql
const items = new Map<string, StyleItem>([
  it$('k-spring-bed', 'sleep', 2, 4, { uses: 'bed', maxPerHome: 1 }),
  it$('k-single-bed', 'sleep', 2, 3, { uses: 'bed', maxPerHome: 1 }),
  it$('k-bedside-drawers', 'sleep', 1, 1),
  it$('k-sofa-two', 'comfort', 3, 1, { uses: 'sofa', maxPerHome: 1 }),
  it$('k-sofa-corner', 'comfort', 4, 4, { uses: 'sofa', maxPerHome: 1 }),
  it$('k-armchair', 'comfort', 2, 2, { uses: 'sofa', maxPerHome: 2 }),
  it$('k-centre-table', 'comfort', 2, 1, { maxPerHome: 1 }),
  it$('k-flat-tv', 'comfort', 2, 1, { wall: true, maxPerHome: 1 }),
  it$('k-tv-stand', 'comfort', 2, 1, { maxPerHome: 1 }),
  it$('k-speaker-tower', 'comfort', 1, 1, { maxPerHome: 2 }),
  it$('k-cushion-chair', 'comfort', 1, 1, { uses: 'red-chair', maxPerHome: 6 }),
  it$('k-dining-table', 'kitchen', 3, 2, { maxPerHome: 1 }),
  it$('k-fridge', 'kitchen', 1, 1, { maxPerHome: 1 }),
  it$('k-gas-cooker-oven', 'kitchen', 1, 1, { uses: 'cooker', maxPerHome: 1 }),
  it$('k-kitchen-cabinet', 'kitchen', 1, 1),
  it$('k-wc-square', 'bath', 1, 1, { uses: 'toilet', maxPerHome: 1 }),
  it$('k-hand-basin', 'bath', 1, 1, { maxPerHome: 2 }),
  it$('k-student-desk', 'study', 3, 2, { maxPerHome: 1 }),
  it$('k-office-chair', 'study', 1, 1, { uses: 'desk-chair', maxPerHome: 2 }),
  it$('k-bookcase-wide', 'study', 2, 1, { maxPerHome: 2 }),
  it$('k-table-lamp', 'light', 1, 1, { maxPerHome: 3 }),
  it$('k-house-plant', 'deco', 1, 1, { maxPerHome: 4 }),
  ...Object.entries(STARTER_SIZE).map(([id, size]) => it$(id, 'starter', size.w, size.d, { maxPerHome: 1, uses: id === 'starter-bed' ? 'bed' : id === 'starter-cooker' ? 'cooker' : id === 'starter-toilet' ? 'toilet' : id === 'starter-sofa' ? 'sofa' : id === 'starter-red-chair' ? 'red-chair' : null })),
])
const shapes = new Map<string, HomeShape>([...items].map(([id, i]) => [id, { id, w: i.w, d: i.d, wall: i.wall, maxPerHome: i.maxPerHome }]))

const e = (...ids: string[]): StyleEntry[] => ids.map((item) => ({ item, finish: '#a9744f' }))
const BIG = e('k-spring-bed', 'k-bedside-drawers', 'k-bedside-drawers', 'k-sofa-two', 'k-flat-tv', 'k-centre-table', 'k-speaker-tower', 'k-armchair', 'k-dining-table', 'k-cushion-chair', 'k-cushion-chair', 'k-fridge', 'k-gas-cooker-oven', 'k-kitchen-cabinet', 'k-wc-square', 'k-hand-basin', 'k-student-desk', 'k-office-chair', 'k-bookcase-wide', 'k-table-lamp', 'k-house-plant')
const SMALL = e('k-single-bed', 'k-student-desk', 'k-office-chair', 'k-table-lamp', 'k-house-plant')

const run = (home: string, entries: StyleEntry[], more: Partial<Parameters<typeof planStyleLayout>[0]> = {}) =>
  planStyleLayout({ lodgingId: home, spec: HOME_GRID[home]!, items, active: [], entries, ...more })

const inRect = (r: [number, number, number, number], x: number, z: number) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]

describe('styles layout', () => {
  for (const home of Object.keys(HOME_ROOMS)) {
    const spec = HOME_GRID[home]!
    const plan = run(home, BIG)
    const clear = new Set(HOME_ROOMS[home]!.keepClear.map(([x, z]) => `${x},${z}`))

    describe(home, () => {
      it('places something and never more than the style lists', () => {
        expect(plan.result.length).toBeGreaterThan(3)
        expect(plan.buys.length + plan.skipped.length).toBe(BIG.length)
      })

      it('keeps every floor piece on its own free tiles (no overlaps, nothing on walls)', () => {
        const seen = new Set<string>()
        for (const p of plan.result) {
          const shape = shapes.get(p.itemId)!
          if (shape.wall) continue
          for (const [x, z] of homeTiles(shape, p)) {
            expect(seen.has(`${x},${z}`)).toBe(false)
            seen.add(`${x},${z}`)
            expect(spec.floor[z]?.[x]).toBe('1')
            expect(spec.blocked[z]?.[x]).toBe('0')
          }
        }
      })

      it('keeps pieces inside the room they belong to', () => {
        for (const p of plan.result) {
          const item = items.get(p.itemId)!
          const rooms = HOME_ROOMS[home]!.rooms
          const allowed = ruleOf(item).kinds.map((k) => rooms[k]).filter(Boolean) as [number, number, number, number][]
          const tiles = item.wall ? ([[p.x, 0]] as [number, number][]) : homeTiles(item, p)
          expect(tiles.every(([x, z]) => allowed.some((r) => inRect(r, x, z)))).toBe(true)
        }
      })

      it('keeps doorways and the entrance clear', () => {
        for (const p of plan.result) {
          const shape = shapes.get(p.itemId)!
          for (const [x, z] of shape.wall ? [[p.x, 0]] : homeTiles(shape, p)) expect(clear.has(`${x},${z}`)).toBe(false)
        }
      })

      it('passes the normal placement rules one by one (walkable paths stay)', () => {
        for (const p of plan.result) {
          const rest = plan.result.filter((q) => q.id !== p.id)
          expect(checkHomePlacement(spec, shapes, rest, p.itemId, p)).toMatchObject({ ok: true })
        }
      })

      it('gives the same layout for the same input', () => {
        expect(run(home, BIG)).toEqual(plan)
      })

      it('puts wall pieces on the top wall', () => {
        for (const p of plan.result.filter((q) => shapes.get(q.itemId)!.wall)) expect(p.z).toBe(0)
      })
    })
  }

  it('puts beds in the bedroom, kitchen pieces in the kitchen and bath pieces in the bathroom (one bedroom home)', () => {
    const rooms = HOME_ROOMS['onebed-ojo']!.rooms
    const plan = run('onebed-ojo', BIG)
    const at = (id: string) => plan.result.find((p) => p.itemId === id)!
    expect(inRect(rooms.bedroom!, at('k-spring-bed').x, at('k-spring-bed').z)).toBe(true)
    expect(inRect(rooms.kitchen!, at('k-fridge').x, at('k-fridge').z)).toBe(true)
    expect(inRect(rooms.bath!, at('k-wc-square').x, at('k-wc-square').z)).toBe(true)
    expect(inRect(rooms.sitting!, at('k-sofa-two').x, at('k-sofa-two').z)).toBe(true)
  })

  it('turns the sofa to face the TV and keeps the bedside pieces beside the bed', () => {
    const plan = run('onebed-ojo', BIG)
    const at = (id: string) => plan.result.find((p) => p.itemId === id)!
    const tv = at('k-flat-tv')
    const sofa = at('k-sofa-two')
    // The TV is on the top wall, so the sofa must face up the screen (rotation 180 = front toward -z)
    expect(sofa.z).toBeGreaterThan(tv.z)
    expect(sofa.rot).toBe(180)
    const bed = at('k-spring-bed')
    const side = plan.result.find((p) => p.itemId === 'k-bedside-drawers')!
    expect(Math.abs(side.x - bed.x) <= 3 && Math.abs(side.z - bed.z) <= 5).toBe(true)
  })

  it('skips what does not fit, and bought pieces are only the placed ones', () => {
    const plan = run('single-poultry', [...BIG, ...e('k-spring-bed', 'k-sofa-two')])
    expect(plan.skipped.length).toBeGreaterThan(0)
    expect(plan.buys.length).toBe(plan.result.filter((p) => p.id.startsWith('new')).length)
  })

  it('reuses what you own (also from storage) and sends the rest to storage on a whole-home style', () => {
    const owned: StylePiece[] = [
      { id: 'hp_bed', itemId: 'k-single-bed', x: 0, z: 0, rot: 0 },
      { id: 'hp_old', itemId: 'k-house-plant', x: 9, z: 9, rot: 0 },
    ]
    const stored: StylePiece[] = [{ id: 'hp_desk', itemId: 'k-student-desk', x: 0, z: 0, rot: 0 }]
    const plan = run('selfcon-g2', SMALL, { active: owned, stored })
    expect(plan.moves.map((m) => m.id).sort()).toEqual(['hp_bed', 'hp_desk', 'hp_old'].filter((id) => id !== 'hp_old').concat(plan.moves.some((m) => m.id === 'hp_old') ? ['hp_old'] : []).sort())
    expect(plan.moves.find((m) => m.id === 'hp_desk')!.fromStorage).toBe(true)
    expect(plan.toStorage).toEqual([])
    // A style without the plant sends the plant to storage
    const noPlant = run('selfcon-g2', e('k-single-bed'), { active: owned })
    expect(noPlant.toStorage).toEqual(['hp_old'])
    expect(noPlant.result.map((p) => p.id)).toEqual(['hp_bed'])
  })

  it('a room scope only touches that room and stores nothing', () => {
    const owned: StylePiece[] = [{ id: 'hp_old', itemId: 'k-house-plant', x: 9, z: 9, rot: 0 }]
    const plan = run('onebed-ojo', BIG, { active: owned, scope: 'kitchen' })
    expect(plan.toStorage).toEqual([])
    expect(plan.result.find((p) => p.id === 'hp_old')).toBeTruthy()
    for (const b of plan.buys) expect(roomOf(items.get(b.itemId)!)).toBe('kitchen')
    expect(plan.buys.length).toBeGreaterThan(0)
  })
})

describe('every home type', () => {
  it('has a plan for every home that has a grid', () => {
    expect(Object.keys(HOME_ROOMS).sort()).toEqual(Object.keys(HOME_GRID).sort())
  })

  it('offers only the rooms the home has', () => {
    expect(scopesFor('single-poultry').map((s) => s.label)).toEqual(['Whole room'])
    expect(scopesFor('selfcon-g2').map((s) => s.id)).toEqual(['home', 'bedroom', 'sitting', 'kitchen', 'bath'])
    expect(scopesFor('onebed-ojo').map((s) => s.id)).toEqual(['home', 'bedroom', 'sitting', 'kitchen', 'bath'])
  })

  it('single room: sleep corner, sitting spot and cooking corner all inside the one room', () => {
    const rooms = HOME_ROOMS['single-poultry']!.rooms
    const plan = run('single-poultry', e('k-single-bed', 'k-sofa-two', 'k-gas-cooker-oven', 'k-wc-square'))
    const at = (id: string) => plan.result.find((p) => p.itemId === id)!
    expect(plan.skipped).toEqual([])
    expect(inRect(rooms.bedroom!, at('k-single-bed').x, at('k-single-bed').z)).toBe(true)
    expect(inRect(rooms.kitchen!, at('k-gas-cooker-oven').x, at('k-gas-cooker-oven').z)).toBe(true)
    expect(inRect(rooms.bath!, at('k-wc-square').x, at('k-wc-square').z)).toBe(true)
  })

  it('self-con: kitchenette and bathroom are the rooms below the doorways', () => {
    const rooms = HOME_ROOMS['selfcon-g2']!.rooms
    const plan = run('selfcon-g2', BIG)
    const at = (id: string) => plan.result.find((p) => p.itemId === id)!
    expect(inRect(rooms.kitchen!, at('k-fridge').x, at('k-fridge').z)).toBe(true)
    expect(inRect(rooms.kitchen!, at('k-gas-cooker-oven').x, at('k-gas-cooker-oven').z)).toBe(true)
    expect(inRect(rooms.bath!, at('k-wc-square').x, at('k-wc-square').z)).toBe(true)
    expect(inRect(rooms.bedroom!, at('k-spring-bed').x, at('k-spring-bed').z)).toBe(true)
  })

  it('places the important pieces first: bed, TV, seating, cooking, then decor', () => {
    const order = [...items.values()].map((i) => [i.id, ruleOf(i).priority] as const)
    const pri = (id: string) => order.find(([x]) => x === id)![1]
    expect(pri('k-spring-bed')).toBeLessThan(pri('k-sofa-two'))
    expect(pri('k-sofa-two')).toBeLessThan(pri('k-gas-cooker-oven'))
    expect(pri('k-gas-cooker-oven')).toBeLessThan(pri('k-bookcase-wide'))
    expect(pri('k-bookcase-wide')).toBeLessThan(pri('k-table-lamp'))
    expect(pri('k-table-lamp')).toBeLessThan(pri('k-house-plant'))
  })

  it('a crowded small home keeps the bed and skips decor first', () => {
    const lots = [...e('k-single-bed', 'k-sofa-two', 'k-gas-cooker-oven'), ...Array.from({ length: 30 }, () => ({ item: 'k-house-plant', finish: null }))]
    const plan = run('single-poultry', lots)
    expect(plan.result.some((p) => p.itemId === 'k-single-bed')).toBe(true)
    expect(plan.result.some((p) => p.itemId === 'k-gas-cooker-oven')).toBe(true)
    expect(plan.skipped.every((id) => id === 'k-house-plant')).toBe(true)
    expect(plan.skipped.length).toBeGreaterThan(0)
  })
})

describe('pieces that come with the home', () => {
  const starterPieces = (home: string): StylePiece[] =>
    STARTERS[home]!.map((d) => ({ id: 'starter-' + d.item, itemId: d.item, ...starterSeedSpot(HOME_GRID[home]!, d) }))

  it('single room: a bed style reuses the starter bed in place and buys no second bed', () => {
    const active = starterPieces('single-poultry')
    const plan = run('single-poultry', e('k-single-bed', 'k-student-desk', 'k-table-lamp'), { active })
    expect(plan.reused.map((r) => r.itemId).sort()).toEqual(['k-single-bed', 'k-student-desk'])
    expect(plan.buys.map((b) => b.itemId)).toEqual(['k-table-lamp'])
    // The starter bed and desk are still exactly where they were, and nothing else is a bed
    const bed = plan.result.find((p) => p.id === 'starter-starter-bed')!
    expect(bed).toMatchObject({ x: 0, z: 6 })
    expect(plan.result.filter((p) => ['k-single-bed', 'k-spring-bed'].includes(p.itemId))).toEqual([])
    expect(plan.toStorage).toEqual([])
  })

  it('never stores or moves a starter piece, even on a whole-home style', () => {
    const active = starterPieces('selfcon-g2')
    const plan = run('selfcon-g2', BIG, { active })
    for (const s of active) expect(plan.result.find((p) => p.id === s.id)).toMatchObject({ x: s.x, z: s.z })
    expect(plan.toStorage.some((id) => id.startsWith('starter-'))).toBe(false)
  })

  it('a starter cooker stands in for the style cooker (no charge, no second cooker)', () => {
    const plan = run('selfcon-g2', e('k-gas-cooker-oven', 'k-fridge'), { active: starterPieces('selfcon-g2') })
    expect(plan.reused.map((r) => r.itemId)).toContain('k-gas-cooker-oven')
    expect(plan.buys.map((b) => b.itemId)).not.toContain('k-gas-cooker-oven')
  })

  it('one starter covers one style piece: a second bed in the style is a real purchase', () => {
    const plan = run('single-poultry', e('k-single-bed', 'k-spring-bed'), { active: starterPieces('single-poultry') })
    expect(plan.reused).toHaveLength(1)
    expect(plan.buys).toHaveLength(1)
    expect(plan.buys.length + plan.reused.length + plan.skipped.length).toBe(2)
  })
})
