'use client'

import { useEffect, useMemo } from 'react'
import { BoxGeometry, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry, Matrix4, MeshBasicMaterial, MeshLambertMaterial, Object3D, type BufferGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CROWN_GREENS, Instances, shopGeometry } from '@/components/travel/drive-scene'
import { HALF, ROADS, ROAD_PLACES, spotAt, type Road, type RoadKind } from '@/lib/game/drive-road'
import { mulberry32 } from '@/lib/game/world-layout'

/*
 * What stands along the driving roads. Each kind of road has its own mix, and every stretch of
 * about 450 m (an "area") rolls its own favourite buildings and wall colours, so the expressway,
 * Ihumudumu and each cross street look like different parts of town:
 *   expressway      plazas, filling stations, shops, student lodges
 *   Ihumudumu road  zinc-roof bungalows, provision shops, kiosks, compound walls
 *   cross streets   student lodges, bungalows behind walls, a kiosk or two
 * Every building is a handful of boxes merged into one shape with baked colours; white parts take
 * the building's own wall colour. Each shape is drawn once for the whole town (shared copies).
 */

type Part = [w: number, h: number, d: number, x: number, y: number, z: number, color: string]

type Built = { geo: BufferGeometry; glow: BufferGeometry | null }

/**
 * Boxes merged into one shape with baked colours (front is +z, standing on the ground), plus the
 * shape's windows on their own: at night those are drawn again, glowing, a hair in front.
 * Two windows in three are lit, so no building is a solid block of light.
 */
function build(parts: Part[], extra: BufferGeometry[] = []): Built {
  const list: BufferGeometry[] = [...extra]
  const lit: BufferGeometry[] = []
  let windows = 0
  for (const [w, h, d, x, y, z, color] of parts) {
    const g = new BoxGeometry(w, h, d)
    g.translate(x, y, z)
    list.push(paint(g, color))
    if (color === GLASS && windows++ % 3 !== 1) {
      const pane = new BoxGeometry(w * 0.94, h * 0.9, d)
      pane.translate(x, y, z + 0.04)
      lit.push(pane.toNonIndexed())
      pane.dispose()
    }
  }
  const merged = mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)))!
  list.forEach((g) => g.dispose())
  const glow = lit.length ? mergeGeometries(lit)! : null
  lit.forEach((g) => g.dispose())
  return { geo: merged, glow }
}

function paint(g: BufferGeometry, color: string) {
  const c = new Color(color)
  const n = g.getAttribute('position').count
  const colors = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3)
  g.setAttribute('color', new Float32BufferAttribute(colors, 3))
  g.deleteAttribute('uv')
  return g
}

const GLASS = '#33414c'
const WOOD = '#5f4a36'
const WHITE = '#ffffff'

/** A hip roof: a four-sided cone squashed to the house's shape. */
function hipRoof(w: number, d: number, h: number, y: number, color: string) {
  const g = new ConeGeometry(0.75, h, 4, 1)
  g.rotateY(Math.PI / 4)
  g.scale(w, 1, d)
  g.translate(0, y + h / 2, 0)
  return paint(g, color)
}

/** Zinc-roof bungalow with a small veranda. */
function bungalow(roof: string) {
  return build(
    [
      [10, 3.1, 8, 0, 1.55, -0.6, WHITE],
      [1.1, 2.1, 0.12, -1.2, 1.05, 3.42, WOOD],
      [1.6, 1.1, 0.12, 2.3, 1.75, 3.42, GLASS],
      [1.6, 1.1, 0.12, -3.6, 1.75, 3.42, GLASS],
      [10.4, 0.16, 2.2, 0, 2.9, 4.4, roof],
      [0.16, 2.9, 0.16, -4.8, 1.45, 5.3, '#d8d2c2'],
      [0.16, 2.9, 0.16, 4.8, 1.45, 5.3, '#d8d2c2'],
      [10.2, 0.25, 2.1, 0, 0.12, 4.4, '#b9b2a2'],
    ],
    [hipRoof(11.2, 9.4, 2.3, 3.1, roof)],
  )
}

