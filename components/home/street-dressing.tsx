'use client'

import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CanvasTexture, PerspectiveCamera, SRGBColorSpace, Vector3, type Group, type Mesh, type MeshStandardMaterial } from 'three'
import { CarModel } from '@/components/cars/car-model'
import { InstancedShapes, type Shape } from './instanced-shapes'

/*
 * The street outside your home, dressed up: a paved far pavement, kerbs, street lights on both
 * sides, a row of shops (awnings, signboards) and two- and three-storey blocks with balconies
 * across the road, a few cars driving past, the big green sign over your gate, and a camera
 * you can drag all the way round. Ekpoma-style: cream, peach and sky-blue walls, zinc and tile
 * roofs, nothing Lagos-tall.
 */

/** Where the far side of the road starts (the road runs z 1.6..6.0 in front of the houses). */
const FAR_KERB = 6.0
const FAR_PAVE = 2.8
const BUILD_Z = FAR_KERB + FAR_PAVE + 0.3

const BLOCKS_URL = '/models/street-blocks.glb?v=1'
/** Width of one row of blocks in the model (fronts at z 0, built 8 deep). */
const ROW_W = 65.5

/** Everything across the road and along the kerbs, as a few instanced meshes. */
export function StreetDressing({ width, gateX }: { width: number; gateX?: number }) {
  const { boxes, poles, lamps, crowns, trunks } = useMemo(() => {
    const span = width + 40
    const boxes: Shape[] = [
      // Far pavement, kerbs on both sides of the road, a drain line on ours
      { p: [0, 0.04, FAR_KERB + FAR_PAVE / 2], s: [span, 0.08, FAR_PAVE], c: '#bdb6a8' },
      { p: [0, 0.07, FAR_KERB + 0.1], s: [span, 0.14, 0.22], c: '#e4e1d8' },
      { p: [0, 0.07, 1.48], s: [span, 0.14, 0.22], c: '#e4e1d8' },
      { p: [0, 0.03, BUILD_Z + 8], s: [span, 0.04, 16], c: '#c48a5a' },
    ]
    // Paver joints on the far pavement
    for (let x = -span / 2; x < span / 2; x += 1.2) boxes.push({ p: [x, 0.085, FAR_KERB + FAR_PAVE / 2], s: [0.03, 0.01, FAR_PAVE], c: '#a8a194' })

    // Across the road: the Innovation Hub courtyard's blocks (StreetBlocks, a GLB), not drawn here

    // Street lights on both pavements, trees on the far one
    const poles: Shape[] = []
    const lamps: Shape[] = []
    const trunks: Shape[] = []
    const crowns: Shape[] = []
    for (let lx = -span / 2 + 4; lx < span / 2; lx += 11) {
      for (const [z, arm] of [
        [1.1, 1],
        [FAR_KERB + 0.6, -1],
      ] as const) {
        // On our side, never in front of your gate
        if (arm === 1 && gateX !== undefined && Math.abs(lx - gateX) < 3.2) continue
        poles.push({ p: [lx, 2.6, z], s: [0.16, 5.2, 0.16], c: '#5b6470' })
        boxes.push({ p: [lx, 5.15, z + arm * 0.55], s: [0.1, 0.1, 1.1], c: '#5b6470' })
        lamps.push({ p: [lx, 5.05, z + arm * 1.05], s: [0.5, 0.18, 0.3], c: '#fff6d8' })
      }
    }
    for (let tx = -span / 2 + 9.5; tx < span / 2; tx += 11) {
      trunks.push({ p: [tx, 1.1, FAR_KERB + 1.6], s: [0.28, 2.2, 0.28], c: '#6b4a2b' })
      crowns.push({ p: [tx, 3.0, FAR_KERB + 1.6], s: [2.6, 2.2, 2.6], c: '#3f7d34' })
    }
    return { boxes, poles, lamps, crowns, trunks }
  }, [width, gateX])

  return (
    <>
      <InstancedShapes key={`d-${boxes.length}`} shapes={boxes} />
      <InstancedShapes key={`p-${poles.length}`} kind="cylinder" shapes={poles} />
      <InstancedShapes key={`l-${lamps.length}`} shapes={lamps} roughness={0.3} />
      <InstancedShapes key={`tt-${trunks.length}`} kind="cylinder" shapes={trunks} />
      <InstancedShapes key={`tc-${crowns.length}`} kind="sphere" shapes={crowns} />
    </>
  )
}

