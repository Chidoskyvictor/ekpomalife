import { describe, expect, it } from 'vitest'
import { HIP, LIE_HALF, LIE_RISE, MODEL_SEATS, seatsFor, turnPoint } from './furniture-seats'
import { FRONT, layoutWithPlaced, placedIdOf, placedKey } from './home-placed'
import { HOME_GRID } from './home-grid'
import type { HomeItem } from './home-buy-api'

const SOFA = '/models/furniture/pro/sofa-two.glb'
const BED = '/models/furniture/pro/bed-vono-double.glb'
const ROTS = [0, 90, 180, 270] as const
const close = (a: number, b: number) => Math.abs(a - b) < 1e-6

describe('turnPoint', () => {
  it('turns with the game rotation: rot 90 sends the front (+z) to −x', () => {
    const [x, z] = turnPoint(90, 0, 1)
    expect(close(x, -1) && close(z, 0)).toBe(true)
    expect(turnPoint(180, 0, 1)).toEqual([expect.closeTo(0), expect.closeTo(-1)])
    expect(turnPoint(270, 0, 1)).toEqual([expect.closeTo(1), expect.closeTo(0)])
  })
})

describe('seatsFor', () => {
  it('returns null for a model with no seat data', () => {
    expect(seatsFor('/models/furniture/kenney/lampWall.glb', [0, 0], 0)).toBeNull()
    expect(seatsFor(null, [0, 0], 0)).toBeNull()
  })

  it('a two-seater sofa has two seats, side by side, at seat height', () => {
    const r = seatsFor(SOFA, [5, 5], 0)!
    expect(r.kind).toBe('sit')
    expect(r.seats).toHaveLength(2)
    expect(r.seats[0]!.at[0]).toBeLessThan(r.seats[1]!.at[0])
    for (const s of r.seats) expect(s.at[1]).toBeCloseTo(0.46 - HIP)
  })

  for (const rot of ROTS) {
    it(`sofa turned ${rot}: seats stay in a row across the sofa, facing the way the sofa faces`, () => {
      const r = seatsFor(SOFA, [5, 5], rot)!
      const [fx, fz] = FRONT[rot]
      for (const s of r.seats) {
        expect(Math.sin(s.heading)).toBeCloseTo(fx)
        expect(Math.cos(s.heading)).toBeCloseTo(fz)
        // In front of the middle (toward where it faces), not behind
        const ahead = (s.floor[0] - 5) * fx + (s.floor[1] - 5) * fz
        expect(ahead).toBeGreaterThan(0)
      }
      // The two seats differ only across the facing direction
      const [a, b] = r.seats
      const along = (b!.floor[0] - a!.floor[0]) * fx + (b!.floor[1] - a!.floor[1]) * fz
      expect(along).toBeCloseTo(0)
      expect(Math.hypot(b!.floor[0] - a!.floor[0], b!.floor[1] - a!.floor[1])).toBeCloseTo(0.8)
    })
  }

  it('a model that faces +x (lounge chair) turns a quarter against the piece', () => {
    const s0 = seatsFor('/models/furniture/pro/lounge-chair.glb', [0, 0], 0)!.seats[0]!
    expect(Math.sin(s0.heading)).toBeCloseTo(1)
    expect(Math.cos(s0.heading)).toBeCloseTo(0)
    // Piece turned 90: its +x side now points +z
    const s90 = seatsFor('/models/furniture/pro/lounge-chair.glb', [0, 0], 90)!.seats[0]!
    expect(Math.sin(s90.heading)).toBeCloseTo(0)
    expect(Math.cos(s90.heading)).toBeCloseTo(1)
  })

  it('a corner sofa has four seats, two of them turned to face −x', () => {
    const r = seatsFor('/models/furniture/kenney/loungeSofaCorner.glb', [0, 0], 0)!
    expect(r.seats).toHaveLength(4)
    expect(r.seats.filter((s) => Math.sin(s.heading) < -0.99)).toHaveLength(2)
  })

  for (const rot of ROTS) {
    it(`bed turned ${rot}: body lies on the mattress with the head away from the front`, () => {
      const r = seatsFor(BED, [2, 3], rot)!
      expect(r.kind).toBe('lie')
      const s = r.seats[0]!
      expect(s.at[1]).toBeCloseTo(0.68 + LIE_RISE)
      // Head points toward the bed's back (−front); the feet (the origin) are LIE_HALF toward the front
      const [fx, fz] = FRONT[rot]
      const toFeet = (s.at[0] - s.floor[0]) * fx + (s.at[1 + 1] - s.floor[1]) * fz
      expect(toFeet).toBeCloseTo(LIE_HALF)
    })
  }

  it('every lying or sitting model has seats with finite numbers', () => {
    for (const [model, data] of Object.entries(MODEL_SEATS)) {
      expect(data.seats.length, model).toBeGreaterThan(0)
      for (const s of data.seats) for (const v of [s.x, s.z, s.top]) expect(Number.isFinite(v), model).toBe(true)
    }
  })
})

