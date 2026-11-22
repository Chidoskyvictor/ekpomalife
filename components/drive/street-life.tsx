'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BufferAttribute, BufferGeometry, Color, DoubleSide, InstancedMesh, MeshBasicMaterial, Object3D, Shape, ShapeGeometry, type Group, type Mesh } from 'three'
import { CarModel } from '@/components/cars/car-model'
import { CharacterFigure } from '@/components/look/character-figure'
import { driveTelemetry, useDrive } from '@/lib/game/drive'
import { HALF, MID_LANE, ROADS, locateOn, placeSpot, roadsNear, routeAhead, spotAt, type Road } from '@/lib/game/drive-road'
import { normalizeAppearance, type Appearance } from '@/lib/game/look'
import { racesNow, useRaces } from '@/lib/game/races-api'

/*
 * Life on the driving roads: the lit lane painted toward where you said you are going, other cars
 * (the same seven models the dealer sells), and people walking the kerbs (the same animated
 * character players use). They are kept near you: anything left far behind reappears up ahead,
 * so the road around you always has something moving without filling the whole town.
 */

/* —— the way to go, painted on the road —— */

const STEPS = 48
const STEP = 7
const LANE_HALF = 1.5
const BLUE = new Color('#2f8cff')
const WHITE = new Color('#ffffff')

/**
 * The way to go: a translucent blue ribbon painted on the road along your lane, white chevrons
 * inside it, fading out toward where you are (so it never smears under the car) and a glowing ring
 * at the destination's kerb.
 */