/** Two-storey student lodge: balcony, railings, a row of doors and windows, water tank on top. */
function lodge() {
  const parts: Part[] = [
    [14, 6.4, 8, 0, 3.2, -1, WHITE],
    [14.3, 0.3, 8.3, 0, 6.55, -1, '#8a8f94'],
    [14, 0.18, 1.5, 0, 3.25, 3.7, '#cfc8b6'],
    [14, 0.08, 0.08, 0, 4.25, 4.4, '#30363c'],
    [14, 0.08, 0.08, 0, 3.75, 4.4, '#30363c'],
    [1.5, 1.2, 1.5, 4.6, 7.3, -2, '#1f2d3a'],
    [0.2, 6.4, 0.2, -6.9, 3.2, 4.3, '#cfc8b6'],
    [0.2, 6.4, 0.2, 6.9, 3.2, 4.3, '#cfc8b6'],
  ]
  for (const floor of [0, 1]) {
    for (let i = 0; i < 5; i++) {
      const x = -5.6 + i * 2.8
      parts.push([0.9, 2, 0.1, x - 0.5, floor * 3.3 + 1.05, 3.02, WOOD])
      parts.push([0.9, 0.9, 0.1, x + 0.7, floor * 3.3 + 1.75, 3.02, GLASS])
    }
  }
  return build(parts)
}

/** Three-storey shopping plaza: glass shopfronts, a coloured sign band, long window strips above. */
function plaza(band: string) {
  return build([
    [16, 9.6, 9, 0, 4.8, -1, WHITE],
    [16.3, 0.35, 9.3, 0, 9.75, -1, '#7d8287'],
    [15, 2.3, 0.14, 0, 1.3, 3.55, GLASS],
    [16.2, 0.9, 0.5, 0, 3.05, 3.7, band],
    [14.4, 1.2, 0.12, 0, 5.05, 3.53, GLASS],
    [14.4, 1.2, 0.12, 0, 7.75, 3.53, GLASS],
    [0.3, 2.5, 0.2, -5, 1.25, 3.6, WHITE],
    [0.3, 2.5, 0.2, 0, 1.25, 3.6, WHITE],
    [0.3, 2.5, 0.2, 5, 1.25, 3.6, WHITE],
    [16, 0.2, 1.6, 0, 0.1, 4.4, '#b9b2a2'],
  ])
}

/** A container kiosk with an awning and a counter. */
function kiosk() {
  return build([
    [3.4, 2.5, 2.4, 0, 1.25, 0, WHITE],
    [3.6, 0.12, 2.6, 0, 2.56, 0, '#5d6066'],
    [2.6, 1.1, 0.1, 0, 1.6, 1.22, GLASS],
    [3.8, 0.1, 1.5, 0, 2.3, 1.9, '#7d4038'],
    [2.8, 0.1, 0.5, 0, 1.0, 1.45, WOOD],
  ])
}

/** A stretch of compound wall with a gate, and the zinc roof of the house behind it showing over the top. */
function compound(gate: string) {
  return build(
    [
      [4.6, 2, 0.3, -4.2, 1, 3, WHITE],
      [4.6, 2, 0.3, 4.2, 1, 3, WHITE],
      [0.5, 2.5, 0.5, -1.75, 1.25, 3, WHITE],
      [0.5, 2.5, 0.5, 1.75, 1.25, 3, WHITE],
      [3.1, 2.1, 0.12, 0, 1.05, 3, gate],
      [9, 3, 6.5, 0, 1.5, -2.2, '#e9e2d0'],
    ],
    [hipRoof(10, 7.6, 2, 3, '#7f8990')],
  )
}

/** A filling station: flat canopy on four posts over two pumps, a small shop behind. */
function station() {
  return build([
    [13, 0.5, 8, 0, 5, 2.5, WHITE],
    [13.1, 0.5, 0.1, 0, 5, 6.52, '#8c3b33'],
    [0.4, 4.8, 0.4, -5, 2.4, 0, '#d8d2c2'],
    [0.4, 4.8, 0.4, 5, 2.4, 0, '#d8d2c2'],
    [0.4, 4.8, 0.4, -5, 2.4, 5, '#d8d2c2'],
    [0.4, 4.8, 0.4, 5, 2.4, 5, '#d8d2c2'],
    [0.8, 1.6, 0.6, -2.4, 0.8, 2.5, '#8c3b33'],
    [0.8, 1.6, 0.6, 2.4, 0.8, 2.5, '#8c3b33'],
    [3, 0.25, 1.4, -2.4, 0.12, 2.5, '#b9b2a2'],
    [3, 0.25, 1.4, 2.4, 0.12, 2.5, '#b9b2a2'],
    [9, 3.2, 4, 0, 1.6, -4.5, '#f1ede2'],
    [6, 1.6, 0.1, 0, 1.5, -2.46, GLASS],
  ])
}

/** The corner shops' glass front, for lighting at night (see shopGeometry in the ride scene). */
function shopGlow() {
  const g = new BoxGeometry(7.8, 1.7, 0.12)
  g.translate(0, 1.5, 2.56)
  const flat = g.toNonIndexed()
  g.dispose()
  return flat
}

