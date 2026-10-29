'use client'

import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LinearSRGBColorSpace,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type Material,
  type Matrix4,
  type PerspectiveCamera,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { TripRoute } from '@/lib/game/trip'
import { mulberry32 } from '@/lib/game/world-layout'
import { bakeStaticParts, type StaticPart } from '@/components/world/bake-static'

/*
 * The looping highway drive. highway.glb (60 long, two carriageways split by a median wall) is
 * repeated end to end and slid past a camera that stays put; because every piece is identical the
 * slide wraps with no join. Buildings and trees are simple matte shapes drawn as shared copies, in
 * the same wrapping strips, so the whole scene is a couple of dozen draw calls. Stand-in vehicles
 * and pedestrians are plain blocks until the real models are dropped in (PlayerVehicle, Walkers).
 *
 * Road layout (x): median wall at 0, red-dirt median to 2.8, our carriageway 2.8 to 10.6 with two
 * lanes, sidewalk 10.6 to 12.6. The oncoming carriageway mirrors it on the left, hidden behind the
 * wall except for tall vehicles. Cars only ever use the lanes; people use the median and sidewalk.
 */

export type DriveView = 'chase' | 'side' | 'inside'
export type DriveMode = 'keke' | 'okada'
export type DriveRoute = TripRoute

const HIGHWAY_URL = '/models/highway.glb'
const GATE_URL = '/models/aau_gate.glb'
/** Native length of one highway piece. */
const TILE = 60
const TILES = 8
/** The scenery strip repeats every two tiles. */
const STRIP = TILE * 2
const STRIPS = 4

/** Lane centres (x). We drive on the right: our lane is the one beside the median, traffic oncoming on the left. */
const LANE = { mine: 4.9, other: 8.7, oncoming: [-4.9, -8.7] }
/** Walkable concrete: the median beside the wall and the sidewalk on the right. */
const WALK = { median: 1.5, sidewalk: 11.3, top: 0.16 }
/** Where the road ends and roadside land starts. */
const ROAD_EDGE = 14.5

const SKY = '#bcd3e0'
const SPEED: Record<DriveMode, number> = { keke: 24, okada: 32 }
/** Campus lanes are slow and narrow. */
const CAMPUS_SPEED = 13
/** Campus road: half-width of the tarmac, and where the roadside land starts. */
const CAMPUS_ROAD = 3.5
const CAMPUS_EDGE = 5.4

/** Crossing the median to the gate: seconds, where the vehicle pulls up (x, in front of the gate), and half the gap's length. */
const TURN_S = 2.4
const TURN_X = -10.8
const GAP = 8
/** Where the gap sits relative to the gate along the road (the crossing happens this far before the gate). */
const GAP_AT = 11.5
/** Okada pulls up short of the gate and stops. */
const STOP_S = 1.6
/** The left side of the road stays clear this far either side of the gate. */
const GATE_CLEAR = 26
/** Gate-side coordinates: x of the gate, the concrete laid across the median and up the drive. */
const GATE_X = -(ROAD_EDGE + 0.8)
const CONCRETE = new Color().setRGB(0.4, 0.37, 0.31, LinearSRGBColorSpace)

useGLTF.preload(HIGHWAY_URL)

type Offset = { current: number }

/*
 * How a ride unfolds. The road slides past a vehicle that stays at z = 0; `offset` is how far it
 * has slid. Crossing campus is a lane with no gate. Going in, the vehicle turns left through a gap
 * in the median and pulls up in front of the gate: the turn is a quarter curve that eases the slide
 * and the sideways travel to a stop, so the vehicle ends level with the gate, facing it. The gate
 * is never driven through: the next thing after it is the interior of the place. Going out is the same curve run the other way, mirrored. Okada
 * can't enter, so it brakes beside the gate. All three park the gate on a spot that keeps the
 * median lamp posts (every 30, centred 15 off the gate) out of the gap.
 */
type Plan = {
  kind: 'road' | 'in' | 'out' | 'stop' | 'campus'
  speed: number
  /** Seconds into the ride when the turn (or the stop) begins */
  ts: number
  /** The gate stands at z = offset - passAt */
  passAt: number
  offset0: number
  /** Centre of the median gap relative to the gate (+ is back along the road), or none */
  gapAt: number | null
  /** The vehicle's lane (x) */
  lane: number
}

type Pose = { offset: number; rate: number; x: number; yaw: number }

function makePlan(mode: DriveMode, route: DriveRoute, plannedMs: number): Plan {
  const seconds = plannedMs / 1000
  if (route === 'inside') return { kind: 'campus', speed: CAMPUS_SPEED, ts: 0, passAt: 0, offset0: 0, gapAt: null, lane: 0 }
  const speed = SPEED[mode]
  const base = { speed, lane: LANE.mine }
  if (route === 'out' && mode === 'keke') return { ...base, kind: 'out', ts: 0, passAt: 15, offset0: 15, gapAt: -GAP_AT }
  if (route === 'in' && mode === 'okada') {
    const ts = Math.max(0.8, seconds - STOP_S - 0.4)
    return { ...base, kind: 'stop', ts, passAt: speed * ts + (speed * STOP_S) / 2, offset0: 0, gapAt: null }
  }
  if (route === 'in') {
    const d = (speed * TURN_S) / 2
    const raw = speed * Math.max(1, seconds - TURN_S - 0.6) + d
    const passAt = 15 + 30 * Math.max(1, Math.round((raw - 15) / 30))
    return { ...base, kind: 'in', ts: (passAt - d) / speed, passAt, offset0: 0, gapAt: GAP_AT }
  }
  return { ...base, kind: 'road', ts: 0, passAt: 0, offset0: 0, gapAt: null }
}

