import { describe, expect, it } from 'vitest'
import { DEAD_ENDS, HALF, MID_LANE, ROAD_DIMS, SCENE_ROADS, drivable, roadById, spotAt, surfaceAt } from './drive-road'
import { buildRoadChunks } from './road-mesh'

describe('road surfaces', () => {
  it('lays out three lanes each way on the highway, ending at the carriageway edge', () => {
    for (const k of ['highway', 'road', 'street'] as const) {
      const d = ROAD_DIMS[k]
      expect(d.inner + d.lane * d.lanes).toBeCloseTo(HALF[k], 1)
    }
    expect(ROAD_DIMS.highway.lanes).toBe(3)
    expect(MID_LANE.highway).toBeCloseTo(ROAD_DIMS.highway.inner + 1.5 * ROAD_DIMS.highway.lane, 5)
  })

  it('builds chunked buffers whose indices are valid', { timeout: 60_000 }, () => {
    const t0 = performance.now()
    const chunks = buildRoadChunks(SCENE_ROADS)
    console.log('build ms', Math.round(performance.now() - t0), 'chunks', chunks.size, 'tris', [...chunks.values()].reduce((n, c) => n + (c.slab.idx.length + c.solid.idx.length + c.line.idx.length) / 3, 0))
    expect(chunks.size).toBeGreaterThan(20)
    for (const c of chunks.values()) {
      for (const b of [c.slab, c.solid, c.line]) {
        const n = b.pos.length / 3
        expect(b.nor.length === b.pos.length && b.col.length === b.pos.length && b.uv.length / 2 === n).toBe(true)
        expect(b.idx.every((i) => i < n)).toBe(true)
      }
    }
  })

  it('closes unbuilt ends with a wall before the end, and keeps joined ends open', () => {
    expect(DEAD_ENDS.length).toBeGreaterThan(0)
    for (const e of DEAD_ENDS.slice(0, 40)) {
      const road = roadById(e.road)
      const p = spotAt(e.road, e.end === 'start' ? 3 : road.length - 3, 0)
      expect(surfaceAt(p.x, p.z), `${e.road} ${e.end}`).toBe('wall')
      expect(drivable(p.x, p.z)).toBe(false)
    }
    // the expressway's middle is open
    const mid = spotAt('expressway', 3000, ROAD_DIMS.highway.lane * 2)
    expect(surfaceAt(mid.x, mid.z)).toBe('road')
  })
})