/**
 * The buildings across the road: the same cream campus blocks as the Innovation Hub courtyard
 * (scripts/blender/street-blocks.py), turned to face the road, repeated to fill the street.
 * Their windows glow only softly by day.
 */
export function StreetBlocks({ width }: { width: number }) {
  const { scene } = useGLTF(BLOCKS_URL)
  const rows = Math.max(1, Math.ceil((width + 40) / ROW_W))
  const copies = useMemo(
    () =>
      Array.from({ length: rows }, () => {
        const root = scene.clone(true)
        root.traverse((o) => {
          const mesh = o as Mesh
          if (!mesh.isMesh) return
          const m = mesh.material as MeshStandardMaterial
          if (m && 'emissiveIntensity' in m && m.emissiveMap) {
            mesh.material = m.clone()
            ;(mesh.material as MeshStandardMaterial).emissiveIntensity = 0.35
          }
        })
        return root
      }),
    [scene, rows],
  )
  return (
    <>
      {copies.map((root, i) => (
        <primitive key={i} object={root} position={[(i - (rows - 1) / 2) * ROW_W, 0, BUILD_Z]} rotation={[0, Math.PI, 0]} />
      ))}
    </>
  )
}
useGLTF.preload(BLOCKS_URL)

const PASSING = [
  { model: 'corolla', color: '#c9ccd1', lane: 2.6, speed: 6.5, from: 0 },
  { model: 'camry', color: '#7a1c22', lane: 5.0, speed: -5.5, from: 0.45 },
  { model: 'scout', color: '#5a6b3a', lane: 5.0, speed: -7, from: 0.85 },
]