/** Smooth 0 to 1 with no speed at either end, and its slope. */
const ease = (u: number) => u * u * (3 - 2 * u)
const easeSlope = (u: number) => 6 * u * (1 - u)

/** Where the road, the vehicle and its heading are `time` seconds into the ride. */
function sample(plan: Plan, time: number, pose: Pose) {
  const { speed, lane } = plan
  const span = TURN_X - lane
  pose.x = lane
  pose.yaw = 0
  pose.rate = speed
  pose.offset = plan.offset0 + speed * time
  if (plan.kind === 'in') {
    if (time <= plan.ts) return
    const u = Math.min((time - plan.ts) / TURN_S, 1)
    pose.offset = speed * plan.ts + ((speed * TURN_S) / 2) * (2 * u - u * u)
    pose.rate = speed * (1 - u)
    pose.x = lane + span * ease(u)
    // Heading follows the path, then squares up to the gate as it comes to rest
    const v = Math.min(u, 0.999)
    const path = Math.atan2((-span * easeSlope(v)) / TURN_S, speed * (1 - v))
    pose.yaw = path + (Math.PI / 2 - path) * u * u * u
  } else if (plan.kind === 'out') {
    const u = Math.min(time / TURN_S, 1)
    const d = (speed * TURN_S) / 2
    if (u < 1) {
      pose.offset = 15 + d * u * u
      pose.rate = speed * u
      pose.x = lane + span * ease(1 - u)
      const v = Math.max(u, 0.001)
      const path = Math.atan2((span * easeSlope(1 - v)) / TURN_S, speed * v)
      const w = (1 - u) * (1 - u) * (1 - u)
      pose.yaw = path + (-Math.PI / 2 - path) * w
    } else {
      pose.offset = 15 + d + speed * (time - TURN_S)
    }
  } else if (plan.kind === 'stop') {
    if (time <= plan.ts) return
    const u = Math.min((time - plan.ts) / STOP_S, 1)
    pose.offset = speed * plan.ts + ((speed * STOP_S) / 2) * (2 * u - u * u)
    pose.rate = speed * (1 - u)
  }
}

/* —— instanced helper —— */

function Instances({
  geometry,
  material,
  matrices,
  colors,
}: {
  geometry: BufferGeometry
  material: Material
  matrices: Matrix4[]
  colors?: Color[]
}) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    matrices.forEach((m, i) => {
      mesh.setMatrixAt(i, m)
      if (colors?.[i]) mesh.setColorAt(i, colors[i]!)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [matrices, colors])
  if (matrices.length === 0) return null
  return <instancedMesh ref={ref} args={[geometry, material, matrices.length]} frustumCulled={false} />
}

/* —— highway —— */

function Highway({ offset, plan, gateZ }: { offset: Offset; plan: Plan; gateZ: Offset }) {
  const { scene } = useGLTF(HIGHWAY_URL)
  const group = useRef<Group>(null)
  const walls = useRef<(Mesh | null)[]>([])
  // The median wall is baked on its own so a gap can be opened in it for the gate
  const { parts, wall, zMin, zMax } = useMemo(() => {
    const root = scene.clone(true)
    const wallRoot = new Group()
    const node = root.getObjectByName('Median_Wall')
    root.updateMatrixWorld(true)
    if (node) wallRoot.attach(node)
    const wallParts = node ? bakeStaticParts(wallRoot) : []
    let lo = Infinity
    let hi = -Infinity
    for (const part of wallParts) {
      part.geometry.computeBoundingBox()
      lo = Math.min(lo, part.geometry.boundingBox!.min.z)
      hi = Math.max(hi, part.geometry.boundingBox!.max.z)
    }
    return { parts: bakeStaticParts(root), wall: wallParts, zMin: lo, zMax: hi }
  }, [scene])
  useEffect(
    () => () =>
      [...parts, ...wall].forEach((part) => {
        part.geometry.dispose()
        if ((part.material as Material).userData.baked) (part.material as Material).dispose()
      }),
    [parts, wall],
  )
  const matrices = useMemo(() => {
    const dummy = new Object3D()
    return Array.from({ length: TILES }, (_, i) => {
      dummy.position.set(0, 0, TILE * (2 - i))
      dummy.updateMatrix()
      return dummy.matrix.clone()
    })
  }, [])
  useFrame(() => {
    if (group.current) group.current.position.z = offset.current % TILE
    // The wall is two long stretches, with the gap between them following the gate
    const centre = plan.gapAt === null ? null : gateZ.current + plan.gapAt
    const ranges = centre === null ? [[-450, 90], null] : [[-450, centre - GAP], [centre + GAP, 90]]
    wall.forEach((_, i) =>
      ranges.forEach((range, s) => {
        const mesh = walls.current[i * 2 + s]
        if (!mesh) return
        mesh.visible = Boolean(range && range[1]! - range[0]! > 0.5)
        if (!range || !mesh.visible) return
        const scale = (range[1]! - range[0]!) / (zMax - zMin)
        mesh.scale.set(1, 1, scale)
        mesh.position.z = (range[0]! + range[1]!) / 2 - (scale * (zMin + zMax)) / 2
      }),
    )
  })
  return (
    <>
      <group ref={group}>
        {parts.map((part: StaticPart, i) => (
          <Instances key={i} geometry={part.geometry} material={part.material} matrices={matrices} />
        ))}
      </group>
      {wall.flatMap((part, i) =>
        [0, 1].map((s) => (
          <mesh
            key={`${i}-${s}`}
            ref={(mesh) => {
              walls.current[i * 2 + s] = mesh
            }}
            geometry={part.geometry}
            material={part.material}
            frustumCulled={false}
          />
        )),
      )}
    </>
  )
}

