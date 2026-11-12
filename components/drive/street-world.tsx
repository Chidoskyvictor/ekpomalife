'use client'

import { useGLTF } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, type MutableRefObject } from 'react'
import {
  ACESFilmicToneMapping,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Matrix4,
  MeshLambertMaterial,
  Object3D,
  SRGBColorSpace,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
} from 'three'
import { ContextRestore } from '@/components/three/context-restore'
import {
  CROWN_GREENS,
  GATE_URL,
  HIGHWAY_URL,
  HW_PAINT,
  Instances,
  SHOP_TINTS,
  TINTS,
  shopGeometry,
  tiledBox,
  windowTexture,
} from '@/components/travel/drive-scene'
import { RideSky, rideLookAt, rideMinute } from '@/components/travel/ride-environment'
import { bakeStaticParts, type StaticPart } from '@/components/world/bake-static'
import type { Peer, PeerState } from '@/lib/game/club-live'
import type { DriveStart } from '@/lib/game/drive'
import {
  HALF,
  JUNCTIONS,
  ROADS,
  ROAD_PLACES,
  ROAD_SIGNS,
  TILE,
  TILE_STEP,
  blockedOnRoad,
  dividerOpen,
  drivable,
  pointAt,
  roadById,
  spotAt,
  type Road,
} from '@/lib/game/drive-road'
import { GFX, useGfxTier } from '@/lib/game/gfx-quality'
import { mulberry32 } from '@/lib/game/world-layout'
import { DriveCar, PeerCars, type DriveWorld } from './map-drive'
import { Roadside } from './street-buildings'
import { FinishBeam, RouteArrows, Traffic, Walkers, trafficBlocks } from './street-life'

/*
 * The street-level world you drive in. Its roads are real Ekpoma road lines (lib/game/drive-road.ts,
 * from OpenStreetMap). Only the Benin-Auchi expressway is the ride's dual carriageway (highway.glb,
 * laid piece by piece along the line, repainted with dark tarmac and a grass verge); the Ihumudumu
 * road and the cross streets are black asphalt drawn here: white edge lines, a dashed centre line,
 * laterite shoulders. Shops, flats and trees line them all, our places stand at their real spots,
 * and green signs name the junctions. Everything that repeats is drawn as shared copies, so the
 * whole town is a few dozen draw calls.
 */

// Kerbs, the divider and the ends of the roads stop the car; so do the other cars
const STREET_WORLD: DriveWorld = { unit: 2.5, carScale: 1, blocked: (x, z) => blockedOnRoad(x, z) || trafficBlocks(x, z), fast: drivable }

const highways = ROADS.filter((r) => r.kind === 'highway')
const asphalt = ROADS.filter((r) => r.kind !== 'highway')

/** The highway model's own colours, swapped for a cleaner look: dark tarmac, pale kerbs, grass down the middle. */
const HIGHWAY_PAINT: Record<string, string> = {
  ...HW_PAINT,
  HW_Road_Concrete: '#3f4245',
  HW_Road_Joint: '#3a3d40',
  HW_Red_Dirt: '#6f9a4e',
  HW_Concrete: '#d6d1c2',
  HW_Concrete_Side: '#bfb9a8',
  HW_Joint: '#b3ad9c',
  HW_Line_White: '#f4f1e4',
}

/** One matrix per piece of highway along a road. */
function tileMatrices(road: Road) {
  const all: Matrix4[] = []
  const dummy = new Object3D()
  const count = Math.max(1, Math.ceil((road.length - TILE) / TILE_STEP) + 1)
  for (let i = 0; i < count; i++) {
    const p = pointAt(road, Math.min(road.length, i * TILE_STEP + TILE / 2))
    // A piece runs along its own z; its -z end points the way the road runs
    dummy.position.set(p.x, i % 2 ? 0.004 : 0, p.z)
    dummy.rotation.set(0, Math.atan2(-p.dx, -p.dz), 0)
    dummy.updateMatrix()
    all.push(dummy.matrix.clone())
  }
  return all
}

/** Flat quads along a road from `from` to `to` metres right of its centre line, at height `y`. */
function ribbon(road: Road, from: number, to: number, y: number, s0 = 0, s1 = road.length, dash = 0, keep?: (s: number) => boolean) {
  const pos: number[] = []
  const step = 6
  const quad = (a: number, b: number) => {
    const p = pointAt(road, a)
    const q = pointAt(road, b)
    const corner = (pt: typeof p, off: number) => [pt.x - pt.dz * off, y, pt.z + pt.dx * off]
    const [a0, a1, b0, b1] = [corner(p, from), corner(p, to), corner(q, from), corner(q, to)]
    pos.push(...a0, ...a1, ...b0, ...a1, ...b1, ...b0) // wound to face up
  }
  for (let s = s0; s < s1 - 0.01; s += dash ? dash * 2 : step) {
    const e = Math.min(s1, s + (dash || step))
    if (!keep || keep((s + e) / 2)) quad(s, e)
  }
  return pos
}

