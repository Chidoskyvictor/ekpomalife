'use client'

import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, MeshBasicMaterial, RepeatWrapping, SRGBColorSpace, type Group, type Mesh } from 'three'
import { CarModel, type CarRig } from '@/components/cars/car-model'
import { driveCommand, driveTelemetry } from '@/lib/game/drive'
import { stepAi, type AiRacer } from '@/lib/game/race-ai'
import { advance, pointOnCourse, rankRacers, type Course } from '@/lib/game/race-courses'
import { IN_BOX, arriveAtGrid, currentRun, finishRun, lightsOut, runLive, toStartBox, updateField, useRun } from '@/lib/game/race-run'

/*
 * The race as it appears on the road (inside the street canvas): the chequered start box, a gate at
 * every checkpoint, the finish arch, the glowing lane ahead, and the AI cars with name tags. It also
 * runs the race clock: steps the AI with the car physics, tracks you round the course and tells the
 * store when the lights go green and when you cross the line.
 */

/** Metres per map unit in the street world: the dial's speed is in map units. */
const UNIT = 2.5

const chequer = (() => {
  let tex: CanvasTexture | null = null
  return () => {
    if (tex) return tex
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')!
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        g.fillStyle = (x + y) % 2 ? '#111' : '#fff'
        g.fillRect(x * 16, y * 16, 16, 16)
      }
    tex = new CanvasTexture(c)
    tex.wrapS = tex.wrapT = RepeatWrapping
    tex.colorSpace = SRGBColorSpace
    return tex
  }
})()

/** The heading of the path at a distance along it. */
function headingAtDist(course: Course, d: number) {
  const a = pointOnCourse(course, d - 2)
  const b = pointOnCourse(course, d + 2)
  return Math.atan2(b[0] - a[0], b[1] - a[1])
}

const GATE_HALF = 4.6

/** A gate across the lane: two posts and a bar, lit by its state (cleared / next / ahead). */
function Gate({ course, at, index, last }: { course: Course; at: number; index: number; last: boolean }) {
  const mat = useMemo(() => new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, toneMapped: false, side: DoubleSide }), [])
  const [x, z] = pointOnCourse(course, at)
  const h = headingAtDist(course, at)
  const tint = useMemo(() => new Color(), [])
  useFrame(() => {
    const passed = runLive.tracker.passed
    const state = passed > index ? 0 : passed === index ? 1 : 2
    tint.set(state === 0 ? '#34d399' : state === 1 ? '#ffd21f' : '#ffffff')
    mat.color.copy(tint)
    mat.opacity = state === 0 ? 0.25 : state === 1 ? 0.95 : 0.5
  })
  if (last) return null
  return (
    <group position={[x, 0, z]} rotation={[0, h, 0]}>
      {[-GATE_HALF, GATE_HALF].map((s) => (
        <mesh key={s} position={[s, 2.6, 0]} material={mat}>
          <boxGeometry args={[0.35, 5.2, 0.35]} />
        </mesh>
      ))}
      <mesh position={[0, 5.2, 0]} material={mat}>
        <boxGeometry args={[GATE_HALF * 2 + 0.35, 0.35, 0.35]} />
      </mesh>
      {/* a faint curtain so it reads from far away */}
      <mesh position={[0, 2.6, 0]} material={mat}>
        <planeGeometry args={[GATE_HALF * 2, 5.2]} />
      </mesh>
    </group>
  )
}