/** Concrete over the median where it opens, and the drive from the road to the gate. */
function GatePad({ plan, gateZ }: { plan: Plan; gateZ: Offset }) {
  const cross = useRef<Mesh>(null)
  const drive = useRef<Mesh>(null)
  useFrame(() => {
    if (cross.current && plan.gapAt !== null) cross.current.position.z = gateZ.current + plan.gapAt
    if (drive.current) drive.current.position.z = gateZ.current
  })
  return (
    <>
      {plan.gapAt !== null ? (
        <mesh ref={cross} position={[0, 0, 0]}>
          <boxGeometry args={[7.2, 0.07, GAP * 2]} />
          <meshLambertMaterial color={CONCRETE} />
        </mesh>
      ) : null}
      <mesh ref={drive} position={[GATE_X - 18, 0, 0]}>
        <boxGeometry args={[44, 0.07, 9]} />
        <meshLambertMaterial color={CONCRETE} />
      </mesh>
    </>
  )
}

/* —— the school gate, on the left, once —— */

/** AAU's gate (the same model as the map), passing by on the left of the road on trips onto campus. */
function SchoolGate({ plan, gateZ }: { plan: Plan; gateZ: Offset }) {
  const { scene } = useGLTF(GATE_URL)
  const group = useRef<Group>(null)
  const parts = useMemo(() => bakeStaticParts(scene.clone(true)), [scene])
  const matrices = useMemo(() => [new Object3D().matrix.clone()], [])
  useEffect(
    () => () =>
      parts.forEach((part) => {
        part.geometry.dispose()
        if ((part.material as Material).userData.baked) (part.material as Material).dispose()
      }),
    [parts],
  )
  useFrame(() => {
    const g = group.current
    if (g) {
      g.position.z = gateZ.current
      g.visible = gateZ.current < 70
    }
  })
  // Native model: 52 wide, front facing +z. Turn it to face the road (+x), scaled to ~28 along the road.
  return (
    <group ref={group} position={[GATE_X, 0, -plan.passAt]} rotation={[0, Math.PI / 2, 0]} scale={0.55}>
      {parts.map((part: StaticPart, i) => (
        <Instances key={i} geometry={part.geometry} material={part.material} matrices={matrices} />
      ))}
    </group>
  )
}

/* —— roadside: buildings and trees —— */

const CELL = { w: 4, h: 3.2 }

/** A box whose texture repeats at a fixed size in the world, so a taller block gets more window rows. */
function tiledBox(w: number, h: number, d: number) {
  const g = new BoxGeometry(w, h, d)
  const uv = g.attributes.uv!
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z, four vertices each
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]
  for (let face = 0; face < 6; face++) {
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v
      uv.setXY(i, (uv.getX(i) * dims[face]![0]) / CELL.w, (uv.getY(i) * dims[face]![1]) / CELL.h)
    }
  }
  g.translate(0, h / 2, 0)
  return g
}

/**
 * A corner-shop: a plain body, a dark glass front and door, and the zinc "pan" roof pushed out over
 * the front on posts, with a counter and crates under it. One small merged shape with vertex colours.
 */
function shopGeometry(pan: string) {
  const parts: BufferGeometry[] = []
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, color: string, tiltX = 0) => {
    const g = new BoxGeometry(w, h, d)
    if (tiltX) g.rotateX(tiltX)
    g.translate(x, y, z)
    const c = new Color(color)
    const count = g.attributes.position!.count
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new Float32BufferAttribute(colors, 3))
    parts.push(g)
  }
  add(10, 4.6, 7, 0, 2.3, -1, '#ffffff') // body (tinted per building)
  add(10.3, 0.3, 7.3, 0, 4.75, -1, '#85847d') // flat roof edge
  add(8.2, 1.9, 0.12, 0, 1.5, 2.5, '#3d4a52') // glass front
  add(1.5, 2.2, 0.16, -2.6, 1.1, 2.52, '#8a6a3c') // door
  add(10.8, 0.2, 3.6, 0, 3.6, 4.1, pan, 0.16) // the pan roof, sloping down toward the street
  for (const x of [-4.8, 0, 4.8]) add(0.18, 3.4, 0.18, x, 1.7, 5.7, '#6b5a45') // posts
  add(1.6, 0.8, 0.9, 3.7, 0.4, 3.5, '#9b7b4f') // counter
  add(0.8, 0.5, 0.8, 5, 0.25, 4.6, '#7b5a3a') // crate
  const merged = mergeGeometries(parts)!
  parts.forEach((g) => g.dispose())
  return merged
}

function windowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 128, 128)
  ctx.fillStyle = '#6f7f8a'
  ctx.fillRect(28, 26, 72, 74)
  ctx.fillStyle = '#9aa7b0'
  ctx.fillRect(28, 26, 72, 10)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 2
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  return texture
}

const TINTS = ['#f1e6d3', '#e6d3c0', '#d9e1e6', '#d4dcc9', '#ead9d0', '#cfd8dc'].map((c) => new Color(c))
const SHOP_TINTS = ['#ffffff', '#f6e7c8', '#ffe0c4', '#e8f0e0', '#f3d9c9'].map((c) => new Color(c))

type Place = { m: Matrix4; c: Color }
type Archetype = 'tower' | 'flats3' | 'flats2' | 'shopA' | 'shopB'
const ARCHETYPES: Archetype[] = ['tower', 'flats3', 'flats2', 'shopA', 'shopB']
/** [along the road, deep] */
const FOOTPRINT: Record<Archetype, [number, number]> = {
  tower: [12, 12],
  flats3: [12, 11],
  flats2: [11, 10],
  shopA: [10, 9],
  shopB: [10, 9],
}

type StripOptions = {
  /** Where the roadside land starts (x) */
  edge: number
  /** Campus lane: lecture blocks and thick trees, no shops or tower */
  campus: boolean
  /** Where the gate falls in the strip (z), or null with no gate */
  gateLocal: number | null
}

/**
 * One repeating strip of roadside. Ekpoma is low-rise: the front row is shops and two or three
 * storey blocks, a second row of low blocks sits behind, and only one tower stands in each strip.
 */
function makeStrip({ edge, campus, gateLocal }: StripOptions) {
  const rand = mulberry32(2718)
  // The left side stays open where the gate stands (strips repeat, so measure around the loop)
  const atGate = (side: number, zc: number) =>
    side === -1 && gateLocal !== null && Math.abs((((zc - gateLocal + STRIP / 2) % STRIP) + STRIP) % STRIP - STRIP / 2) < GATE_CLEAR
  const dummy = new Object3D()
  const buildings: Record<Archetype, Place[]> = { tower: [], flats3: [], flats2: [], shopA: [], shopB: [] }
  const crowns: Matrix4[] = []
  const trunks: Matrix4[] = []

  const put = (kind: Archetype, x: number, z: number, yaw: number, scale: number, color: Color) => {
    dummy.position.set(x, 0, z)
    dummy.rotation.set(0, yaw, 0)
    dummy.scale.set(scale, 1, scale)
    dummy.updateMatrix()
    buildings[kind].push({ m: dummy.matrix.clone(), c: color })
  }

  for (const side of [-1, 1]) {
    // +z of a building is its front: turn it to face the road
    const face = side === 1 ? -Math.PI / 2 : Math.PI / 2
    let z = 0
    while (z > -STRIP + 8) {
      const roll = rand()
      // On campus: lecture blocks only, no shops
      const kind: Archetype = campus
        ? roll < 0.5
          ? 'flats2'
          : 'flats3'
        : roll < 0.28
          ? 'shopA'
          : roll < 0.56
            ? 'shopB'
            : roll < 0.82
              ? 'flats2'
              : 'flats3'
      const [along, deep] = FOOTPRINT[kind]
      const jitter = 0.9 + rand() * 0.2
      const palette = kind === 'shopA' || kind === 'shopB' ? SHOP_TINTS : TINTS
      const colour = palette[Math.floor(rand() * palette.length)]!
      const zc = z - (along * jitter) / 2
      if (!atGate(side, zc)) put(kind, side * (edge + 2 + (deep * jitter) / 2), zc, face, jitter, colour)
      z -= along * jitter + (campus ? 5 : 2) + rand() * 4
    }
    // Second row: low blocks for depth
    for (let zb = -6; zb > -STRIP; zb -= 20 + rand() * 12) {
      const kind: Archetype = rand() < 0.5 ? 'flats2' : 'flats3'
      const x = edge + (campus ? 20 : 24) + rand() * 6
      const yaw = rand() < 0.5 ? face : face + Math.PI
      const colour = TINTS[Math.floor(rand() * TINTS.length)]!
      if (!atGate(side, zb)) put(kind, side * x, zb, yaw, 1.05, colour)
    }
    // Trees along the verge (thicker on campus)
    for (let zt = -4; zt > -STRIP; zt -= (campus ? 5 : 11) + rand() * (campus ? 4 : 7)) {
      if (rand() < 0.25 || atGate(side, zt)) continue
      const x = side * (edge - 0.4 + rand() * 0.8)
      const s = 0.8 + rand() * 0.5
      dummy.position.set(x, 3.3 * s, zt)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(s, s, s)
      dummy.updateMatrix()
      crowns.push(dummy.matrix.clone())
      dummy.position.set(x, 1.1 * s, zt)
      dummy.updateMatrix()
      trunks.push(dummy.matrix.clone())
    }
  }
  // The one tall building in this strip, well back from the road, on a random side (not the campus side)
  const side = rand() < 0.5 ? -1 : 1
  const towerColour = TINTS[Math.floor(rand() * TINTS.length)]!
  const towerZ = -30 - rand() * 50
  if (!campus) put('tower', (gateLocal === null ? side : 1) * (edge + 34), towerZ, rand() * Math.PI, 1, towerColour)
  return { buildings, crowns, trunks }
}