/** A wooden power pole with a crossbar. */
function pole() {
  return build([
    [0.2, 7.4, 0.2, 0, 3.7, 0, '#5a4633'],
    [1.9, 0.14, 0.14, 0, 6.9, 0, '#5a4633'],
    [0.12, 0.3, 0.12, -0.8, 7.1, 0, '#9aa3ab'],
    [0.12, 0.3, 0.12, 0.8, 7.1, 0, '#9aa3ab'],
  ]).geo
}

type Kind = 'bungalowRust' | 'bungalowZinc' | 'bungalowGreen' | 'lodge' | 'plazaRed' | 'plazaBlue' | 'kiosk' | 'compoundGreen' | 'compoundBlack' | 'station' | 'shopA' | 'shopB'

/** [along the road, deep] */
const FOOT: Record<Kind, [number, number]> = {
  bungalowRust: [11.5, 11],
  bungalowZinc: [11.5, 11],
  bungalowGreen: [11.5, 11],
  lodge: [14.5, 10],
  plazaRed: [16.5, 10],
  plazaBlue: [16.5, 10],
  kiosk: [4, 4],
  compoundGreen: [13.5, 9],
  compoundBlack: [13.5, 9],
  station: [14, 14],
  shopA: [10, 9],
  shopB: [10, 9],
}

const MIX: Record<RoadKind, [Kind, number][]> = {
  highway: [['plazaRed', 3], ['plazaBlue', 3], ['lodge', 3], ['shopA', 2], ['shopB', 2], ['station', 0.8], ['compoundBlack', 1]],
  road: [['bungalowRust', 3], ['bungalowZinc', 2], ['shopA', 2], ['shopB', 2], ['kiosk', 2.5], ['compoundGreen', 2], ['lodge', 1.5]],
  street: [['lodge', 3], ['bungalowGreen', 2], ['bungalowZinc', 2], ['compoundGreen', 2], ['compoundBlack', 2], ['kiosk', 1.2], ['shopB', 0.8]],
}

/** Wall paints: weathered creams, greys and off-whites, with the odd faded colour. Each area picks four. */
const WALLS = ['#e8e2d4', '#d9d2c2', '#cfc8b8', '#e3ddd0', '#c9c3b6', '#dcd6ca', '#bfb9ad', '#ece7dc', '#d4cdbf', '#c4beb2', '#d8cdb8', '#c9ccc8', '#d6c7b4', '#bcc3c4'].map((c) => new Color(c))

/** How long one "area" is along a road (m): each has its own favourite buildings and colours. */
const AREA = 450

type Style = { pick: (roll: number) => Kind; walls: Color[]; gap: number; trees: number }

function areaStyle(road: Road, index: number, area: number): Style {
  const rand = mulberry32(9001 + index * 131 + area * 17)
  // Each area leans on two or three of its road's kinds and all but drops a couple
  const weights = MIX[road.kind].map(([kind, w]) => [kind, w * (0.15 + rand() * 1.9)] as [Kind, number])
  const total = weights.reduce((sum, [, w]) => sum + w, 0)
  const walls = Array.from({ length: 4 }, () => WALLS[Math.floor(rand() * WALLS.length)]!)
  return {
    walls,
    gap: 2 + rand() * 7,
    trees: 0.2 + rand() * 0.6,
    pick: (roll) => {
      let left = roll * total
      for (const [kind, w] of weights) {
        left -= w
        if (left <= 0) return kind
      }
      return weights[0]![0]
    },
  }
}

/** Distance from a point to the nearest road other than `skip`, less that road's half-width. */
function clearOfRoads(x: number, z: number, skip: Road) {
  let best = Infinity
  for (const road of ROADS) {
    if (road === skip) continue
    for (let i = 0; i < road.pts.length; i++) {
      const d = Math.hypot(road.pts[i]![0] - x, road.pts[i]![1] - z) - HALF[road.kind]
      if (d < best) best = d
    }
  }
  return best
}

const KINDS = Object.keys(FOOT) as Kind[]

