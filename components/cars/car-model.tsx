'use client'

import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { createContext, Suspense, useContext, useMemo, useRef, type MutableRefObject } from 'react'
import {
  AdditiveBlending,
  TextureLoader,
  SphereGeometry,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  type Group,
  type Material,
  type Mesh,
  type Object3D,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { seatFor } from '@/lib/game/car-seats'

/*
 * Every car sold at Magmus Autos, in metres: front at +z, wheels on the ground, centred on x/z.
 * Corolla, Camry, ES350 and GLE are drawn here from a side outline, merged into one mesh;
 * the jeep, SUV and GT3 are the vertex-coloured GLBs in public/models/cars with their body
 * paint swapped for the chosen colour.
 */

type Pt = [number, number]

/** What the car you drive tells its model every frame: the front wheels' angle, how far the wheels have turned, and the lamps. */
export type CarRig = { steer: number; spin: number; braking: boolean; reversing: boolean }

/** The wheel nodes of a real (GLB) car, by name; null when the model has none. */
function wheelNodes(root: Object3D) {
  const get = (n: string) => root.getObjectByName(n) ?? null
  const w = { fl: get('Wheel_FL'), fr: get('Wheel_FR'), rl: get('Wheel_RL'), rr: get('Wheel_RR') }
  return w.fl && w.fr && w.rl && w.rr ? w : null
}

type Spec = {
  width: number
  /** Body outline seen from the side, clockwise from the rear bumper bottom: [z, y]. */
  body: Pt[]
  /** Side windows + screens (drawn a hair wider than the body). */
  glass: Pt[]
  wheelR: number
  wheels: [number, number]
  /** Grille: [width share, height, y centre]. */
  grille: [number, number, number]
  grilleColor?: string
  /** Lights: [y, height]. */
  lights: [number, number]
  /** Extra chrome strip along the sill (Lexus) or roof rails (GLE). */
  rails?: number
  exhausts?: boolean
}

const SPECS: Record<string, Spec> = {
  // Small, upright, short boot
  corolla: {
    width: 1.72,
    body: [[-2.15, 0.3], [-2.2, 0.62], [-2.12, 0.98], [-1.55, 1.02], [-1.0, 1.44], [0.3, 1.46], [1.0, 0.98], [1.95, 0.86], [2.2, 0.62], [2.15, 0.3]],
    glass: [[-1.45, 1.03], [-0.98, 1.38], [0.26, 1.4], [0.9, 1.0]],
    wheelR: 0.31,
    wheels: [-1.32, 1.36],
    grille: [0.55, 0.16, 0.56],
    lights: [0.8, 0.12],
  },
  // Longer and lower, with a sweeping roof into a short high boot
  camry: {
    width: 1.84,
    body: [[-2.4, 0.3], [-2.46, 0.66], [-2.36, 1.04], [-1.95, 1.08], [-0.9, 1.43], [0.1, 1.44], [1.05, 0.96], [2.2, 0.8], [2.46, 0.58], [2.4, 0.3]],
    glass: [[-1.8, 1.09], [-0.88, 1.37], [0.06, 1.38], [0.94, 0.98]],
    wheelR: 0.33,
    wheels: [-1.5, 1.5],
    grille: [0.8, 0.26, 0.5],
    lights: [0.78, 0.1],
  },
  // Long bonnet, coupé roofline, big dark spindle grille and a chrome sill
  es350: {
    width: 1.87,
    body: [[-2.45, 0.3], [-2.5, 0.7], [-2.42, 1.0], [-2.0, 1.06], [-0.75, 1.42], [-0.05, 1.42], [0.85, 0.98], [2.25, 0.84], [2.5, 0.62], [2.45, 0.3]],
    glass: [[-1.82, 1.08], [-0.72, 1.36], [-0.08, 1.36], [0.75, 1.0]],
    wheelR: 0.34,
    wheels: [-1.5, 1.55],
    grille: [0.62, 0.42, 0.56],
    grilleColor: '#0b0c0e',
    lights: [0.86, 0.08],
    rails: 0.36,
  },
  // Tall coupé-SUV: high waist, fastback tail, big wheels, twin exhausts
  gle43: {
    width: 2.0,
    body: [[-2.35, 0.42], [-2.42, 0.9], [-2.3, 1.3], [-1.9, 1.42], [-0.7, 1.76], [0.25, 1.76], [0.95, 1.22], [2.2, 1.1], [2.44, 0.8], [2.38, 0.42]],
    glass: [[-1.75, 1.42], [-0.7, 1.7], [0.2, 1.7], [0.85, 1.24]],
    wheelR: 0.42,
    wheels: [-1.45, 1.5],
    grille: [0.6, 0.34, 0.8],
    grilleColor: '#101114',
    lights: [1.04, 0.1],
    rails: 1.77,
    exhausts: true,
  },
}

type Rgb = [number, number, number]
/** `glass` lists the vertex colours of the windows: those triangles are drawn see-through so the driver shows. */
const GLB: Record<string, { url: string; length: number; paint: Rgb[]; glass: Rgb[] }> = {
  scout: { url: '/models/cars/jeep.glb?v=1', length: 4.1, paint: [[0.1, 0.15, 0.05], [0.05, 0.1, 0.05]], glass: [] },
  suv: { url: '/models/cars/suv.glb?v=1', length: 5.0, paint: [[0.1, 0.1, 0.15], [0.05, 0.05, 0.1]], glass: [] },
  gt3: { url: '/models/cars/gt3.glb?v=1', length: 4.6, paint: [[0.8, 0.8, 0.75]], glass: [] }, // GT3 keeps its tinted (opaque) glass
}

/**
 * Real, textured car models (public/models/cars, see brand/cars/CREDITS.md). Drawn with their own
 * materials; only the `paint` materials take the chosen colour. Built in metres, front at +z,
 * wheels on the ground, wheels as their own nodes (Wheel_FL/FR/RL/RR).
 */
const REAL: Record<string, { url: string; length: number; paint: string[]; glass: string[]; tail: [number, number, number, number] }> = {
  rx350: { url: '/models/cars/lexus-rx.glb?v=1', length: 4.89, paint: ['Material_1.003', 'Material_3.003'], glass: ['Material_5.003', 'Material_20'], tail: [0.68, 1.02, 0.3, 0.1] },
  gla: { url: '/models/cars/benz-gla.glb?v=1', length: 4.4, paint: ['Carro_Pintura'], glass: ['Carro_Vidros', 'Carro_Vidros_1'], tail: [0.7, 0.98, 0.26, 0.1] },
}
for (const r of Object.values(REAL)) useGLTF.preload(r.url)

export const isCarModel = (id: string) => id in SPECS || id in GLB || id in REAL

/** A geometry with every vertex painted one colour (so a whole car merges into one draw). */
function tinted(g: BufferGeometry, color: string, k = 1) {
  const flat = g.index ? g.toNonIndexed() : g
  if (flat !== g) g.dispose()
  flat.deleteAttribute('uv')
  const c = new Color(color)
  const n = flat.getAttribute('position').count
  const out = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) out.set([c.r * k, c.g * k, c.b * k], i * 3)
  flat.setAttribute('color', new Float32BufferAttribute(out, 3))
  return flat
}