/** Copy a strip's matrices into `STRIPS` consecutive strips along -z. */
function repeatStrips(places: Matrix4[]) {
  const dummy = new Object3D()
  const out: Matrix4[] = []
  for (let strip = 0; strip < STRIPS; strip++) {
    for (const m of places) {
      dummy.matrix.copy(m)
      dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale)
      dummy.position.z += STRIP * (1 - strip)
      dummy.updateMatrix()
      out.push(dummy.matrix.clone())
    }
  }
  return out
}

function Roadside({ offset, edge, campus, gateLocal }: { offset: Offset } & StripOptions) {
  const group = useRef<Group>(null)
  const kit = useMemo(() => {
    const flats = new MeshLambertMaterial({ map: windowTexture() })
    const shop = new MeshLambertMaterial({ vertexColors: true })
    const geo: Record<Archetype, BufferGeometry> = {
      tower: tiledBox(12, 26, 12),
      flats3: tiledBox(12, 10, 11),
      flats2: tiledBox(11, 7, 10),
      shopA: shopGeometry('#a64b2a'),
      shopB: shopGeometry('#4f6f8c'),
    }
    const strip = makeStrip({ edge, campus, gateLocal })
    return {
      flats,
      shop,
      geo,
      crownGeo: new IcosahedronGeometry(2, 0),
      trunkGeo: new CylinderGeometry(0.22, 0.3, 2.2, 5),
      crownMat: new MeshLambertMaterial({ color: '#5f8f4f', flatShading: true }),
      trunkMat: new MeshLambertMaterial({ color: '#6b5238' }),
      places: ARCHETYPES.map((kind) => {
        const list = strip.buildings[kind]
        return {
          kind,
          matrices: repeatStrips(list.map((p) => p.m)),
          colors: Array.from({ length: STRIPS }).flatMap(() => list.map((p) => p.c)),
        }
      }),
      crowns: repeatStrips(strip.crowns),
      trunks: repeatStrips(strip.trunks),
    }
  }, [edge, campus, gateLocal])

  useEffect(
    () => () => {
      kit.flats.map?.dispose()
      kit.flats.dispose()
      kit.shop.dispose()
      Object.values(kit.geo).forEach((g) => g.dispose())
      kit.crownGeo.dispose()
      kit.trunkGeo.dispose()
      kit.crownMat.dispose()
      kit.trunkMat.dispose()
    },
    [kit],
  )

  useFrame(() => {
    if (group.current) group.current.position.z = offset.current % STRIP
  })

  return (
    <group ref={group}>
      {kit.places.map(({ kind, matrices, colors }) => (
        <Instances
          key={kind}
          geometry={kit.geo[kind]}
          material={kind === 'shopA' || kind === 'shopB' ? kit.shop : kit.flats}
          matrices={matrices}
          colors={colors}
        />
      ))}
      <Instances geometry={kit.crownGeo} material={kit.crownMat} matrices={kit.crowns} />
      <Instances geometry={kit.trunkGeo} material={kit.trunkMat} matrices={kit.trunks} />
    </group>
  )
}

/* —— vehicles (stand-ins) —— */

const BODY_COLORS = ['#c94f4f', '#3d6fb5', '#e8e2d0', '#4a4a4a', '#6aa36a', '#d9a441', '#8b5fa8', '#9aa3ab'].map((c) => new Color(c))
const DANFO = new Color('#f2c230')

type Car = {
  x: number
  z: number
  /** Units per second along the road in our direction (negative = oncoming). */
  ws: number
  w: number
  h: number
  l: number
  color: Color
}

