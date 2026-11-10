'use client'

import { useEffect, useMemo } from 'react'
import { CanvasTexture, Group, Mesh, SRGBColorSpace } from 'three'
import { bakeStaticGroup, disposeBaked } from '@/components/world/bake-static'
import { paint, unitBox } from '@/components/world/materials'
import { CARS } from '@/lib/game/cars-rules'
import { CarModel } from './car-model'

/** Cars are modelled in metres; this shrinks them to the map's scale. */
export const CAR_MAP_SCALE = 0.4

function block(group: Group, size: [number, number, number], at: [number, number, number], color: string, rotZ = 0) {
  const mesh = new Mesh(unitBox, paint(color))
  mesh.scale.set(...size)
  mesh.position.set(...at)
  mesh.rotation.z = rotZ
  group.add(mesh)
}

const BUNTING = ['#e11d48', '#facc15', '#2563eb', '#16a34a', '#f97316', '#ffffff']

/** Laterite yard, a small office with a signboard, a zinc shade, bunting and feather flags. */
function buildLot(w: number, d: number) {
  const g = new Group()
  const hw = w / 2
  const hd = d / 2
  // Yard: red laterite with a paved strip under the shade
  block(g, [w, 0.08, d], [0, 0.04, 0], '#b8774f')
  block(g, [w - 0.4, 0.03, d - 0.4], [0, 0.09, 0], '#c98a5e')
  block(g, [w * 0.62, 0.03, d * 0.46], [w * 0.13, 0.1, -hd * 0.46], '#9aa0a6')

  // Office: cream block, green zinc roof, door, window, blue signboard on the roof
  const ox = -hw + 2.1
  const oz = -hd + 1.9
  block(g, [3, 1.5, 2.4], [ox, 0.85, oz], '#f1e6c8')
  block(g, [3.4, 0.14, 2.8], [ox, 1.67, oz], '#1f7a4a')
  block(g, [0.55, 1.0, 0.06], [ox - 0.7, 0.62, oz + 1.22], '#6b3f1d')
  block(g, [1.0, 0.55, 0.06], [ox + 0.6, 0.95, oz + 1.22], '#9fd0e8')
  block(g, [2.6, 0.55, 0.1], [ox, 2.1, oz + 1.0], '#1d4ed8')
  block(g, [2.3, 0.12, 0.12], [ox, 2.1, oz + 1.02], '#facc15')
  block(g, [0.08, 0.3, 0.08], [ox - 1.1, 1.85, oz + 1.0], '#374151')
  block(g, [0.08, 0.3, 0.08], [ox + 1.1, 1.85, oz + 1.0], '#374151')

  // Shade: zinc roof on six poles, sloping to the back. Shallow, so the cars' noses show from the road
  const sx = w * 0.13
  const sw = w * 0.6
  const sz = -hd * 0.62
  const sd = d * 0.2
  for (const px of [-1, 0, 1]) {
    block(g, [0.1, 2.2, 0.1], [sx + (px * sw) / 2, 1.1, sz + sd / 2], '#e5e7eb')
    block(g, [0.1, 2.0, 0.1], [sx + (px * sw) / 2, 1.0, sz - sd / 2], '#e5e7eb')
  }
  const roof = new Mesh(unitBox, paint('#d9dde2'))
  roof.scale.set(sw + 0.5, 0.07, sd + 0.6)
  roof.position.set(sx, 2.15, sz)
  roof.rotation.x = -0.11
  g.add(roof)
  const fascia = new Mesh(unitBox, paint('#1d4ed8'))
  fascia.scale.set(sw + 0.5, 0.2, 0.06)
  fascia.position.set(sx, 2.2, sz + sd / 2 + 0.3)
  g.add(fascia)

  // Bunting along the road side, on corner poles
  const fz = hd - 0.35
  block(g, [0.08, 2.0, 0.08], [-hw + 0.3, 1.0, fz], '#374151')
  block(g, [0.08, 2.0, 0.08], [hw - 0.3, 1.0, fz], '#374151')
  block(g, [w - 0.6, 0.025, 0.025], [0, 1.95, fz], '#374151')
  const n = Math.floor((w - 1) / 0.55)
  for (let i = 0; i < n; i++) {
    const x = -hw + 0.6 + i * ((w - 1.2) / (n - 1))
    block(g, [0.24, 0.24, 0.02], [x, 1.78, fz], BUNTING[i % BUNTING.length]!, Math.PI / 4)
  }
  // Feather flags by the entrance (green-white-green)
  for (const side of [-1, 1]) {
    const x = side * 1.6 - 2.2
    block(g, [0.05, 2.6, 0.05], [x, 1.3, fz - 0.5], '#e5e7eb')
    block(g, [0.42, 0.55, 0.03], [x + 0.24, 2.3, fz - 0.5], '#15803d')
    block(g, [0.42, 0.55, 0.03], [x + 0.24, 1.75, fz - 0.5], '#ffffff')
    block(g, [0.42, 0.55, 0.03], [x + 0.24, 1.2, fz - 0.5], '#15803d')
  }
  return g
}