function outline(points: Pt[], width: number, color: string) {
  const shape = new Shape()
  points.forEach(([z, y], i) => (i === 0 ? shape.moveTo(z, y) : shape.lineTo(z, y)))
  shape.closePath()
  const g = new ExtrudeGeometry(shape, { depth: width, bevelEnabled: false })
  g.rotateY(-Math.PI / 2) // outline x → car z; extrusion → −x
  g.translate(width / 2, 0, 0)
  return tinted(g, color)
}

function box(size: [number, number, number], at: [number, number, number], color: string) {
  const g = new BoxGeometry(...size)
  g.translate(...at)
  return tinted(g, color)
}

function wheel(r: number, w: number, at: [number, number, number], color: string) {
  const g = new CylinderGeometry(r, r, w, 12)
  g.rotateZ(Math.PI / 2)
  g.translate(...at)
  return tinted(g, color)
}

const procCache = new Map<string, BufferGeometry>()
const glassCache = new Map<string, BufferGeometry>()
/** A drawn car's windows: a see-through shell over the cabin, so the people inside show. */
function glassGeometry(id: string) {
  const hit = glassCache.get(id)
  if (hit) return hit
  const s = SPECS[id]!
  const g = outline(s.glass.map(([z, y], i): Pt => [z + (i < 2 ? -0.15 : 0.15), y]), s.width - 0.06, '#9fb4c4')
  glassCache.set(id, g)
  return g
}