/** Everything along both sides of every road, leaving room at junctions and at our places. `night`: windows are lit. */
export function Roadside({ night }: { night: boolean }) {
  const kit = useMemo(() => {
    const rand = mulberry32(2718)
    const dummy = new Object3D()
    const put: Record<Kind, { m: Matrix4[]; c: Color[] }> = Object.fromEntries(KINDS.map((k) => [k, { m: [] as Matrix4[], c: [] as Color[] }])) as unknown as Record<Kind, { m: Matrix4[]; c: Color[] }>
    const crowns: Matrix4[] = []
    const crownColors: Color[] = []
    const trunks: Matrix4[] = []
    const poles: Matrix4[] = []
    ROADS.forEach((road, index) => {
      const edge = HALF[road.kind] + (road.kind === 'highway' ? 2.4 : 3.2)
      for (const side of [-1, 1]) {
        const reserved = ROAD_PLACES.filter((p) => p.road === road.id && p.side === side).map((p) => p.s)
        let s = 4
        while (s < road.length - 6) {
          const style = areaStyle(road, index, Math.floor(s / AREA))
          const kind = style.pick(rand())
          const [along, deep] = FOOT[kind]
          const jitter = kind === 'kiosk' || kind === 'station' ? 1 : 0.92 + rand() * 0.16
          const mid = s + (along * jitter) / 2
          const spot = spotAt(road.id, mid, side * (edge + 1.5 + (deep * jitter) / 2))
          if (!reserved.some((r) => Math.abs(r - mid) < 22) && clearOfRoads(spot.x, spot.z, road) > deep * 0.75 + 3) {
            dummy.position.set(spot.x, 0, spot.z)
            // A building's front is its +z: face it at the road
            dummy.rotation.set(0, Math.atan2(spot.dz * side, -spot.dx * side), 0)
            dummy.scale.set(jitter, 1, jitter)
            dummy.updateMatrix()
            put[kind].m.push(dummy.matrix.clone())
            put[kind].c.push(style.walls[Math.floor(rand() * style.walls.length)]!)
          }
          // A tree on the verge, as often as this area likes
          if (rand() < style.trees) {
            const t = spotAt(road.id, s - 1.5, side * (edge - 0.4 + rand() * 0.8))
            if (clearOfRoads(t.x, t.z, road) > 3 && !reserved.some((r) => Math.abs(r - s) < 14)) {
              const k = 0.8 + rand() * 0.6
              dummy.rotation.set(0, rand() * 6, 0)
              dummy.scale.set(k, k, k)
              dummy.position.set(t.x, 3.3 * k, t.z)
              dummy.updateMatrix()
              crowns.push(dummy.matrix.clone())
              crownColors.push(CROWN_GREENS[Math.floor(rand() * CROWN_GREENS.length)]!)
              dummy.position.set(t.x, 1.1 * k, t.z)
              dummy.updateMatrix()
              trunks.push(dummy.matrix.clone())
            }
          }
          s += along * jitter + style.gap * (0.5 + rand())
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
    return {
      put,
      crowns,
      crownColors,
      trunks,
      poles,
      painted: new MeshLambertMaterial({ vertexColors: true }),
      // Fluorescent tubes behind the glass
      glowMat: new MeshBasicMaterial({ color: '#fff3c4', toneMapped: false }),
      built: {
        bungalowRust: bungalow('#7a4a3a'),
        bungalowZinc: bungalow('#8d949a'),
        bungalowGreen: bungalow('#5f666c'),
        lodge: lodge(),
        plazaRed: plaza('#7c2f2a'),
        plazaBlue: plaza('#2b3f66'),
        kiosk: kiosk(),
        compoundGreen: compound('#2c4a3a'),
        compoundBlack: compound('#23262b'),
        station: station(),
        shopA: { geo: shopGeometry('#7a4a3a'), glow: shopGlow() },
        shopB: { geo: shopGeometry('#5d6b78'), glow: shopGlow() },
      } as Record<Kind, Built>,
      poleGeo: pole(),
      crownGeo: new IcosahedronGeometry(2, 0),
      trunkGeo: new CylinderGeometry(0.22, 0.3, 2.2, 5),
      crownMat: new MeshLambertMaterial({ flatShading: true }),
      trunkMat: new MeshLambertMaterial({ color: '#5b4330' }),
    }
  }, [])
  useEffect(
    () => () => {
      kit.painted.dispose()
      kit.glowMat.dispose()
      Object.values(kit.built).forEach((b) => {
        b.geo.dispose()
        b.glow?.dispose()
      })
      kit.poleGeo.dispose()
      kit.crownGeo.dispose()
      kit.trunkGeo.dispose()
      kit.crownMat.dispose()
      kit.trunkMat.dispose()
    },
    [kit],
  )
  return (
    <>
      {KINDS.map((kind) => (
        <Instances key={kind} geometry={kit.built[kind].geo} material={kit.painted} matrices={kit.put[kind].m} colors={kit.put[kind].c} />
      ))}
      {night ? KINDS.map((kind) => (kit.built[kind].glow ? <Instances key={`${kind}-lit`} geometry={kit.built[kind].glow!} material={kit.glowMat} matrices={kit.put[kind].m} /> : null)) : null}
      <Instances geometry={kit.poleGeo} material={kit.painted} matrices={kit.poles} />
      <Instances geometry={kit.crownGeo} material={kit.crownMat} matrices={kit.crowns} colors={kit.crownColors} />
      <Instances geometry={kit.trunkGeo} material={kit.trunkMat} matrices={kit.trunks} />
    </>
  )
}