/** An upright strip along a road, `off` metres right of its centre line, from the ground up to `h`. */
function fence(road: Road, off: number, h: number, keep: (s: number) => boolean, flip: boolean) {
  const pos: number[] = []
  for (let s = 0; s < road.length - 0.01; s += 6) {
    const e = Math.min(road.length, s + 6)
    if (!keep((s + e) / 2)) continue
    const p = pointAt(road, s)
    const q = pointAt(road, e)
    const a = [p.x - p.dz * off, p.z + p.dx * off]
    const b = [q.x - q.dz * off, q.z + q.dx * off]
    const quad = [a[0]!, 0, a[1]!, b[0]!, 0, b[1]!, a[0]!, h, a[1]!, a[0]!, h, a[1]!, b[0]!, 0, b[1]!, b[0]!, h, b[1]!]
    // Face outward on each side
    if (flip) for (let i = 0; i < 18; i += 9) pos.push(quad[i]!, quad[i + 1]!, quad[i + 2]!, quad[i + 6]!, quad[i + 7]!, quad[i + 8]!, quad[i + 3]!, quad[i + 4]!, quad[i + 5]!)
    else pos.push(...quad)
  }
  return pos
}

function geometryOf(pos: number[]) {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

function Highways({ level }: { level: 'day' | 'dusk' | 'night' }) {
  const { scene } = useGLTF(HIGHWAY_URL)
  const parts = useMemo(() => {
    const root = scene.clone(true)
    root.traverse((o) => {
      const mesh = o as Mesh
      const paint = mesh.isMesh && !Array.isArray(mesh.material) ? HIGHWAY_PAINT[mesh.material.name] : undefined
      if (!paint) return
      const m = (mesh.material as MeshStandardMaterial).clone()
      m.color.set(paint)
      mesh.material = m
    })
    // The model's own divider wall runs unbroken; ours (Divider) leaves gaps at the junctions
    root.getObjectByName('Median_Wall')?.removeFromParent()
    return bakeStaticParts(root)
  }, [scene])
  useEffect(
    () => () =>
      parts.forEach((part) => {
        part.geometry.dispose()
        if ((part.material as Material).userData.baked) (part.material as Material).dispose()
      }),
    [parts],
  )
  // Street lamps glow full at night, a little at dusk, barely by day
  useEffect(() => {
    for (const part of parts) {
      const mat = part.material as MeshStandardMaterial
      if (mat.name === 'HW_Lamp_Light' && 'emissiveIntensity' in mat) mat.emissiveIntensity = level === 'night' ? 8 : level === 'dusk' ? 4 : 0.6
    }
  }, [parts, level])
  const tiles = useMemo(() => highways.flatMap(tileMatrices), [])
  return (
    <>
      {parts.map((part: StaticPart, i) => (
        <Instances key={i} geometry={part.geometry} material={part.material} matrices={tiles} receive />
      ))}
    </>
  )
}

/** The highway's divider: a low concrete wall down the middle, open at every junction and at both ends. */
function Divider() {
  const kit = useMemo(() => {
    const pos: number[] = []
    for (const road of highways) {
      const closed = (s: number) => !dividerOpen(road, s)
      pos.push(...ribbon(road, -0.32, 0.32, 0.95, 0, road.length, 0, closed), ...fence(road, 0.32, 0.95, closed, false), ...fence(road, -0.32, 0.95, closed, true))
    }
    return { wall: geometryOf(pos), mat: new MeshLambertMaterial({ color: '#cfc9b8' }) }
  }, [])
  useEffect(
    () => () => {
      kit.wall.dispose()
      kit.mat.dispose()
    },
    [kit],
  )
  return <mesh geometry={kit.wall} material={kit.mat} />
}

/** How much of each end of an asphalt road lies on the road it meets (its own tarmac stops at that road's edge). */
function trims(road: Road) {
  let s0 = 0
  let s1 = road.length
  for (const j of JUNCTIONS) {
    if (j.street !== road.id) continue
    const reach = HALF[roadById(j.road).kind] - (roadById(j.road).kind === 'highway' ? 1.6 : 0.9)
    if (j.end === 'start') s0 = reach
    else s1 = road.length - reach
  }
  return [s0, s1] as const
}

/** Tarmac half-width, where the white edge line runs, and how far the laterite shoulder reaches. */
const ASPHALT = { road: { tar: 4.7, edge: 4.35, shoulder: 5.9 }, street: { tar: 3.4, edge: 3.1, shoulder: 4.5 } }

/** The Ihumudumu road and the cross streets: black asphalt, white edge lines, dashed centre line, grey concrete kerbs. */
function Asphalt() {
  const kit = useMemo(() => {
    const shoulder: number[] = []
    const tar: number[] = []
    const lines: number[] = []
    for (const road of asphalt) {
      const dims = ASPHALT[road.kind === 'road' ? 'road' : 'street']
      const [s0, s1] = trims(road)
      shoulder.push(...ribbon(road, -dims.shoulder, dims.shoulder, 0.02, s0, s1))
      tar.push(...ribbon(road, -dims.tar, dims.tar, 0.05, Math.max(0, s0 - 1.5), Math.min(road.length, s1 + 1.5)))
      lines.push(...ribbon(road, -dims.edge - 0.08, -dims.edge + 0.08, 0.065, s0, s1), ...ribbon(road, dims.edge - 0.08, dims.edge + 0.08, 0.065, s0, s1), ...ribbon(road, -0.08, 0.08, 0.065, s0 + 3, s1 - 3, 3))
    }
    return {
      shoulder: geometryOf(shoulder),
      tar: geometryOf(tar),
      lines: geometryOf(lines),
      shoulderMat: new MeshLambertMaterial({ color: '#8e9193' }),
      tarMat: new MeshLambertMaterial({ color: '#2b2d30' }),
      lineMat: new MeshLambertMaterial({ color: '#f1eedf' }),
    }
  }, [])
  useEffect(
    () => () => {
      kit.shoulder.dispose()
      kit.tar.dispose()
      kit.lines.dispose()
      kit.shoulderMat.dispose()
      kit.tarMat.dispose()
      kit.lineMat.dispose()
    },
    [kit],
  )
  return (
    <>
      <mesh geometry={kit.shoulder} material={kit.shoulderMat} />
      <mesh geometry={kit.tar} material={kit.tarMat} />
      <mesh geometry={kit.lines} material={kit.lineMat} />
    </>
  )
}

const boardCache = new Map<string, CanvasTexture>()
/** White words on a coloured board, with an optional small line under them. */
function boardTexture(text: string, color: string, small?: string) {
  const key = `${text}|${color}|${small ?? ''}`
  let hit = boardCache.get(key)
  if (!hit) {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 160
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 512, 160)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 6
    ctx.strokeRect(9, 9, 494, 142)
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    let size = 64
    do {
      ctx.font = `700 ${size}px system-ui, sans-serif`
      size -= 4
    } while (ctx.measureText(text).width > 460 && size > 24)
    ctx.fillText(text, 256, small ? 66 : 82)
    if (small) {
      ctx.font = '600 30px system-ui, sans-serif'
      ctx.fillText(small, 256, 122)
    }
    hit = new CanvasTexture(canvas)
    hit.colorSpace = SRGBColorSpace
    hit.anisotropy = 4
    boardCache.set(key, hit)
  }
  return hit
}