/** The finish arch: a big chequered banner on two pylons, with a chequered strip across the lane. */
function FinishArch({ course }: { course: Course }) {
  const end = course.length
  const [x, z] = pointOnCourse(course, end)
  const h = headingAtDist(course, end - 4)
  const tex = useMemo(() => {
    const t = chequer().clone()
    t.needsUpdate = true
    t.repeat.set(10, 1.2)
    return t
  }, [])
  return (
    <group position={[x, 0, z]} rotation={[0, h, 0]}>
      {[-GATE_HALF - 1, GATE_HALF + 1].map((s) => (
        <mesh key={s} position={[s, 3.4, 0]}>
          <boxGeometry args={[0.7, 6.8, 0.7]} />
          <meshBasicMaterial color="#1f2937" toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[0, 6.4, 0]}>
        <boxGeometry args={[GATE_HALF * 2 + 2.4, 1.6, 0.5]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.17, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[GATE_HALF * 2 + 2, 2.4]} />
        <meshBasicMaterial map={tex} toneMapped={false} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
      </mesh>
    </group>
  )
}

/** The start box: a chequered line across the lane, grid slots painted behind it, and a beam while you are driving to it. */
function StartBox({ course }: { course: Course }) {
  const beam = useRef<Mesh>(null)
  const run = useRun()
  const tex = useMemo(() => {
    const t = chequer().clone()
    t.needsUpdate = true
    t.repeat.set(10, 1.2)
    return t
  }, [])
  useFrame((state) => {
    if (beam.current) beam.current.visible = currentRun()?.phase === 'toGrid'
    if (beam.current) beam.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 3) * 0.06)
  })
  const grid = run && run.phase !== 'toGrid'
  return (
    <group position={[course.start.x, 0, course.start.z]} rotation={[0, course.start.h, 0]}>
      <mesh position={[0, 0.17, 0.4]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[GATE_HALF * 2 + 2, 1.8]} />
        <meshBasicMaterial map={tex} toneMapped={false} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
      </mesh>
      {/* the box itself: a bright outline around the pole position */}
      <mesh position={[0, 0.15, -3]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.4, 6.2]} />
        <meshBasicMaterial color={grid ? '#34d399' : '#60a5fa'} transparent opacity={0.28} toneMapped={false} depthWrite={false} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />
      </mesh>
      <mesh ref={beam} position={[0, 28, -3]}>
        <cylinderGeometry args={[3, 3, 56, 20, 1, true]} />
        <meshBasicMaterial color="#60a5fa" transparent opacity={0.3} side={DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** The glowing lane ahead: from where you are along the next stretch of the course. */
function Ribbon({ course }: { course: Course }) {
  const STEPS = 70
  const geo = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(STEPS * 2 * 3), 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(STEPS * 2 * 4), 4))
    const idx: number[] = []
    for (let i = 0; i < STEPS - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
    g.setIndex(idx)
    return g
  }, [])
  const mat = useMemo(() => new MeshBasicMaterial({ vertexColors: true, transparent: true, side: DoubleSide, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), [])
  const mesh = useRef<Mesh>(null)
  const clock = useRef(1)
  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
    },
    [geo, mat],
  )
  useFrame((_, delta) => {
    clock.current += delta
    if (clock.current < 0.12 || !mesh.current) return
    clock.current = 0
    const phase = currentRun()?.phase
    mesh.current.visible = phase === 'grid' || phase === 'countdown' || phase === 'racing'
    if (!mesh.current.visible) return
    const pos = geo.getAttribute('position') as BufferAttribute
    const col = geo.getAttribute('color') as BufferAttribute
    const from = Math.max(0, runLive.tracker.progress - 4)
    for (let i = 0; i < STEPS; i++) {
      const d = Math.min(course.length, from + i * 6)
      const [x, z] = pointOnCourse(course, d)
      const [x2, z2] = pointOnCourse(course, Math.min(course.length, d + 3))
      const a = Math.atan2(x2 - x, z2 - z)
      const w = 1.5
      const fade = Math.min(1, i / 4) * Math.min(1, (STEPS - i) / 14)
      pos.setXYZ(i * 2, x - Math.cos(a) * w, 0.14, z + Math.sin(a) * w)
      pos.setXYZ(i * 2 + 1, x + Math.cos(a) * w, 0.14, z - Math.sin(a) * w)
      for (const k of [0, 1]) col.setXYZW(i * 2 + k, 0.2, 0.55, 1, 0.5 * fade)
    }
    pos.needsUpdate = true
    col.needsUpdate = true
  })
  return <mesh ref={mesh} geometry={geo} material={mat} frustumCulled={false} renderOrder={2} visible={false} />
}