/** A few cars driving past, both ways, looping off the ends of the street. Calm: Ekpoma, not Lagos. */
export function PassingCars({ width, skipNear }: { width: number; skipNear?: { x: number; length: number } }) {
  const refs = useRef<(Group | null)[]>([])
  const span = width + 30
  useFrame(({ clock }) => {
    PASSING.forEach((car, i) => {
      const g = refs.current[i]
      if (!g) return
      const t = (clock.elapsedTime * Math.abs(car.speed)) / span + car.from
      const u = t - Math.floor(t)
      const x = car.speed > 0 ? -span / 2 + u * span : span / 2 - u * span
      // The near lane passes your parked car: those cars swing out round it
      const swing = skipNear && car.lane < 4 && Math.abs(x - skipNear.x) < skipNear.length ? 1.6 : 0
      g.position.set(x, 0, car.lane + swing)
    })
  })
  return (
    <>
      {PASSING.map((car, i) => (
        <group key={car.model} ref={(g) => void (refs.current[i] = g)} rotation={[0, car.speed > 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
          <group scale={0.85}>
            <CarModel id={car.model} color={car.color} />
          </group>
        </group>
      ))}
    </>
  )
}

function signTexture(area: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 160
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#136b3a'
  ctx.fillRect(0, 0, 512, 160)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 8
  ctx.strokeRect(10, 10, 492, 140)
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '800 58px system-ui, sans-serif'
  ctx.fillText(area.toUpperCase().slice(0, 16), 256, 66, 470)
  ctx.font = '600 30px system-ui, sans-serif'
  ctx.fillText('Your home', 256, 120)
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  return tex
}

/** The big green board over your gate: your area (G2, Poultry Road…) and "Your home". */
export function HomeSign({ area, x, y, z }: { area: string; x: number; y: number; z: number }) {
  const map = useMemo(() => signTexture(area), [area])
  useEffect(() => () => map.dispose(), [map])
  return (
    <group position={[x, y, z]}>
      <mesh>
        <boxGeometry args={[2.9, 0.92, 0.08]} />
        <meshStandardMaterial color="#136b3a" />
      </mesh>
      <mesh position={[0, 0, 0.045]}>
        <planeGeometry args={[2.85, 0.89]} />
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
      {[-1.25, 1.25].map((px) => (
        <mesh key={px} position={[px, -0.95, -0.02]}>
          <boxGeometry args={[0.08, 1.1, 0.08]} />
          <meshStandardMaterial color="#4b5563" />
        </mesh>
      ))}
    </group>
  )
}

/** Shared with the joystick: the camera's turn round the player, so "up" walks away from it. */
export const streetView = { yaw: 0, pitch: 0.42, dist: 9 }

/**
 * Third-person camera behind your character that you can drag all the way round (and pinch or
 * scroll to come closer / go back). A tap still walks you there; only a real drag turns the view.
 */
export function OrbitStreetCamera({ player }: { player: React.RefObject<[number, number]> }) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const look = useRef(new Vector3())
  const placed = useRef(false)
  const portrait = size.width / Math.max(size.height, 1) < 0.75

  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    camera.fov = portrait ? 60 : 48
    camera.updateProjectionMatrix()
  }, [camera, portrait])

  useEffect(() => {
    // Start looking at the houses from the road, like stepping out of the gate and turning round
    Object.assign(streetView, { yaw: 0, pitch: 0.38, dist: portrait ? 10.5 : 11 })
    const el = gl.domElement
    const touches = new Map<number, { x: number; y: number }>()
    let dragged = false
    const spread = () => {
      const [a, b] = [...touches.values()]
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
    }
    const down = (e: PointerEvent) => {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      dragged = false
    }
    const move = (e: PointerEvent) => {
      const was = touches.get(e.pointerId)
      if (!was) return
      const before = spread()
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (touches.size >= 2) {
        const now = spread()
        if (before > 0 && now > 0) streetView.dist = Math.max(4, Math.min(16, (streetView.dist * before) / now))
        dragged = true
        return
      }
      const dx = e.clientX - was.x
      const dy = e.clientY - was.y
      if (!dragged && Math.hypot(dx, dy) < 4) return
      dragged = true
      streetView.yaw -= dx * 0.0085
      streetView.pitch = Math.max(0.12, Math.min(1.1, streetView.pitch - dy * 0.005))
    }
    const up = (e: PointerEvent) => {
      touches.delete(e.pointerId)
    }
    // A drag is not a tap: stop the click that would walk you there
    const click = (e: MouseEvent) => {
      if (dragged) {
        e.stopPropagation()
        dragged = false
      }
    }
    const wheel = (e: WheelEvent) => {
      streetView.dist = Math.max(4, Math.min(16, streetView.dist * (e.deltaY > 0 ? 1.1 : 0.9)))
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    el.addEventListener('click', click, true)
    el.addEventListener('wheel', wheel, { passive: true })
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      el.removeEventListener('click', click, true)
      el.removeEventListener('wheel', wheel)
    }
  }, [gl, portrait])

  useFrame((_, delta) => {
    const [px, pz] = player.current
    const { yaw, pitch, dist } = streetView
    // Yaw 0: camera out on the road (+z) looking back at the houses (-z)
    const goal = new Vector3(px + Math.sin(yaw) * Math.cos(pitch) * dist, 1.2 + Math.sin(pitch) * dist, pz + Math.cos(yaw) * Math.cos(pitch) * dist)
    // Stay on the street: in front of the fences and short of the buildings across the road, so
    // turning round to face the road never puts the camera inside a house
    if (goal.z < 0.7) {
      goal.y += (0.7 - goal.z) * 0.12
      goal.z = 0.7
    }
    if (goal.z > BUILD_Z - 1.2) goal.z = BUILD_Z - 1.2
    const target = new Vector3(px, 1.2, pz)
    if (!placed.current) {
      camera.position.copy(goal)
      look.current.copy(target)
      placed.current = true
    } else {
      const k = Math.min(1, delta * 6)
      camera.position.lerp(goal, k)
      look.current.lerp(target, k)
    }
    camera.lookAt(look.current)
  })
  return null
}