/** Cars and danfos in the lanes, as two shared instanced meshes (bodies and cabins). */
function Traffic({ plan, rate }: { plan: Plan; rate: Offset }) {
  const bodies = useRef<InstancedMesh>(null)
  const cabins = useRef<InstancedMesh>(null)
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), [])
  const bodyMat = useMemo(() => new MeshLambertMaterial(), [])
  const cabinMat = useMemo(() => new MeshLambertMaterial({ color: '#2c353b' }), [])
  const dummy = useMemo(() => new Object3D(), [])

  const list = useMemo(() => {
    const rand = mulberry32(99)
    const make = (x: number, z: number, ws: number): Car => {
      const danfo = rand() < 0.3
      return danfo
        ? { x, z, ws, w: 2.1, h: 2.3, l: 5.2, color: DANFO }
        : { x, z, ws, w: 1.8, h: 1.35, l: 4.2, color: BODY_COLORS[Math.floor(rand() * BODY_COLORS.length)]! }
    }
    const speed = plan.speed
    const out: Car[] = []
    // Same direction, in the outer lane: slower than us, so we slowly overtake them
    for (let i = 0; i < 4; i++) out.push(make(LANE.other, -25 - i * 65 - rand() * 20, speed * (0.5 + rand() * 0.25)))
    // The go-slow ahead of us in our own lane keeps pace
    out.push(make(LANE.mine, -17, speed))
    // Oncoming on the other carriageway, mostly hidden behind the median wall; none where we cross it
    if (plan.gapAt === null) {
      LANE.oncoming.forEach((x, lane) => {
        for (let i = 0; i < 4; i++) out.push(make(x, -20 - i * 70 - lane * 30 - rand() * 20, -(14 + rand() * 12)))
      })
    }
    return out
  }, [plan])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const body = bodies.current
    const cabin = cabins.current
    if (!body || !cabin) return
    list.forEach((car, i) => {
      car.z += (rate.current - car.ws) * dt
      // Gone past the camera: come back in far ahead; pulled far ahead of a stopped us: come back behind
      if (car.z > 40) car.z -= 280 + (i % 5) * 9
      else if (car.z < -300) car.z += 330
      dummy.position.set(car.x, car.h / 2 + 0.1, car.z)
      dummy.scale.set(car.w, car.h * 0.6, car.l)
      dummy.updateMatrix()
      body.setMatrixAt(i, dummy.matrix)
      body.setColorAt(i, car.color)
      dummy.position.set(car.x, car.h * 0.6 + 0.1 + car.h * 0.2, car.z - car.l * 0.05)
      dummy.scale.set(car.w * 0.9, car.h * 0.4, car.l * (car.h > 2 ? 0.92 : 0.5))
      dummy.updateMatrix()
      cabin.setMatrixAt(i, dummy.matrix)
    })
    body.instanceMatrix.needsUpdate = true
    cabin.instanceMatrix.needsUpdate = true
    if (body.instanceColor) body.instanceColor.needsUpdate = true
  })

  useEffect(
    () => () => {
      geometry.dispose()
      bodyMat.dispose()
      cabinMat.dispose()
    },
    [geometry, bodyMat, cabinMat],
  )

  return (
    <>
      <instancedMesh ref={bodies} args={[geometry, bodyMat, list.length]} frustumCulled={false} />
      <instancedMesh ref={cabins} args={[geometry, cabinMat, list.length]} frustumCulled={false} />
    </>
  )
}

/* —— pedestrians (stand-ins) —— */

const SHIRTS = ['#d95f3b', '#3d6fb5', '#f0e3c0', '#5a9a5a', '#c94f8a', '#e0b13c', '#7a5fb0', '#2e3a46'].map((c) => new Color(c))
const SKINS = ['#8a5a3b', '#6b4226', '#a9744f', '#5a3a22'].map((c) => new Color(c))
const WALK_SPEED = 1.4

type Walker = { x: number; z: number; dir: 1 | -1; shirt: Color; skin: Color; phase: number }

/**
 * People on the sidewalk and the median, as three shared instanced meshes (legs, body, head).
 * Stand-ins for now: to use real characters, swap this for loaded models at the same spots.
 */
function Walkers({ rate, campus }: { rate: Offset; campus: boolean }) {
  const legs = useRef<InstancedMesh>(null)
  const torsos = useRef<InstancedMesh>(null)
  const heads = useRef<InstancedMesh>(null)
  const legGeo = useMemo(() => new CylinderGeometry(0.17, 0.15, 0.8, 6), [])
  const torsoGeo = useMemo(() => new CylinderGeometry(0.22, 0.2, 0.75, 6), [])
  const headGeo = useMemo(() => new SphereGeometry(0.15, 6, 5), [])
  const legMat = useMemo(() => new MeshLambertMaterial({ color: '#2b3340' }), [])
  const bodyMat = useMemo(() => new MeshLambertMaterial(), [])
  const dummy = useMemo(() => new Object3D(), [])

  const list = useMemo(() => {
    const rand = mulberry32(31)
    const out: Walker[] = []
    const add = (x: number, count: number, spread: number) => {
      for (let i = 0; i < count; i++) {
        out.push({
          x: x + (rand() - 0.5) * spread,
          z: -15 - rand() * 230,
          dir: rand() < 0.5 ? 1 : -1,
          shirt: SHIRTS[Math.floor(rand() * SHIRTS.length)]!,
          skin: SKINS[Math.floor(rand() * SKINS.length)]!,
          phase: rand() * 6,
        })
      }
    }
    if (campus) {
      // Footpaths on both sides of the lane
      add(-(CAMPUS_ROAD + 0.9), 14, 1.2)
      add(CAMPUS_ROAD + 0.9, 14, 1.2)
    } else {
      add(WALK.sidewalk, 12, 1.2)
      add(WALK.median, 8, 0.9)
    }
    return out
  }, [campus])
  const top = campus ? 0.03 : WALK.top

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05)
    const l = legs.current
    const t = torsos.current
    const h = heads.current
    if (!l || !t || !h) return
    list.forEach((p, i) => {
      // Walking the same way as us moves slower past us than the ground does; against us, faster
      p.z += (rate.current - p.dir * WALK_SPEED) * dt
      if (p.z > 40) p.z -= 270
      else if (p.z < -240) p.z += 270
      const bob = Math.abs(Math.sin(clock.elapsedTime * 5 + p.phase)) * 0.05
      dummy.scale.set(1, 1, 1)
      dummy.position.set(p.x, top + 0.4 + bob, p.z)
      dummy.updateMatrix()
      l.setMatrixAt(i, dummy.matrix)
      dummy.position.set(p.x, top + 0.8 + 0.375 + bob, p.z)
      dummy.updateMatrix()
      t.setMatrixAt(i, dummy.matrix)
      t.setColorAt(i, p.shirt)
      dummy.position.set(p.x, top + 1.55 + 0.15 + bob, p.z)
      dummy.updateMatrix()
      h.setMatrixAt(i, dummy.matrix)
      h.setColorAt(i, p.skin)
    })
    for (const mesh of [l, t, h]) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  })

  useEffect(
    () => () => {
      legGeo.dispose()
      torsoGeo.dispose()
      headGeo.dispose()
      legMat.dispose()
      bodyMat.dispose()
    },
    [legGeo, torsoGeo, headGeo, legMat, bodyMat],
  )

  return (
    <>
      <instancedMesh ref={legs} args={[legGeo, legMat, list.length]} frustumCulled={false} />
      <instancedMesh ref={torsos} args={[torsoGeo, bodyMat, list.length]} frustumCulled={false} />
      <instancedMesh ref={heads} args={[headGeo, bodyMat, list.length]} frustumCulled={false} />
    </>
  )
}

