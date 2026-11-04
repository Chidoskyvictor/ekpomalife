import { describe, expect, it } from 'vitest'
import { homeTiles } from './home-buy-rules'
import { HOME_GRID } from './home-grid'
import { pieceRect, starterMove } from './home-placed'
import { STARTERS, STARTER_SIZE, starterOwnsNode, starterSeedSpot } from './home-starters'
import { ROOM_LAYOUTS } from './room-layouts'

const LAYOUT = { 'single-poultry': 'single-room', 'selfcon-g2': 'selfcon', 'onebed-ojo': 'one-bedroom' } as const

describe('starter furniture', () => {
  for (const [lodging, defs] of Object.entries(STARTERS)) {
    const spec = HOME_GRID[lodging]!
    const layout = ROOM_LAYOUTS[LAYOUT[lodging as keyof typeof LAYOUT]]

    it(`${lodging}: every piece gets free floor tiles of its own`, () => {
      const used = new Set<string>()
      for (const def of defs) {
        const size = STARTER_SIZE[def.item]!
        const tiles = homeTiles(size, starterSeedSpot(spec, def))
        for (const [x, z] of tiles) {
          expect(spec.floor[z]?.[x], `${def.item} ${x},${z} on the floor`).toBe('1')
          expect(spec.blocked[z]?.[x], `${def.item} ${x},${z} not blocked`).toBe('0')
          expect(used.has(`${x},${z}`), `${def.item} ${x},${z} not shared`).toBe(false)
          used.add(`${x},${z}`)
        }
      }
    })

    it(`${lodging}: each piece matches a block in the room and its action spot`, () => {
      for (const def of defs) {
        const match = layout.blocks.some((b) => b.every((v, i) => Math.abs(v - def.rect[i]!) < 0.02))
        expect(match, def.item).toBe(true)
        if (def.use) expect(layout.spots[def.use], `${def.item} spot`).toBeTruthy()
      }
    })

    it(`${lodging}: left where it starts, a piece doesn't move`, () => {
      for (const def of defs) {
        const size = STARTER_SIZE[def.item]!
        const seed = starterSeedSpot(spec, def)
        const move = starterMove(spec, size, def, seed)
        const [x, z] = move.point(1.234, -2.5)
        expect(x).toBeCloseTo(1.234, 6)
        expect(z).toBeCloseTo(-2.5, 6)
        expect(move.angle === 0 || Object.is(move.angle, -0)).toBe(true)
        // And it stays inside the room grid
        const r = pieceRect(spec, size, seed)
        expect(r[0]).toBeGreaterThanOrEqual(spec.ox - 1e-6)
        expect(r[1]).toBeGreaterThanOrEqual(spec.oz - 1e-6)
      }
    })
  }

  it('matches GLB object names and their numbered copies only', () => {
    const def = STARTERS['single-poultry']!.find((d) => d.item === 'starter-desk')!
    expect(starterOwnsNode(def, 'TableLeg')).toBe(true)
    expect(starterOwnsNode(def, 'TableLeg.003')).toBe(true)
    expect(starterOwnsNode(def, 'WoodChair')).toBe(true)
    expect(starterOwnsNode(def, 'TableLegX')).toBe(false)
    expect(starterOwnsNode(def, 'RedChair')).toBe(false)
  })

  it('a quarter turn moves the sitting spot around the piece', () => {
    const spec = HOME_GRID['single-poultry']!
    const def = STARTERS['single-poultry']!.find((d) => d.item === 'starter-red-chair')!
    const seed = starterSeedSpot(spec, def)
    const move = starterMove(spec, STARTER_SIZE[def.item]!, def, { ...seed, rot: 90 })
    // A point 1 m in front (+z) of the centre ends up 1 m to the −x side (FRONT[90] = [−1, 0])
    const [x, z] = move.point(move.from[0], move.from[1] + 1)
    expect(x).toBeCloseTo(move.to[0] - 1, 6)
    expect(z).toBeCloseTo(move.to[1], 6)
  })
})
