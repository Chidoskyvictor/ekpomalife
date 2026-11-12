'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CanvasTexture, PerspectiveCamera, SRGBColorSpace, Vector3, type Group } from 'three'
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

const WALLS = ['#efe3c8', '#f3d9c4', '#cfe3f0', '#e9e1f2', '#f5edb8', '#d8ecd5']
const AWNINGS = ['#c0392b', '#1f6f43', '#2563eb', '#d97706', '#7c3aed']
const SHOP_SIGNS = ['#0f5132', '#7a1c22', '#1e3a8a', '#92400e']

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

    // Across the road: shops and blocks, left to right
    let x = -span / 2 + 2
    let i = 0
    while (x < span / 2 - 4) {
      const shop = i % 3 !== 1
      const w = shop ? 6 + (i % 2) * 2 : 9 + (i % 2) * 2
      const cx = x + w / 2
      const wall = WALLS[(i * 5) % WALLS.length]!
      if (shop) {
        // One storey shop: shutters, awning, signboard on top
        const h = 3.6
        boxes.push({ p: [cx, h / 2, BUILD_Z + 3], s: [w, h, 6], c: wall })
        boxes.push({ p: [cx, h + 0.15, BUILD_Z + 3], s: [w + 0.3, 0.3, 6.3], c: '#8a8f96' })
        boxes.push({ p: [cx, 1.15, BUILD_Z - 0.01], s: [w - 1.2, 2.3, 0.06], c: '#9aa3ad' })
        for (let k = -w / 2 + 0.9; k < w / 2 - 0.6; k += 0.35) boxes.push({ p: [cx + k, 1.15, BUILD_Z - 0.05], s: [0.04, 2.3, 0.02], c: '#7c858f' })
        boxes.push({ p: [cx, 2.75, BUILD_Z - 0.75], s: [w - 0.4, 0.08, 1.6], r: [0.22, 0, 0], c: AWNINGS[i % AWNINGS.length]! })
        boxes.push({ p: [cx, h + 0.75, BUILD_Z + 0.1], s: [w - 1, 0.9, 0.12], c: SHOP_SIGNS[i % SHOP_SIGNS.length]! })
      } else {
        // Two or three storeys with a balcony rail on each floor
        const floors = 2 + (i % 2)
        const fh = 3.1
        const h = floors * fh
        boxes.push({ p: [cx, h / 2, BUILD_Z + 4], s: [w, h, 8], c: wall })
        boxes.push({ p: [cx, h + 0.2, BUILD_Z + 4], s: [w + 0.5, 0.4, 8.5], c: i % 4 === 0 ? '#7d8b99' : '#8d5b3e' })
        for (let f = 0; f < floors; f++) {
          const y = f * fh
          for (let k = -w / 2 + 1.4; k < w / 2 - 1; k += 2.4) {
            boxes.push({ p: [cx + k + 0.6, y + 1.7, BUILD_Z - 0.01], s: [1.2, 1.2, 0.06], c: '#4a6b80' })
          }
          if (f > 0) {
            boxes.push({ p: [cx, y + 0.05, BUILD_Z - 0.6], s: [w - 0.6, 0.12, 1.2], c: '#d6d0c2' })
            boxes.push({ p: [cx, y + 0.6, BUILD_Z - 1.15], s: [w - 0.6, 0.08, 0.06], c: '#3b4a5a' })
            for (let k = -w / 2 + 0.5; k < w / 2 - 0.3; k += 0.5) boxes.push({ p: [cx + k, y + 0.35, BUILD_Z - 1.15], s: [0.04, 0.5, 0.04], c: '#3b4a5a' })
          }
        }
        boxes.push({ p: [cx - w / 2 + 1.4, 1.1, BUILD_Z - 0.02], s: [1.1, 2.2, 0.06], c: '#6b4a2b' })
      }
      x += w + 0.6
      i += 1
    }

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