/**
 * Your ride. Stand-in blocks for now: to use a real model, load it with useGLTF here (one file per
 * mode), set it at the origin facing -z, and drop the blocks.
 */
function PlayerVehicle({ mode, pose }: { mode: DriveMode; pose: Pose }) {
  const ref = useRef<Group>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (!ref.current) return
    ref.current.position.x = pose.x
    ref.current.rotation.y = pose.yaw
    // Idle at a standstill: no road shake
    const moving = Math.min(pose.rate / 8, 1)
    ref.current.position.y = Math.sin(t * 13) * 0.018 * moving
    ref.current.rotation.z = (mode === 'okada' ? Math.sin(t * 2.2) * 0.05 : Math.sin(t * 1.4) * 0.012) * moving
  })
  return (
    <group ref={ref} position={[LANE.mine, 0, 0]}>
      {mode === 'keke' ? (
        <>
          <mesh position={[0, 0.85, 0.3]}>
            <boxGeometry args={[1.5, 1.2, 2.4]} />
            <meshLambertMaterial color="#f2c230" />
          </mesh>
          <mesh position={[0, 1.6, 0.3]}>
            <boxGeometry args={[1.55, 0.14, 2.5]} />
            <meshLambertMaterial color="#222" />
          </mesh>
          <mesh position={[0, 0.7, -1.2]}>
            <boxGeometry args={[0.5, 0.9, 0.9]} />
            <meshLambertMaterial color="#f2c230" />
          </mesh>
          {[-0.75, 0.75].map((x) => (
            <mesh key={x} position={[x, 0.32, 1.1]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.32, 0.32, 0.2, 10]} />
              <meshLambertMaterial color="#1a1a1a" />
            </mesh>
          ))}
        </>
      ) : (
        <>
          <mesh position={[0, 0.65, 0]}>
            <boxGeometry args={[0.45, 0.7, 1.9]} />
            <meshLambertMaterial color="#2d3a46" />
          </mesh>
          <mesh position={[0, 1.4, 0.1]}>
            <boxGeometry args={[0.5, 0.9, 0.45]} />
            <meshLambertMaterial color="#d95f3b" />
          </mesh>
          <mesh position={[0, 2.05, 0.1]}>
            <sphereGeometry args={[0.24, 8, 6]} />
            <meshLambertMaterial color="#8a5a3b" />
          </mesh>
          {[-0.85, 0.85].map((z) => (
            <mesh key={z} position={[0, 0.32, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.32, 0.32, 0.16, 10]} />
              <meshLambertMaterial color="#111" />
            </mesh>
          ))}
        </>
      )}
    </group>
  )
}

/* —— camera —— */

type Shot = { pos: [number, number, number]; look: [number, number, number]; fov: number }

/** Shots are relative to the vehicle (x across, -z ahead) and turn with it. */
const VIEWS: Record<DriveMode, Record<DriveView, Shot>> = {
  keke: {
    chase: { pos: [0.4, 3.1, 8], look: [0.3, 1.2, -14], fov: 58 },
    side: { pos: [7, 1.7, 1.5], look: [0, 1.1, -1], fov: 58 },
    // In the driver seat, under the roof
    inside: { pos: [0, 1.3, 0.1], look: [0, 1.25, -22], fov: 72 },
  },
  okada: {
    chase: { pos: [0.3, 2.7, 6.5], look: [0.3, 1.3, -14], fov: 58 },
    side: { pos: [6, 1.5, 1], look: [0, 1.2, -0.5], fov: 58 },
    // Over the handlebars, in front of the rider
    inside: { pos: [0, 1.75, -0.6], look: [0, 1.6, -22], fov: 74 },
  },
}