/** A drawn car's body (opaque) as one vertex-coloured geometry: sills and bonnet, roof, pillars, seats and wheel. */
function procGeometry(id: string, color: string, wheels = true) {
  const key = `${id}|${color}|${wheels ? 1 : 0}`
  const hit = procCache.get(key)
  if (hit) return hit
  const s = SPECS[id]!
  const half = s.width / 2
  const front = Math.max(...s.body.map((p) => p[0]))
  const rear = Math.min(...s.body.map((p) => p[0]))
  const [ly, lh] = s.lights
  const chrome = '#d5d8dd'
  const belt = s.glass[0]![1]
  // The body stops at the window line; the cabin above it is glass, a roof slab and thin pillars
  const lower = s.body.map(([z, y]): Pt => [z, Math.min(y, belt)])
  const [g0, g1, g2, g3] = s.glass as [Pt, Pt, Pt, Pt]
  const gz = [g0[0] - 0.15, g1[0] - 0.15, g2[0] + 0.15, g3[0] + 0.15]
  const seat = seatFor(id)
  const dark = '#23262b'
  const parts: BufferGeometry[] = [
    outline(lower, s.width, color),
    outline([[gz[1]! - 0.05, g1[1] - 0.03], [gz[1]! - 0.05, g1[1] + 0.07], [gz[2]! + 0.05, g2[1] + 0.07], [gz[2]! + 0.05, g2[1] - 0.03]], s.width, color),
    box([s.width * s.grille[0], s.grille[1], 0.1], [0, s.grille[2], front - 0.06], s.grilleColor ?? '#2a2d33'),
    // Bumpers, a shade darker than the paint
    box([s.width + 0.02, 0.16, 0.12], [0, s.body[0]![1] + 0.1, front - 0.04], '#1c1e22'),
    box([s.width + 0.02, 0.16, 0.12], [0, s.body[0]![1] + 0.1, rear + 0.04], '#1c1e22'),
    // Dashboard, a floor and the two front seats (the wheel is the driver's, on the left)
    box([s.width - 0.12, 0.3, 0.28], [0, belt - 0.15, g2[0] + 0.1], dark),
    box([s.width - 0.1, 0.05, Math.abs(g3[0] - g0[0])], [0, belt - 0.3, (g0[0] + g3[0]) / 2], dark),
  ]
  for (const side of [-1, 1]) {
    const sx = side * seat.driver[0]
    parts.push(box([0.42, 0.1, 0.46], [sx, seat.driver[1] + 0.12, seat.driver[2] + 0.05], dark))
    parts.push(box([0.42, 0.5, 0.1], [sx, seat.driver[1] + 0.4, seat.driver[2] - 0.2], dark))
    // Pillars at the corners of the glass, in body paint, a hair proud of the glass
    for (const [a, b] of [[g0, g1], [g2, g3]] as [Pt, Pt][]) {
      const rearSide = a === g0
      const dz = rearSide ? -0.15 : 0.15
      parts.push(
        outline([[a[0] + dz, a[1]], [a[0] + dz + 0.09, a[1]], [b[0] + dz + 0.09, b[1]], [b[0] + dz, b[1]]], 0.07, color).translate(side * (half - 0.04), 0, 0),
      )
    }
  }
  const wheelRing = new CylinderGeometry(0.17, 0.17, 0.035, 14, 1, true)
  wheelRing.rotateX(-1.1) // tilted toward the driver
  wheelRing.translate(seat.wheel[0], seat.wheel[1], seat.wheel[2])
  parts.push(tinted(wheelRing, '#15161a'))
  for (const side of [-1, 1]) {
    if (wheels) {
      for (const z of s.wheels) {
        parts.push(wheel(s.wheelR, 0.24, [side * (half - 0.08), s.wheelR, z], '#111214'))
        parts.push(wheel(s.wheelR * 0.55, 0.26, [side * (half - 0.08), s.wheelR, z], '#b9bec6'))
      }
    }
    parts.push(box([half * 0.42, lh, 0.16], [side * half * 0.72, ly, front - 0.2], '#fff8d8'))
    parts.push(box([half * 0.46, lh, 0.12], [side * half * 0.7, ly + 0.06, rear + 0.1], '#d01818'))
    if (s.rails) {
      // GLE: roof rails; ES350: chrome sill
      parts.push(s.exhausts ? box([0.05, 0.05, 1.5], [side * (half - 0.25), s.rails, -0.2], chrome) : box([0.04, 0.05, 2.6], [side * (half + 0.005), s.rails, 0], chrome))
    }
    if (s.exhausts) parts.push(box([0.26, 0.09, 0.1], [side * half * 0.55, 0.5, rear + 0.02], chrome))
  }
  const merged = mergeGeometries(parts)!
  parts.forEach((g) => g.dispose())
  procCache.set(key, merged)
  return merged
}

