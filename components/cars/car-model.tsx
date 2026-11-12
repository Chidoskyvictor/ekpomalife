'use client'

import { useGLTF } from '@react-three/drei'
import { createContext, Suspense, useContext, useMemo } from 'react'
import {
  AdditiveBlending,
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
  type Mesh,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/*
 * Every car sold at Magmus Autos, in metres: front at +z, wheels on the ground, centred on x/z.
 * Corolla, Camry, ES350 and GLE are drawn here from a side outline, merged into one mesh;
 * the jeep, SUV and GT3 are the vertex-coloured GLBs in public/models/cars with their body
 * paint swapped for the chosen colour.
 */

type Pt = [number, number]

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

const GLB: Record<string, { url: string; length: number; paint: [number, number, number][] }> = {
  scout: { url: '/models/cars/jeep.glb?v=1', length: 4.1, paint: [[0.1, 0.15, 0.05], [0.05, 0.1, 0.05]] },
  suv: { url: '/models/cars/suv.glb?v=1', length: 5.0, paint: [[0.1, 0.1, 0.15], [0.05, 0.05, 0.1]] },
  gt3: { url: '/models/cars/gt3.glb?v=1', length: 4.6, paint: [[0.8, 0.8, 0.75]] },
}

export const isCarModel = (id: string) => id in SPECS || id in GLB

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
/** A drawn car as one vertex-coloured geometry. */
function procGeometry(id: string, color: string) {
  const key = `${id}|${color}`
  const hit = procCache.get(key)
  if (hit) return hit
  const s = SPECS[id]!
  const half = s.width / 2
  const front = Math.max(...s.body.map((p) => p[0]))
  const rear = Math.min(...s.body.map((p) => p[0]))
  const [ly, lh] = s.lights
  const chrome = '#d5d8dd'
  const parts: BufferGeometry[] = [
    outline(s.body, s.width, color),
    // Glass pokes just past the screens' slopes and the doors, so windows read dark from every side
    outline(s.glass.map(([z, y], i): Pt => [z + (i < 2 ? -0.15 : 0.15), y]), s.width + 0.03, '#141c24'),
    box([s.width * s.grille[0], s.grille[1], 0.1], [0, s.grille[2], front - 0.06], s.grilleColor ?? '#2a2d33'),
    // Bumpers, a shade darker than the paint
    box([s.width + 0.02, 0.16, 0.12], [0, s.body[0]![1] + 0.1, front - 0.04], '#1c1e22'),
    box([s.width + 0.02, 0.16, 0.12], [0, s.body[0]![1] + 0.1, rear + 0.04], '#1c1e22'),
  ]
  for (const side of [-1, 1]) {
    for (const z of s.wheels) {
      parts.push(wheel(s.wheelR, 0.24, [side * (half - 0.08), s.wheelR, z], '#111214'))
      parts.push(wheel(s.wheelR * 0.55, 0.26, [side * (half - 0.08), s.wheelR, z], '#b9bec6'))
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

function ProcCar({ id, color }: { id: string; color: string }) {
  const geometry = useMemo(() => procGeometry(id, color), [id, color])
  return <mesh geometry={geometry} material={vertexPaint} castShadow />
}

const vertexPaint = new MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 })

const near = (a: number, b: number) => Math.abs(a - b) < 0.04

const glbCache = new Map<string, BufferGeometry>()
/** The GLB as one geometry, sized to `length`, with its body paint vertices set to `color`. */
function glbGeometry(id: string, scene: import('three').Object3D, color: string) {
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
  const paint = new Color(color)
  const colors = merged.getAttribute('color')
  for (let i = 0; i < colors.count; i++) {
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
  glbCache.set(key, merged)
  return merged
}

function GlbCar({ id, color }: { id: string; color: string }) {
  const { scene } = useGLTF(GLB[id]!.url)
  const geometry = useMemo(() => glbGeometry(id, scene, color), [id, scene, color])
  return <mesh geometry={geometry} material={vertexPaint} castShadow />
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

/** Where a car's tail lamps are: [half the gap between them, height, the rear's z, lamp width, lamp height]. */
function tailLamps(id: string): [number, number, number, number, number] {
  const s = SPECS[id]
  if (s) {
    const rear = Math.min(...s.body.map((p) => p[0]))
    return [(s.width / 2) * 0.7, s.lights[0] + 0.06, rear + 0.03, (s.width / 2) * 0.46, s.lights[1]]
  }
  const length = GLB[id]?.length ?? 4.4
  return [0.62, id === 'gt3' ? 0.72 : 0.95, -length / 2 - 0.02, 0.36, 0.12]
}
const dentBox = new BoxGeometry(0.62, 0.3, 0.08)

/** Headlights on (dusk and night on the driving roads). Off by default: showroom, garage, street. */
export const CarLightsContext = createContext(false)
const headMaterial = new MeshBasicMaterial({ color: '#fff7d6', toneMapped: false })
/** The soft pool of light each car throws on the road ahead. */
const beamMaterial = new MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.32, depthWrite: false, blending: AdditiveBlending, toneMapped: false })
const beamPlane = new PlaneGeometry(2.6, 7).rotateX(-Math.PI / 2)

/** Where the headlights sit: the front of the body, as wide and high as the tail lamps. */
function headLamps(id: string): [number, number, number] {
  const s = SPECS[id]
  if (s) return [(s.width / 2) * 0.68, s.lights[0] + 0.02, Math.max(...s.body.map((p) => p[0])) - 0.02]
  const length = GLB[id]?.length ?? 4.4
  return [0.62, id === 'gt3' ? 0.66 : 0.9, length / 2 + 0.02]
}

/** One car by catalogue id, painted `color`, with `dents` crumpled patches. Unknown ids draw nothing. */
export function CarModel({ id, color, dents = 0 }: { id: string; color: string; dents?: number }) {
  const body =
    id in SPECS ? (
      <ProcCar id={id} color={color} />
    ) : id in GLB ? (
      <Suspense fallback={null}>
        <GlbCar id={id} color={color} />
      </Suspense>
    ) : null
  if (!body) return null
  const [gap, y, z, w, h] = tailLamps(id)
  const lit = useContext(CarLightsContext)
  const [hx, hy, hz] = headLamps(id)
  return (
    <group>
      {body}
      {lit ? (
        <>
          <mesh geometry={tailBox} material={headMaterial} position={[-hx, hy, hz]} scale={[0.34, 0.14, 0.06]} />
          <mesh geometry={tailBox} material={headMaterial} position={[hx, hy, hz]} scale={[0.34, 0.14, 0.06]} />
          <mesh geometry={beamPlane} material={beamMaterial} position={[0, 0.06, hz + 3.6]} />
        </>
      ) : null}
      <mesh geometry={tailBox} material={tailMaterial} position={[-gap, y, z]} scale={[w, h, 0.08]} />
      <mesh geometry={tailBox} material={tailMaterial} position={[gap, y, z]} scale={[w, h, 0.08]} />
      {DENT_SPOTS.slice(0, dents).map(([x, y, z, turn], i) => (
        <mesh key={i} geometry={dentBox} material={dentMaterial} position={[x, y, z]} rotation={[0.2, turn, 0.15]} />
      ))}
    </group>
  )
}