/** A board on two posts at the kerb, facing the traffic that comes along its side of the road. */
function Board({ road, s, side, text, color, small, back = 0 }: { road: string; s: number; side: number; text: string; color: string; small?: string; back?: number }) {
  const spot = spotAt(road, s, side * (HALF[spotAt(road, s, 0).road.kind] + 1.4 + back))
  // Cars on this side travel along (dx, dz) * side: the board looks back at them
  const yaw = Math.atan2(-spot.dx * side, -spot.dz * side)
  const map = boardTexture(text, color, small)
  return (
    <group position={[spot.x, 0, spot.z]} rotation={[0, yaw, 0]}>
      {[-1.9, 1.9].map((x) => (
        <mesh key={x} position={[x, 1.7, 0]}>
          <boxGeometry args={[0.14, 3.4, 0.14]} />
          <meshLambertMaterial color="#7a7f85" />
        </mesh>
      ))}
      <mesh position={[0, 3.6, 0.09]}>
        <planeGeometry args={[4.6, 1.44]} />
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
      <mesh position={[0, 3.6, 0]}>
        <boxGeometry args={[4.7, 1.54, 0.12]} />
        <meshLambertMaterial color="#0e3b22" />
      </mesh>
    </group>
  )
}

/** The AAU gate, set back on its side of the road and turned to face it. */
function Gate({ road, s, side }: { road: string; s: number; side: number }) {
  const { scene } = useGLTF(GATE_URL)
  const model = useMemo(() => scene.clone(true), [scene])
  const kind = spotAt(road, s, 0).road.kind
  const spot = spotAt(road, s, side * (HALF[kind] + 12))
  // Native model: 52 wide, front facing +z. Face the road, about 28 m along it.
  return <primitive object={model} position={[spot.x, 0, spot.z]} rotation={[0, Math.atan2(spot.dz * side, -spot.dx * side), 0]} scale={0.55} />
}