const glassPaint = new MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.6, transparent: true, opacity: 0.28, depthWrite: false })

/** Other cars (and the showroom) keep the dark, opaque tint: only your own car is see-through, so you can see yourself in it. */
const tintedGlass = new MeshStandardMaterial({ color: '#141c24', roughness: 0.3, metalness: 0.4 })

const wheelCache = new Map<string, BufferGeometry>()
/** One wheel on its own, centred on its axle (tyre, rim and a spoke bar so the spin shows). */
function wheelGeometry(id: string) {
  const hit = wheelCache.get(id)
  if (hit) return hit
  const r = SPECS[id]!.wheelR
  const parts = [wheel(r, 0.24, [0, 0, 0], '#111214'), wheel(r * 0.55, 0.26, [0, 0, 0], '#b9bec6'), box([0.27, r * 0.9, 0.07], [0, 0, 0], '#6b7079'), box([0.27, 0.07, r * 0.9], [0, 0, 0], '#6b7079')]
  const merged = mergeGeometries(parts)!
  parts.forEach((g) => g.dispose())
  wheelCache.set(id, merged)
  return merged
}

function ProcCar({ id, color, seeThrough, rig }: { id: string; color: string; seeThrough: boolean; rig?: MutableRefObject<CarRig> }) {
  const geometry = useMemo(() => procGeometry(id, color, !rig), [id, color, rig])
  const glass = useMemo(() => glassGeometry(id), [id])
  const wheels = useRef<(Group | null)[]>([])
  const spec = SPECS[id]!
  const half = spec.width / 2
  useFrame(() => {
    const r = rig?.current
    if (!r) return
    wheels.current.forEach((g, i) => {
      if (!g) return
      g.rotation.y = i < 2 ? r.steer : 0
      g.rotation.x = r.spin
    })
  })
  return (
    <>
      <mesh geometry={geometry} material={vertexPaint} castShadow />
      <mesh geometry={glass} material={seeThrough ? glassPaint : tintedGlass} renderOrder={seeThrough ? 2 : 0} />
      {rig
        ? // 0, 1: the front pair (they steer); 2, 3: the rear pair
          [spec.wheels[1], spec.wheels[1], spec.wheels[0], spec.wheels[0]].map((z, i) => (
            <group key={i} ref={(g) => void (wheels.current[i] = g)} position={[(i % 2 ? -1 : 1) * (half - 0.08), spec.wheelR, z]} rotation-order="YXZ">
              <mesh geometry={wheelGeometry(id)} material={vertexPaint} castShadow />
            </group>
          ))
        : null}
    </>
  )
}

const vertexPaint = new MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 })

const near = (a: number, b: number) => Math.abs(a - b) < 0.04

