'use client'

import { Suspense, useEffect, useMemo } from 'react'
import { BoxGeometry, Color, Float32BufferAttribute, MeshLambertMaterial, Object3D, type BufferGeometry, type Matrix4 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Instances } from '@/components/travel/drive-scene'
import { HALF, SCENE_ROADS as ROADS, ROAD_PLACES, roadsNear, spotAt, type Road } from '@/lib/game/drive-road'
import { mulberry32 } from '@/lib/game/world-layout'
import { LEAFY, PALMS, Trees, TREE_VARIANTS } from './street-trees'
import { Town } from './street-town'

/*
 * What stands along the driving roads. The buildings, lamps and landmarks are the streamed town
 * (street-town.tsx, fed by the Ekpoma kit in town-kit.ts and the real OpenStreetMap footprints);
 * what is left here are the roadside trees and the wooden power poles on the asphalt roads.
 */

type Part = [w: number, h: number, d: number, x: number, y: number, z: number, color: string]

function paint(g: BufferGeometry, color: string) {
  const c = new Color(color)
  const n = g.getAttribute('position').count
  const colors = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3)
  g.setAttribute('color', new Float32BufferAttribute(colors, 3))
  g.deleteAttribute('uv')
  return g
}

function merged(parts: Part[]): BufferGeometry {
  const list = parts.map(([w, h, d, x, y, z, color]) => {
    const g = new BoxGeometry(w, h, d)
    g.translate(x, y, z)
    return paint(g, color).toNonIndexed()
  })
  const geo = mergeGeometries(list)!
  list.forEach((g) => g.dispose())
  return geo
}

/** A wooden power pole with a crossbar. */
function pole() {
  return merged([
    [0.2, 7.4, 0.2, 0, 3.7, 0, '#5a4633'],
    [1.9, 0.14, 0.14, 0, 6.9, 0, '#5a4633'],
    [0.12, 0.3, 0.12, -0.8, 7.1, 0, '#9aa3ab'],
    [0.12, 0.3, 0.12, 0.8, 7.1, 0, '#9aa3ab'],
  ])
}

/** Distance from a point to the nearest road other than `skip`, less that road's half-width. */
function clearOfRoads(x: number, z: number, skip: Road) {
  let best = Infinity
  for (const road of roadsNear(x, z, 80)) {
    if (road === skip) continue
    for (let i = 0; i < road.pts.length; i++) {
      const d = Math.hypot(road.pts[i]![0] - x, road.pts[i]![1] - z) - HALF[road.kind]
      if (d < best) best = d
    }
  }
  return best
}

/** Roadside trees and power poles, and the streamed town. `level`: windows, signs and lamps light up at dusk and night. */
export function Roadside({ level }: { level: 'day' | 'dusk' | 'night' }) {
  const kit = useMemo(() => {
    const rand = mulberry32(2718)
    const dummy = new Object3D()
    const trees: Matrix4[][] = TREE_VARIANTS.map(() => [])
    const poles: Matrix4[] = []
    ROADS.forEach((road) => {
      const edge = HALF[road.kind] + (road.kind === 'highway' ? 2.4 : 3.2)
      for (const side of [-1, 1]) {
        const reserved = ROAD_PLACES.filter((p) => p.road === road.id && p.side === side).map((p) => p.s)
        // Trees are few: at least this far apart along a side
        let lastTree = -1e9
        for (let s = 4; s < road.length - 6; s += 12 + rand() * 12) {
          if (rand() < 0.2 && s - lastTree > 30) {
            const t = spotAt(road.id, s - 1.5, side * (edge - 0.4 + rand() * 0.8))
            if (clearOfRoads(t.x, t.z, road) > 3 && !reserved.some((r) => Math.abs(r - s) < 14)) {
              const pool = rand() < (road.kind === 'street' ? 0.3 : 0.55) ? PALMS : LEAFY
              const v = pool[Math.floor(rand() * pool.length)]!
              const k = 0.85 + rand() * 0.35
              dummy.rotation.set(0, rand() * 6, 0)
              dummy.scale.set(k, k, k)
              dummy.position.set(t.x, 0, t.z)
              dummy.updateMatrix()
              trees[v]!.push(dummy.matrix.clone())
              lastTree = s
            }
          }
        }
      }
      // Power poles down one side of the asphalt roads
      if (road.kind !== 'highway') {
        for (let s = 20; s < road.length - 10; s += 46) {
          const p = spotAt(road.id, s, edge - 1.1)
          if (clearOfRoads(p.x, p.z, road) < 2) continue
          dummy.position.set(p.x, 0, p.z)
          dummy.rotation.set(0, Math.atan2(p.dx, p.dz) + Math.PI / 2, 0)
          dummy.scale.set(1, 1, 1)
          dummy.updateMatrix()
          poles.push(dummy.matrix.clone())
        }
      }
    })
    return { trees, poles, painted: new MeshLambertMaterial({ vertexColors: true }), poleGeo: pole() }
  }, [])
  useEffect(
    () => () => {
      kit.painted.dispose()
      kit.poleGeo.dispose()
    },
    [kit],
  )
  return (
    <>
      <Town level={level} />
      <Instances geometry={kit.poleGeo} material={kit.painted} matrices={kit.poles} />
      <Suspense fallback={null}>
        <Trees byVariant={kit.trees} />
      </Suspense>
    </>
  )
}