function CameraRig({
  mode,
  view,
  gateZ,
  pose,
  glance,
  narrow,
}: {
  mode: DriveMode
  view: DriveView
  gateZ: Offset
  pose: Pose
  /** Look over at the gate as it goes by */
  glance: boolean
  /** The campus lane has no room for the side camera at highway distance */
  narrow: boolean
}) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const look = useRef(new Vector3(0, 1.2, -14))
  const first = useRef(true)
  const goalPos = useMemo(() => new Vector3(), [])
  const goalLook = useMemo(() => new Vector3(), [])

  useFrame(({ clock }, delta) => {
    const target = VIEWS[mode][view]
    // Snap into place on the first frame, then ease
    const k = first.current ? 1 : 1 - Math.exp(-delta * 4)
    first.current = false
    const bob = Math.sin(clock.elapsedTime * 9) * (view === 'inside' ? 0.025 : 0.012) * Math.min(pose.rate / 8, 1)
    const c = Math.cos(pose.yaw)
    const s = Math.sin(pose.yaw)
    const place = (v: [number, number, number], out: Vector3, y = v[1]) => out.set(pose.x + v[0] * c + v[2] * s, y, -v[0] * s + v[2] * c)
    const pos: [number, number, number] = narrow && view === 'side' ? [4.6, target.pos[1], target.pos[2]] : target.pos
    place(pos, goalPos, pos[1] + bob)
    place(target.look, goalLook)
    // As the school gate goes by on the left, glance over at it (chase view only, and not while turning in)
    if (glance && view === 'chase') {
      const near = Math.max(0, 1 - Math.abs(gateZ.current + 14) / 55) * (1 - Math.min(1, Math.abs(pose.yaw) / 0.8))
      goalLook.x -= near * 15
      goalLook.z += near * 10
    }
    camera.position.lerp(goalPos, k)
    look.current.lerp(goalLook, k)
    camera.fov += (target.fov - camera.fov) * k
    camera.lookAt(look.current)
    camera.updateProjectionMatrix()
  })
  return null
}

/* —— campus lane —— */

/** The lane between blocks: tarmac, footpaths and centre dashes sliding past. */
function CampusRoad({ offset }: { offset: Offset }) {
  const dashes = useRef<Group>(null)
  const geometry = useMemo(() => new BoxGeometry(0.2, 0.02, 2.4), [])
  const material = useMemo(() => new MeshLambertMaterial({ color: '#e8e4d6' }), [])
  const matrices = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => {
        const dummy = new Object3D()
        dummy.position.set(0, 0.04, 40 - i * 8)
        dummy.updateMatrix()
        return dummy.matrix.clone()
      }),
    [],
  )
  useFrame(() => {
    if (dashes.current) dashes.current.position.z = offset.current % 8
  })
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )
  return (
    <>
      <mesh position={[0, 0.02, -120]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[CAMPUS_ROAD * 2, 700]} />
        <meshLambertMaterial color="#5f6165" />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (CAMPUS_ROAD + 0.85), 0.03, -120]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.7, 700]} />
          <meshLambertMaterial color="#bdb9ac" />
        </mesh>
      ))}
      <group ref={dashes}>
        <Instances geometry={geometry} material={material} matrices={matrices} />
      </group>
    </>
  )
}

/* —— the scene —— */

type DriveProps = {
  mode: DriveMode
  view: DriveView
  route: DriveRoute
  plannedMs: number
}

function World({ mode, view, route, plannedMs }: DriveProps) {
  const plan = useMemo(() => makePlan(mode, route, plannedMs), [mode, route, plannedMs])
  const campus = plan.kind === 'campus'
  const hasGate = plan.kind === 'in' || plan.kind === 'out' || plan.kind === 'stop'
  const offset = useRef(plan.offset0)
  const rate = useRef(plan.speed)
  const gateZ = useRef(-9999)
  const time = useRef(0)
  const pose = useMemo<Pose>(() => ({ offset: plan.offset0, rate: plan.speed, x: plan.lane, yaw: 0 }), [plan])
  // Where the gate falls in a roadside strip, so the left side can leave room for it
  const gateLocal = hasGate ? -(plan.passAt % STRIP) : null

  useFrame((_, delta) => {
    time.current += Math.min(delta, 0.05)
    sample(plan, time.current, pose)
    offset.current = pose.offset
    rate.current = pose.rate
    gateZ.current = hasGate ? pose.offset - plan.passAt : -9999
  })

  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 70, 230]} />
      <ambientLight intensity={1.05} />
      <hemisphereLight args={['#eaf3fb', '#9aa683', 0.55]} />
      <directionalLight position={[18, 30, 12]} intensity={1.2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, -120]}>
        <planeGeometry args={[800, 900]} />
        <meshLambertMaterial color={campus ? '#86a46a' : '#8d9c76'} />
      </mesh>
      {campus ? (
        <CampusRoad offset={offset} />
      ) : (
        <Suspense fallback={null}>
          <Highway offset={offset} plan={plan} gateZ={gateZ} />
        </Suspense>
      )}
      {hasGate ? (
        <>
          <GatePad plan={plan} gateZ={gateZ} />
          <Suspense fallback={null}>
            <SchoolGate plan={plan} gateZ={gateZ} />
          </Suspense>
        </>
      ) : null}
      <Roadside offset={offset} edge={campus ? CAMPUS_EDGE : ROAD_EDGE} campus={campus} gateLocal={gateLocal} />
      {campus ? null : <Traffic plan={plan} rate={rate} />}
      <Walkers rate={rate} campus={campus} />
      <PlayerVehicle mode={mode} pose={pose} />
      <CameraRig mode={mode} view={view} gateZ={gateZ} pose={pose} glance={plan.kind === 'in' || plan.kind === 'stop'} narrow={campus} />
    </>
  )
}

export function DriveScene(props: DriveProps) {
  return <World {...props} />
}