const glbCache = new Map<string, { body: BufferGeometry; glass: BufferGeometry | null }>()
/** The GLB as one geometry, sized to `length`, with its body paint vertices set to `color`. */
function glbGeometry(id: string, scene: import('three').Object3D, color: string): { body: BufferGeometry; glass: BufferGeometry | null } {
  const key = `${id}|${color}`
  const hit = glbCache.get(key)
  if (hit) return hit
  const spec = GLB[id]!
  scene.updateMatrixWorld(true)
  const parts: BufferGeometry[] = []
  scene.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    const src = mesh.geometry
    const g = new BufferGeometry()
    for (const name of ['position', 'normal', 'color']) {
      const attr = src.getAttribute(name)
      if (!attr) continue
      const size = name === 'color' ? 3 : attr.itemSize
      const out = new Float32Array(attr.count * size)
      for (let i = 0; i < attr.count; i++) {
        out[i * size] = attr.getX(i)
        out[i * size + 1] = attr.getY(i)
        out[i * size + 2] = attr.getZ(i)
      }
      g.setAttribute(name, new Float32BufferAttribute(out, size))
    }
    if (!g.getAttribute('color')) {
      g.setAttribute('color', new Float32BufferAttribute(new Float32Array(src.getAttribute('position').count * 3).fill(0.05), 3))
    }
    if (src.index) g.setIndex(src.index.clone())
    g.applyMatrix4(mesh.matrixWorld)
    parts.push(g.index ? g.toNonIndexed() : g)
  })
  const merged = mergeGeometries(parts)!
  parts.forEach((g) => g.dispose())
  const colors = merged.getAttribute('color')
  // Which vertices are window glass, read before the paint swap (their colours can sit close to the paint's)
  const glassFlag = new Uint8Array(colors.count)
  if (spec.glass.length) {
    for (let i = 0; i < colors.count; i++) {
      glassFlag[i] = spec.glass.some((c) => Math.abs(c[0] - colors.getX(i)) < 0.012 && Math.abs(c[1] - colors.getY(i)) < 0.012 && Math.abs(c[2] - colors.getZ(i)) < 0.012) ? 1 : 0
    }
  }
  const paint = new Color(color)
  for (let i = 0; i < colors.count; i++) {
    if (glassFlag[i]) continue
    const r = colors.getX(i)
    const g = colors.getY(i)
    const b = colors.getZ(i)
    const shade = spec.paint.findIndex((p) => near(p[0], r) && near(p[1], g) && near(p[2], b))
    if (shade < 0) continue
    const k = shade === 0 ? 1 : 0.6
    colors.setXYZ(i, paint.r * k, paint.g * k, paint.b * k)
  }
  merged.computeBoundingBox()
  const box = merged.boundingBox!
  const scale = spec.length / (box.max.z - box.min.z)
  merged.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2)
  merged.scale(scale, scale, scale)
  // Window triangles split off (every three vertices are one triangle) so they can be drawn see-through
  let out: { body: BufferGeometry; glass: BufferGeometry | null } = { body: merged, glass: null }
  if (spec.glass.length) {
    const colorAttr = merged.getAttribute('color')
    const pos = merged.getAttribute('position')
    const nor = merged.getAttribute('normal')
    const bodyV: number[] = []
    const bodyN: number[] = []
    const bodyC: number[] = []
    const glassV: number[] = []
    const glassN: number[] = []
    const glassC: number[] = []
    for (let t = 0; t < pos.count; t += 3) {
      const glass = glassFlag[t]! && glassFlag[t + 1]! && glassFlag[t + 2]!
      for (let k = t; k < t + 3; k++) {
        if (glass) {
          glassV.push(pos.getX(k), pos.getY(k), pos.getZ(k))
          glassN.push(nor.getX(k), nor.getY(k), nor.getZ(k))
          glassC.push(0.62, 0.72, 0.8)
        } else {
          bodyV.push(pos.getX(k), pos.getY(k), pos.getZ(k))
          bodyN.push(nor.getX(k), nor.getY(k), nor.getZ(k))
          bodyC.push(colorAttr.getX(k), colorAttr.getY(k), colorAttr.getZ(k))
        }
      }
    }
    const make = (v: number[], n: number[], c: number[]) => {
      const g = new BufferGeometry()
      g.setAttribute('position', new Float32BufferAttribute(v, 3))
      g.setAttribute('normal', new Float32BufferAttribute(n, 3))
      g.setAttribute('color', new Float32BufferAttribute(c, 3))
      return g
    }
    out = { body: make(bodyV, bodyN, bodyC), glass: glassV.length ? make(glassV, glassN, glassC) : null }
    merged.dispose()
  }
  glbCache.set(key, out)
  return out
}

function GlbCar({ id, color, seeThrough }: { id: string; color: string; seeThrough: boolean }) {
  const { scene } = useGLTF(GLB[id]!.url)
  const { body, glass } = useMemo(() => glbGeometry(id, scene, color), [id, scene, color])
  return (
    <>
      <mesh geometry={body} material={vertexPaint} castShadow />
      {glass ? <mesh geometry={glass} material={seeThrough ? glassPaint : tintedGlass} renderOrder={seeThrough ? 2 : 0} /> : null}
    </>
  )
}