/** Our places at their real spots: a blue name board and a marked bay at the kerb to park in. */
function Places() {
  return (
    <>
      {ROAD_PLACES.filter((p) => !p.inside).map((p) => {
        const kind = spotAt(p.road, p.s, 0).road.kind
        const bay = spotAt(p.road, p.s, p.side * (HALF[kind] - 1.6))
        return (
          <group key={p.id}>
            <Board road={p.road} s={p.s - p.side * 9} side={p.side} text={p.label} color="#1d4ed8" small="P  Park here" back={0.6} />
            <mesh position={[bay.x, 0.2, bay.z]} rotation={[-Math.PI / 2, 0, Math.atan2(bay.dx, bay.dz)]}>
              <planeGeometry args={[2.6, 12]} />
              <meshBasicMaterial color="#2f7cf6" transparent opacity={0.45} depthWrite={false} />
            </mesh>
            {p.id === 'aau-gate' ? (
              <Suspense fallback={null}>
                <Gate road={p.road} s={p.s} side={p.side} />
              </Suspense>
            ) : null}
          </group>
        )
      })}
      {ROAD_SIGNS.map((sign) => (
        <Board key={`${sign.road}-${sign.s}`} road={sign.road} s={sign.s - sign.side * 26} side={sign.side} text={sign.text} color="#136b3a" />
      ))}
    </>
  )
}

export type StreetProps = {
  car: { model: string; color: string }
  start: DriveStart
  send: (state: PeerState) => void
  peers: MutableRefObject<Map<string, Peer>>
  roster: number
}

function Scene({ car, start, send, peers, roster }: StreetProps) {
  const tier = useGfxTier()
  // Light for the hour on the game clock, fixed for the drive
  const look = useMemo(() => rideLookAt(rideMinute()), [])
  const mid = useMemo(() => pointAt(ROADS[0]!, ROADS[0]!.length / 2), [])
  return (
    <>
      <RideSky look={look} tier={tier} />
      <hemisphereLight args={[look.hemiSky, look.hemiGround, look.hemiInt]} />
      <ambientLight intensity={look.ambient} />
      <directionalLight position={[look.lightDir.x * 120, look.lightDir.y * 120, look.lightDir.z * 120]} color={look.sunColor} intensity={look.sunInt} />
      <fog attach="fog" args={[look.horizon, 110, 420]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[mid.x, -0.05, mid.z]}>
        <planeGeometry args={[4200, 3000]} />
        <meshLambertMaterial color="#8f9a66" />
      </mesh>
      <Suspense fallback={null}>
        <Highways level={look.level} />
      </Suspense>
      <Divider />
      <Asphalt />
      <Roadside night={look.level !== 'day'} />
      <Places />
      <RouteArrows />
      <FinishBeam />
      <Traffic />
      <Suspense fallback={null}>
        <Walkers />
      </Suspense>
      <PeerCars peers={peers} roster={roster} scale={1} />
      <DriveCar car={car} start={start} send={send} world={STREET_WORLD} />
    </>
  )
}

/** The driving view's own canvas (quality follows the graphics tier, like the ride). */
export function StreetCanvas(props: StreetProps) {
  const tier = useGfxTier()
  const gfx = GFX[tier]
  return (
    <Canvas
      key={tier}
      dpr={gfx.dpr}
      gl={{ antialias: gfx.antialias, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false }}
      camera={{ position: [props.start.x, 4, props.start.z], fov: 58, near: 0.5, far: 460 }}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping
        gl.toneMappingExposure = 1
        gl.outputColorSpace = SRGBColorSpace
      }}
    >
      <ContextRestore />
      <Scene {...props} />
    </Canvas>
  )
}

useGLTF.preload(HIGHWAY_URL)