/** One AI car, drawn where its body is, with a name tag. */
function AiCar({ ai }: { ai: AiRacer }) {
  const group = useRef<Group>(null)
  const rig = useRef<CarRig>({ steer: 0, spin: 0, braking: false, reversing: false })
  useFrame(() => {
    const g = group.current
    if (!g) return
    const b = ai.body
    g.position.set(b.x, 0.05 + b.bob, b.z)
    g.rotation.order = 'YXZ'
    g.rotation.set(b.pitch, b.h, b.roll)
    rig.current.steer = b.wheelAngle
    rig.current.spin = b.spin
    rig.current.braking = ai.braking
  })
  return (
    <group ref={group} position={[ai.body.x, 0.05, ai.body.z]}>
      <Suspense fallback={null}>
        <CarModel id={ai.model} color={ai.color} rig={rig} />
      </Suspense>
      <Html position={[0, 2.5, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        <span
          style={{
            display: 'inline-block',
            maxWidth: 140,
            overflow: 'hidden',
            padding: '3px 9px',
            borderRadius: 999,
            background: 'rgba(17,24,39,0.82)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          {ai.name}
        </span>
      </Html>
    </group>
  )
}

/** The race's clock and cars. Renders nothing until a run begins. */
export function RaceWorld() {
  const run = useRun()
  const ending = useRef(0)
  const tick = useRef(0)

  useFrame((_, delta) => {
    const r = currentRun()
    if (!r) return
    const dt = Math.min(delta, 0.05)
    const now = performance.now()
    const { course } = r
    const speed = Math.abs(driveTelemetry.speed) * UNIT

    if (r.phase === 'toGrid') {
      runLive.toStart = toStartBox(course)
      if (runLive.toStart < IN_BOX && speed < 2.2) arriveAtGrid()
    }
    if (r.phase === 'countdown') {
      driveCommand.hold = true
      if (now >= runLive.goAt) {
        runLive.goAt = now
        runLive.t = 0
        lightsOut()
      }
    }
    const racing = r.phase === 'racing' || r.phase === 'done'
    // The race clock is the cars' own physics time, not the wall clock: a phone that drops frames runs the
    // cars slower (the step is capped), and the clock must slow with them or a weak phone would lose time unfairly.
    if (racing) runLive.t += dt * 1000
    const t = racing ? runLive.t : 0

    // The AI: held on the grid until green, then racing
    let allDone = true
    for (const ai of r.ai) {
      // Every other car on the track, you included, so they steer round each other
      const others = [{ x: driveTelemetry.x, z: driveTelemetry.z }, ...r.ai.filter((o) => o !== ai).map((o) => ({ x: o.body.x, z: o.body.z }))]
      stepAi(course, ai, dt, racing, t, others)
      if (ai.finishedAt === null) allDone = false
    }

    // You
    if (r.phase === 'racing') {
      runLive.tracker = advance(course, runLive.tracker, driveTelemetry.x, driveTelemetry.z, t)
      if (runLive.tracker.finished) {
        const ms = runLive.tracker.splits[runLive.tracker.splits.length - 1] ?? t
        runLive.racers = buildRacers(r.ai, ms, runLive.tracker.progress, speed)
        finishRun(ms, runLive.tracker.splits)
        ending.current = now
      }
    }
    if (r.phase === 'done') driveCommand.hold = true

    const finishedAt = runLive.tracker.finished ? (runLive.tracker.splits[runLive.tracker.splits.length - 1] ?? null) : null
    runLive.racers = buildRacers(r.ai, finishedAt, runLive.tracker.progress, speed)
    const order = rankRacers(runLive.racers)
    runLive.place = order.indexOf(0) + 1

    // After you finish, keep the table up to date until the last car is home
    tick.current += delta
    if (r.phase === 'done' && tick.current > 0.5) {
      tick.current = 0
      if (!allDone || now - ending.current < 1500) updateField()
    }
  })

  if (!run) return null
  return (
    <>
      <StartBox course={run.course} />
      {run.course.checkpoints.map((d, i) => (
        <Gate key={i} course={run.course} at={d} index={i} last={i === run.course.checkpoints.length - 1} />
      ))}
      <FinishArch course={run.course} />
      <Ribbon course={run.course} />
      {run.ai.map((ai) => (
        <AiCar key={ai.id} ai={ai} />
      ))}
    </>
  )
}

function buildRacers(ai: AiRacer[], youFinished: number | null, youProgress: number, youSpeed: number) {
  return [
    { id: 'you', name: 'You', you: true, progress: youProgress, finishedAt: youFinished, speed: youSpeed },
    ...ai.map((a) => ({ id: a.id, name: a.name, you: false, progress: a.tracker.progress, finishedAt: a.finishedAt, speed: Math.abs(a.body.v) })),
  ]
}