/**
 * Magmus Autos on the map: an open tokunbo-style car lot. The four dearest cars stand under the
 * zinc shade, the other three out front angled at the road. Props are baked into a few draws
 * and every car is a single mesh.
 */
export function CarLot({ w, d }: { w: number; d: number }) {
  const baked = useMemo(() => bakeStaticGroup(buildLot(w, d)), [w, d])
  useEffect(() => () => disposeBaked(baked), [baked])
  const shadeX = w * 0.13
  const shadeW = w * 0.6
  const shaded = CARS.slice(3)
  const front = CARS.slice(0, 3)
  return (
    <group>
      <primitive object={baked} />
      {shaded.map((car, i) => (
        <group key={car.id} position={[shadeX - shadeW / 2 + (shadeW / shaded.length) * (i + 0.5), 0.12, -d * 0.2]} scale={CAR_MAP_SCALE * 1.1}>
          <CarModel id={car.id} color={car.color} />
        </group>
      ))}
      {front.map((car, i) => (
        <group key={car.id} position={[w * 0.02 + i * (w * 0.19), 0.1, d * 0.22]} rotation={[0, 0.5, 0]} scale={CAR_MAP_SCALE * 1.1}>
          <CarModel id={car.id} color={car.color} />
        </group>
      ))}
    </group>
  )
}

/** "model:#colour" as sent with each house. */
function parseCar(entry: string) {
  const [model, color] = entry.split(':')
  return { model: model ?? '', color: color ?? '#c9ccd1' }
}

function buildCarport(span: number) {
  const g = new Group()
  block(g, [span, 0.05, 2.3], [0, 0.03, 0], '#9aa0a6')
  // Roof over the back half only, so the cars' noses show from above
  for (const sx of [-1, 1]) {
    block(g, [0.07, 1.15, 0.07], [(sx * span) / 2 - sx * 0.05, 0.6, -0.05], '#e5e7eb')
    block(g, [0.07, 1.0, 0.07], [(sx * span) / 2 - sx * 0.05, 0.52, -1.1], '#e5e7eb')
  }
  const roof = new Mesh(unitBox, paint('#1f7a4a'))
  roof.scale.set(span + 0.25, 0.06, 1.35)
  roof.position.set(0, 1.15, -0.58)
  roof.rotation.x = -0.12
  g.add(roof)
  return g
}

const tagCache = new Map<number, CanvasTexture>()
/** "+N more" pill as a texture (a sprite, not drei <Html>: those must never mount/unmount on the map). */
function moreTexture(n: number) {
  let hit = tagCache.get(n)
  if (!hit) {
    const canvas = document.createElement('canvas')
    canvas.width = 192
    canvas.height = 64
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#111827'
    ctx.beginPath()
    ctx.roundRect(2, 2, 188, 60, 30)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = '700 34px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`+${n} more`, 96, 34)
    hit = new CanvasTexture(canvas)
    hit.colorSpace = SRGBColorSpace
    tagCache.set(n, hit)
  }
  return hit
}

/** A small zinc carport with up to two cars parked under it (the first is the one they drive). */
export function Carport({ cars, tag = 1 }: { cars: string[]; tag?: number }) {
  const shown = cars.slice(0, 2).map(parseCar)
  const span = shown.length > 1 ? 2.3 : 1.25
  const baked = useMemo(() => bakeStaticGroup(buildCarport(span)), [span])
  useEffect(() => () => disposeBaked(baked), [baked])
  return (
    <group>
      <primitive object={baked} />
      {shown.map((car, i) => (
        <group key={i} position={[shown.length > 1 ? (i - 0.5) * 1.1 : 0, 0.06, 0]} scale={CAR_MAP_SCALE}>
          <CarModel id={car.model} color={car.color} />
        </group>
      ))}
      {cars.length > 2 ? (
        <sprite position={[0, 1.55, 0.3]} scale={[1.5 * tag, 0.5 * tag, 1]}>
          <spriteMaterial map={moreTexture(cars.length - 2)} depthTest={false} />
        </sprite>
      ) : null}
    </group>
  )
}