describe('layoutWithPlaced with multi-seat pieces', () => {
  const spec = HOME_GRID['onebed-ojo']!
  const item = (over: Partial<HomeItem>): HomeItem =>
    ({ id: 'k-sofa-two', name: 'Sofa', emoji: '🛋️', category: 'comfort', price: 1, w: 3, d: 1, wall: false, height: 0.82, color: '#fff', helps: [], uses: 'sofa', maxPerHome: 1, sort: 1, model: SOFA, finishes: [], ...over }) as HomeItem
  const layout = { blocks: [], spots: {}, tapBoxes: {} } as never

  it('gives each seat its own spot and tap box; the first keeps the piece key', () => {
    const placements = [{ id: 'abc', itemId: 'k-sofa-two', x: 3, z: 3, rot: 0 }] as never
    const out = layoutWithPlaced(layout, spec, placements, [item({})])
    expect(Object.keys(out.spots).sort()).toEqual([placedKey('abc'), `${placedKey('abc')}#1`])
    expect(Object.keys(out.tapBoxes).sort()).toEqual([placedKey('abc'), `${placedKey('abc')}#1`])
    expect(placedIdOf(`${placedKey('abc')}#1`)).toBe('abc')
    expect(placedIdOf(placedKey('abc'))).toBe('abc')
    const [a, b] = [out.spots[placedKey('abc')]!, out.spots[`${placedKey('abc')}#1`]!]
    expect(a.at[0]).toBeLessThan(b.at[0])
  })

  for (const rot of ROTS) {
    it(`rot ${rot}: the sofa's seats stay on top of the sofa's tiles`, () => {
      const placements = [{ id: 'abc', itemId: 'k-sofa-two', x: 4, z: 4, rot }] as never
      const out = layoutWithPlaced(layout, spec, placements, [item({})])
      const rect = out.blocks[0]!
      for (const spot of Object.values(out.spots)) {
        expect(spot!.at[0]).toBeGreaterThan(rect[0] - 0.2)
        expect(spot!.at[0]).toBeLessThan(rect[2] + 0.2)
        expect(spot!.at[2]).toBeGreaterThan(rect[1] - 0.2)
        expect(spot!.at[2]).toBeLessThan(rect[3] + 0.2)
      }
    })
  }

  it('a piece without seat data keeps the old centre spot', () => {
    const placements = [{ id: 'old', itemId: 'plastic-chair', x: 3, z: 3, rot: 0 }] as never
    const out = layoutWithPlaced(layout, spec, placements, [item({ id: 'plastic-chair', w: 1, d: 1, uses: 'red-chair', model: null as never, height: 0.5 })])
    expect(Object.keys(out.spots)).toEqual([placedKey('old')])
  })
})