export function RouteArrows() {
  const drive = useDrive()
  const destId = drive?.dest?.id ?? null
  const chevrons = useRef<InstancedMesh>(null)
  const band = useRef<Mesh>(null)
  const ring = useRef<Group>(null)
  const kit = useMemo(() => {
    // A chevron lying flat, pointing along +z
    const shape = new Shape()
    shape.moveTo(0, 1.0)
    shape.lineTo(0.95, -0.1)
    shape.lineTo(0.95, -0.7)
    shape.lineTo(0, 0.4)
    shape.lineTo(-0.95, -0.7)
    shape.lineTo(-0.95, -0.1)
    shape.closePath()
    const chevron = new ShapeGeometry(shape)
    chevron.rotateX(Math.PI / 2) // shape y → world z
    // The ribbon: two vertices a step (colour with alpha), joined into quads; rewritten as you drive
    const strip = new BufferGeometry()
    strip.setAttribute('position', new BufferAttribute(new Float32Array(STEPS * 2 * 3), 3))
    strip.setAttribute('color', new BufferAttribute(new Float32Array(STEPS * 2 * 4), 4))
    const index: number[] = []
    for (let i = 0; i < STEPS - 1; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
    strip.setIndex(index)
    return {
      chevron,
      strip,
      chevronMat: new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.92, side: DoubleSide, depthWrite: false, toneMapped: false }),
      stripMat: new MeshBasicMaterial({ color: '#ffffff', vertexColors: true, transparent: true, side: DoubleSide, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    }
  }, [])
  useEffect(
    () => () => {
      kit.chevron.dispose()
      kit.strip.dispose()
      kit.chevronMat.dispose()
      kit.stripMat.dispose()
    },
    [kit],
  )
  const dummy = useMemo(() => new Object3D(), [])
  const tint = useMemo(() => new Color(), [])
  const clock = useRef(1)
  // What is on the road now, and since when a reversed way has been asked for
  const shown = useRef<[number, number, number][]>([])
  const flipSince = useRef<number | null>(null)
  const spot = useMemo(() => (destId ? placeSpot(destId) : null), [destId])
  useFrame((state, delta) => {
    const m = chevrons.current
    const b = band.current
    if (ring.current) {
      const t = state.clock.elapsedTime
      ring.current.visible = Boolean(spot)
      ring.current.scale.setScalar(1 + Math.sin(t * 3) * 0.08)
    }
    if (!m || !b) return
    clock.current += delta
    if (clock.current < 0.25) return
    clock.current = 0
    const fresh = destId ? routeAhead(driveTelemetry.x, driveTelemetry.z, driveTelemetry.h, destId, STEP, STEP * (STEPS - 2)) : []
    // Steady: if the new arrows point the opposite way to the ones on the road, keep the old ones
    // until the new way has held for a second (a car turning or sliding across a junction can tip
    // the route back and forth for a moment, which showed arrows both ways)
    let points = fresh
    const was = shown.current[0]
    const now = fresh[0]
    const reversed = was && now && Math.abs(Math.atan2(Math.sin(now[2] - was[2]), Math.cos(now[2] - was[2]))) > 2.3
    if (reversed) {
      const t = performance.now()
      flipSince.current ??= t
      if (t - flipSince.current < 1000) points = shown.current
      else flipSince.current = null
    } else {
      flipSince.current = null
    }
    shown.current = points
    const n = Math.min(STEPS, points.length)
    const pos = kit.strip.getAttribute('position') as BufferAttribute
    const col = kit.strip.getAttribute('color') as BufferAttribute
    for (let i = 0; i < n; i++) {
      const [x, z, h] = points[i]!
      // Faint right at the car, full a few arrows on, thinning out far ahead
      const fade = Math.min(1, i / 3) * Math.min(1, (n - i) / 8)
      dummy.position.set(x, 0.16, z)
      dummy.rotation.set(0, h, 0)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      tint.copy(BLUE).lerp(WHITE, Math.min(1, i / 3) * fade)
      m.setColorAt(i, tint)
      // Either edge of the ribbon: across the direction of travel
      const ax = Math.cos(h) * LANE_HALF
      const az = -Math.sin(h) * LANE_HALF
      pos.setXYZ(i * 2, x - ax, 0.145, z - az)
      pos.setXYZ(i * 2 + 1, x + ax, 0.145, z + az)
      for (const k of [0, 1]) col.setXYZW(i * 2 + k, BLUE.r, BLUE.g, BLUE.b, 0.55 * fade)
    }
    m.count = n
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    pos.needsUpdate = true
    col.needsUpdate = true
    kit.strip.setDrawRange(0, Math.max(0, n - 1) * 6)
    b.visible = n > 1
  })
  return (
    <>
      <mesh ref={band} geometry={kit.strip} material={kit.stripMat} frustumCulled={false} renderOrder={2} visible={false} />
      <instancedMesh ref={chevrons} args={[kit.chevron, kit.chevronMat, STEPS]} frustumCulled={false} renderOrder={3} />
      {spot ? (
        <group ref={ring} position={[spot.x, 0.19, spot.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}>
            <ringGeometry args={[2.3, 2.9, 40]} />
            <meshBasicMaterial color="#47a1ff" transparent opacity={0.95} side={DoubleSide} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}>
            <ringGeometry args={[1.2, 2.3, 40]} />
            <meshBasicMaterial color="#2f8cff" transparent opacity={0.28} side={DoubleSide} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh position={[0, 6, 0]}>
            <cylinderGeometry args={[2.7, 2.7, 12, 24, 1, true]} />
            <meshBasicMaterial color="#47a1ff" transparent opacity={0.16} side={DoubleSide} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      ) : null}
    </>
  )
}

/** A race's finish: a tall beam of light over the spot, seen from far down the road. */
export function FinishBeam() {
  const { mine } = useRaces()
  if (!mine || mine.status !== 'running') return null
  return (
    <group position={[mine.dest.x, 0, mine.dest.z]}>
      <mesh position={[0, 30, 0]}>
        <cylinderGeometry args={[3.2, 3.2, 60, 20, 1, true]} />
        <meshBasicMaterial color="#ffd21f" transparent opacity={0.3} side={DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[9, 11, 40]} />
        <meshBasicMaterial color="#ffd21f" transparent opacity={0.85} side={DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

/* —— other cars —— */

type NpcCar = { road: Road; s: number; dir: number; lane: number; v: number; cruise: number; model: string; color: string; x: number; z: number; stuck: number }

/** A cross street's two ends lie in the middle of the long roads it joins: its cars stop short of them. */
const endGap = (road: Road) => (road.kind === 'street' ? 24 : 6)

/** Every model the dealer sells drives these roads; the cheap ones are the common ones. */
const CAR_MODELS = ['corolla', 'corolla', 'camry', 'camry', 'es350', 'scout', 'scout', 'gle43', 'suv', 'gt3']
const CAR_PAINTS = ['#c9ccd1', '#f2f2ef', '#111317', '#7a1c22', '#1f2a44', '#5a6b3a', '#8a8f96', '#3d4a66', '#c8b560']
const CARS = 5
/** Cars left on the road while you are in a race. */
const RACE_CARS = 2
/** A car this far from you is taken off the road and put back somewhere ahead or behind. */
const CAR_FAR = 280

const cars: NpcCar[] = []

/** Is there another car right here? (so yours bumps into it) */
export function trafficBlocks(x: number, z: number) {
  for (const c of cars) if (Math.abs(c.x - x) < 2.4 && Math.abs(c.z - z) < 2.4 && Math.hypot(c.x - x, c.z - z) < 2.15) return true
  return false
}

/** Put a car on a road near you: the road you are on, or another close by. */
function placeCar(car: NpcCar, first: boolean) {
  const { x, z } = driveTelemetry
  const near = roadsNear(x, z, 400).map((road) => ({ road, at: locateOn(road, x, z) }))
    .filter((r) => r.at.gap < 380 && r.road.length > 200)
    .sort((a, b) => a.at.gap - b.at.gap)
  // Mostly the road you are on, so there is always something in sight
  const pick = near[Math.random() < 0.6 ? 0 : Math.floor(Math.random() * Math.min(4, near.length))] ?? { road: ROADS[0]!, at: { s: ROADS[0]!.length / 2 } }
  const road = pick.road
  const off = (first ? 30 + Math.random() * 220 : 130 + Math.random() * 120) * (Math.random() < 0.5 ? -1 : 1)
  car.road = road
  const gap = endGap(road) + 8
  car.s = Math.max(gap, Math.min(road.length - gap, pick.at.s + off))
  car.stuck = 0
  car.dir = Math.random() < 0.5 ? 1 : -1
  // Traffic keeps to the middle lane; the others stay free for players
  car.lane = MID_LANE[road.kind]
  car.cruise = road.kind === 'highway' ? 13 + Math.random() * 6 : road.kind === 'road' ? 8 + Math.random() * 4 : 5 + Math.random() * 2
  car.v = car.cruise
  car.model = CAR_MODELS[Math.floor(Math.random() * CAR_MODELS.length)]!
  car.color = CAR_PAINTS[Math.floor(Math.random() * CAR_PAINTS.length)]!
}

/** Other cars keeping to their lane. They slow down and wait behind you rather than run into you. */
export function Traffic() {
  const groups = useRef<(Group | null)[]>([])
  const [looks, setLooks] = useState<{ model: string; color: string }[]>([])
  useEffect(() => {
    cars.length = 0
    for (let i = 0; i < CARS; i++) {
      const car = { road: ROADS[0]!, s: 0, dir: 1, lane: 0, v: 0, cruise: 0, model: 'corolla', color: '#fff', x: 0, z: 0, stuck: 0 }
      placeCar(car, true)
      cars.push(car)
    }
    setLooks(cars.map((c) => ({ model: c.model, color: c.color })))
    return () => {
      cars.length = 0
    }
  }, [])
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const { x: px, z: pz } = driveTelemetry
    // Racing: a clear road, only a few cars about
    const race = racesNow().mine
    const quiet = Boolean(race && (race.status === 'open' || race.status === 'running'))
    cars.forEach((car, i) => {
      if (quiet && i >= RACE_CARS) {
        const g = groups.current[i]
        if (g) g.visible = false
        car.x = car.z = 1e6 // nowhere: blocks nobody
        return
      }
      if (groups.current[i]) groups.current[i]!.visible = true
      const p = spotAt(car.road.id, car.s, car.dir * car.lane)
      const fx = p.dx * car.dir
      const fz = p.dz * car.dir
      // You (or another car) just ahead in this lane: brake
      const blockedBy = (ox: number, oz: number) => {
        const ahead = (ox - p.x) * fx + (oz - p.z) * fz
        const across = Math.abs((ox - p.x) * -fz + (oz - p.z) * fx)
        return ahead > 0 && ahead < 15 && across < 2.6
      }
      const wait = blockedBy(px, pz) || cars.some((other) => other !== car && blockedBy(other.x, other.z))
      car.v += ((wait ? 0 : car.cruise) - car.v) * Math.min(1, dt * (wait ? 5 : 1.2))
      car.s += car.dir * car.v * dt
      car.stuck = car.v < 0.6 ? car.stuck + dt : 0
      car.x = p.x
      car.z = p.z
      const g = groups.current[i]
      if (g) {
        g.position.set(p.x, 0.05, p.z)
        g.rotation.y = Math.atan2(fx, fz)
      }
      // Off the end of its road, or left far behind: start again near you
      // …or held up for a while, and out of your way (never vanish right in front of you)
      const far = Math.hypot(p.x - px, p.z - pz)
      const gap = endGap(car.road)
      if (car.s < gap || car.s > car.road.length - gap || far > CAR_FAR || (car.stuck > 4 && far > 40)) {
        placeCar(car, false)
        setLooks((list) => list.map((look, k) => (k === i ? { model: car.model, color: car.color } : look)))
      }
    })
  })
  return (
    <>
      {looks.map((look, i) => (
        <group
          key={i}
          ref={(g) => {
            groups.current[i] = g
          }}
        >
          <CarModel id={look.model} color={look.color} />
        </group>
      ))}
    </>
  )
}

/* —— people —— */

type Walker = { road: Road; s: number; side: number; dir: number; v: number }

/** Kept low: each is a full animated character. */
const PEOPLE = 8
const PERSON_FAR = 150
const TOP_COLORS = ['#d95f3b', '#3d6fb5', '#f0e3c0', '#5a9a5a', '#c94f8a', '#e0b13c', '#7a4fb5', '#f2f2f2']
const SKINS = ['#8a5a3b', '#6b4226', '#a9744f', '#5C3317']

function placeWalker(w: Walker, first: boolean) {
  const { x, z } = driveTelemetry
  const near = roadsNear(x, z, 400).map((road) => ({ road, at: locateOn(road, x, z) }))
    .filter((r) => r.at.gap < 150)
    .sort((a, b) => a.at.gap - b.at.gap)
  const pick = near[Math.random() < 0.6 ? 0 : Math.floor(Math.random() * Math.min(3, near.length))] ?? { road: ROADS[0]!, at: { s: ROADS[0]!.length / 2 } }
  w.road = pick.road
  const off = (first ? 12 + Math.random() * 110 : 70 + Math.random() * 60) * (Math.random() < 0.5 ? -1 : 1)
  w.s = Math.max(20, Math.min(w.road.length - 20, pick.at.s + off))
  w.side = Math.random() < 0.5 ? -1 : 1
  w.dir = Math.random() < 0.5 ? -1 : 1
  w.v = 1.1 + Math.random() * 0.5
}

/** People walking the highway's sidewalks and the kerbs of the asphalt roads: the game's own characters. */
export function Walkers() {
  const groups = useRef<(Group | null)[]>([])
  const walking = useRef(true)
  const people = useMemo(
    () =>
      Array.from({ length: PEOPLE }, (_, i) => ({
        walker: { road: ROADS[0]!, s: 0, side: 1, dir: 1, v: 1.2 } as Walker,
        look: normalizeAppearance({
          body: i % 2 ? 'woman' : 'man',
          skin: SKINS[i % SKINS.length],
          topColor: TOP_COLORS[i % TOP_COLORS.length],
          bottomColor: i % 3 ? '#2a2a2a' : '#3a4a6a',
        } as Partial<Appearance>),
      })),
    [],
  )
  const started = useRef(false)
  useFrame((_, delta) => {
    if (!started.current) {
      started.current = true
      people.forEach((p) => placeWalker(p.walker, true))
    }
    const dt = Math.min(delta, 0.05)
    const { x: px, z: pz } = driveTelemetry
    people.forEach(({ walker: w }, i) => {
      w.s += w.dir * w.v * dt
      // On the highway's sidewalk, or the kerb of an asphalt road
      const off = HALF[w.road.kind] + 1.3
      const p = spotAt(w.road.id, w.s, w.side * off)
      const g = groups.current[i]
      if (g) {
        g.position.set(p.x, 0.2, p.z)
        g.rotation.y = Math.atan2(p.dx * w.dir, p.dz * w.dir)
      }
      // A cross street's ends lie in the middle of the roads it meets: turn back before stepping into traffic
      const margin = w.road.kind === 'street' ? 17 : 3
      if (w.s < margin || w.s > w.road.length - margin || Math.hypot(p.x - px, p.z - pz) > PERSON_FAR) placeWalker(w, false)
    })
  })
  return (
    <>
      {people.map((p, i) => (
        <group
          key={i}
          ref={(g) => {
            groups.current[i] = g
          }}
        >
          <CharacterFigure appearance={p.look} moving={walking} />
        </group>
      ))}
    </>
  )
}