const realCache = new Map<string, Object3D>()
function RealCar({ id, color, seeThrough, rig }: { id: string; color: string; seeThrough: boolean; rig?: MutableRefObject<CarRig> }) {
  const spec = REAL[id]!
  const { scene } = useGLTF(spec.url)
  const car = useMemo(() => {
    const key = `${id}|${color}|${seeThrough ? 1 : 0}`
    const hit = realCache.get(key)
    if (hit) return hit.clone(true)
    const root = scene.clone(true)
    const swapped = new Map<Material, Material>()
    root.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      const swap = (m: Material) => {
        const done = swapped.get(m)
        if (done) return done
        let out = m
        if (spec.paint.includes(m.name)) {
          const p = (m as MeshStandardMaterial).clone()
          p.map = null
          p.color = new Color(color)
          p.metalness = 0.45
          p.roughness = 0.28
          out = p
        } else if (spec.glass.includes(m.name)) {
          const g = (m as MeshStandardMaterial).clone()
          g.map = null
          g.color = new Color(seeThrough ? '#9fb4c8' : '#10161d')
          g.transparent = seeThrough
          g.opacity = seeThrough ? 0.25 : 1
          g.depthWrite = !seeThrough
          g.metalness = 0.4
          g.roughness = 0.12
          out = g
        }
        swapped.set(m, out)
        return out
      }
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material)
    })
    realCache.set(key, root)
    return root.clone(true)
  }, [id, scene, color, seeThrough, spec])
  const wheels = useMemo(() => {
    const w = wheelNodes(car)
    if (w) for (const n of Object.values(w)) n!.rotation.order = 'YXZ'
    return w
  }, [car])
  useFrame(() => {
    const r = rig?.current
    if (!r || !wheels) return
    wheels.fl!.rotation.set(r.spin, r.steer, 0)
    wheels.fr!.rotation.set(r.spin, r.steer, 0)
    wheels.rl!.rotation.x = r.spin
    wheels.rr!.rotation.x = r.spin
  })
  return <primitive object={car} />
}

/** Where dents show, in order: [x, y, z, turn]. Dark crumpled patches on the corners and doors. */
const DENT_SPOTS: [number, number, number, number][] = [
  [0.62, 0.62, 2.05, 0.5],
  [-0.9, 0.7, 0.4, Math.PI / 2],
  [-0.6, 0.62, -2.1, -0.5],
  [0.9, 0.7, -0.6, Math.PI / 2],
  [-0.62, 0.62, 2.05, -0.5],
  [0.9, 0.72, 0.9, Math.PI / 2],
  [0.6, 0.62, -2.1, 0.5],
  [-0.9, 0.72, -1.0, Math.PI / 2],
  [0, 0.95, 1.7, 0],
]
const dentMaterial = new MeshStandardMaterial({ color: '#2b2b2e', roughness: 1 })

/** Tail lamps: lit red, unaffected by the scene's light, so they glow at dusk and at night. */
const tailMaterial = new MeshBasicMaterial({ color: '#ff2a1f', toneMapped: false })
const tailBox = new BoxGeometry(1, 1, 1)
const reverseMaterial = new MeshBasicMaterial({ color: '#ffffff', toneMapped: false })

/** Where a car's tail lamps are: [half the gap between them, height, the rear's z, lamp width, lamp height]. */
function tailLamps(id: string): [number, number, number, number, number] {
  const s = SPECS[id]
  if (s) {
    const rear = Math.min(...s.body.map((p) => p[0]))
    return [(s.width / 2) * 0.7, s.lights[0] + 0.06, rear + 0.03, (s.width / 2) * 0.46, s.lights[1]]
  }
  const real = REAL[id]
  if (real) return [real.tail[0], real.tail[1], -real.length / 2 + 0.06, real.tail[2], real.tail[3]]
  const length = GLB[id]?.length ?? 4.4
  return [0.62, id === 'gt3' ? 0.72 : 0.95, -length / 2 - 0.02, 0.36, 0.12]
}
const dentBox = new BoxGeometry(0.62, 0.3, 0.08)

/** Headlights on (dusk and night on the driving roads). Off by default: showroom, garage, street. */
export const CarLightsContext = createContext(false)
const headMaterial = new MeshBasicMaterial({ color: '#fff7d6', toneMapped: false })
/** The soft pool of light each car throws on the road ahead. */
/** The light each headlamp throws on the road: Kenney's CC0 "cone" light mask (public/lights/lamp-pool.png). */
function beamTexture() {
  return typeof document === 'undefined' ? null : new TextureLoader().load('/lights/lamp-pool.png')
}
const headBulb = new SphereGeometry(1, 12, 8)
const beamMaterial = new MeshBasicMaterial({ map: beamTexture(), color: '#f4f8ff', transparent: true, opacity: 0.42, depthWrite: false, blending: AdditiveBlending, toneMapped: false })
const beamPlane = new PlaneGeometry(8, 15).rotateX(-Math.PI / 2)

/** Where the headlights sit: the front of the body, as wide and high as the tail lamps. */
function headLamps(id: string): [number, number, number] {
  const s = SPECS[id]
  if (s) return [(s.width / 2) * 0.68, s.lights[0] + 0.02, Math.max(...s.body.map((p) => p[0])) - 0.02]
  const real = REAL[id]
  if (real) return [0.62, real.tail[1] - 0.2, real.length / 2 - 0.04]
  const length = GLB[id]?.length ?? 4.4
  return [0.62, id === 'gt3' ? 0.66 : 0.9, length / 2 + 0.02]
}

/** One car by catalogue id, painted `color`, with `dents` crumpled patches. Unknown ids draw nothing. */
export function CarModel({ id, color, dents = 0, seeThrough = false, rig }: { id: string; color: string; dents?: number; /** Clear windows, for the car you are sitting in */ seeThrough?: boolean; /** Your own car: steering and spinning wheels, brake and reverse lights */ rig?: MutableRefObject<CarRig> }) {
  const body =
    id in SPECS ? (
      <ProcCar id={id} color={color} seeThrough={seeThrough} rig={rig} />
    ) : id in GLB ? (
      <Suspense fallback={null}>
        <GlbCar id={id} color={color} seeThrough={seeThrough} />
      </Suspense>
    ) : id in REAL ? (
      <Suspense fallback={null}>
        <RealCar id={id} color={color} seeThrough={seeThrough} rig={rig} />
      </Suspense>
    ) : null
  const tail = useMemo(() => (rig ? new MeshBasicMaterial({ color: '#5a0f0a', toneMapped: false }) : tailMaterial), [rig])
  const backup = useRef<Mesh[]>([])
  useFrame(() => {
    const r = rig?.current
    if (!r) return
    // Dim red running lamps; flaring bright red under the brake
    tail.color.set(r.braking ? '#ff1208' : '#5a0f0a').multiplyScalar(r.braking ? 1.8 : 1)
    for (const m of backup.current) if (m) m.visible = r.reversing
  })
  if (!body) return null
  const [gap, y, z, w, h] = tailLamps(id)
  const lit = useContext(CarLightsContext)
  const [hx, hy, hz] = headLamps(id)
  return (
    <group>
      {body}
      {lit ? (
        <>
          <mesh geometry={headBulb} material={headMaterial} position={[-hx, hy, hz]} scale={[0.15, 0.1, 0.07]} />
          <mesh geometry={headBulb} material={headMaterial} position={[hx, hy, hz]} scale={[0.15, 0.1, 0.07]} />
          <mesh geometry={beamPlane} material={beamMaterial} position={[0, 0.06, hz + 8]} />
        </>
      ) : null}
      <mesh geometry={tailBox} material={tail} position={[-gap, y, z]} scale={[w, h, 0.08]} />
      <mesh geometry={tailBox} material={tail} position={[gap, y, z]} scale={[w, h, 0.08]} />
      {rig
        ? [-1, 1].map((side, i) => (
            // White reversing lamps, low and inboard of the tail lamps
            <mesh key={side} ref={(m) => void (backup.current[i] = m as Mesh)} geometry={tailBox} material={reverseMaterial} position={[side * gap * 0.55, y - h * 0.9, z - 0.02]} scale={[w * 0.5, h * 0.8, 0.08]} visible={false} />
          ))
        : null}
      {DENT_SPOTS.slice(0, dents).map(([x, y, z, turn], i) => (
        <mesh key={i} geometry={dentBox} material={dentMaterial} position={[x, y, z]} rotation={[0.2, turn, 0.15]} />
      ))}
    </group>
  )
}
