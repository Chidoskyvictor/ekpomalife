'use client'

import { Html, useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { PerspectiveCamera, Vector3, type AmbientLight, type DirectionalLight, type HemisphereLight } from 'three'
import { RoomPlayer, type PlayerMove } from '@/components/room/room-player'
import type { Appearance } from '@/lib/game/look'
import { roomLightAt } from '@/lib/game/room-lighting'
import {
  GATE_REACH,
  gateSpot,
  LOTS,
  lotsFor,
  lotX,
  ROAD,
  streetForLodging,
  streetLayout,
  type StreetTemplate,
} from '@/lib/game/street'
import { InstancedShapes, type Shape } from './instanced-shapes'
import { HomeSign, OrbitStreetCamera, PassingCars, StreetDressing, streetView } from './street-dressing'
import { PARKED_CAR, ParkedCar, StreetBoy } from './street-extras'
import styles from './street.module.css'

export type StreetProps = {
  lodgingId?: string | null
  houseNumber?: number | null
  /** Your wall paint: your house is painted the same outside. */
  paint?: string
  appearance?: Appearance
  clock?: () => number
  /** Your home's GLB: fetched and parsed in the background so "Go inside" is instant. */
  preloadGlb?: string
  /** Fires when you walk within reach of your own gate, and again when you walk off. */
  onNearGate?: (near: boolean) => void
  /** The car you drive, parked at the kerb by your gate (none: no car outside). */
  car?: { model: string; color: string } | null
  /** Fires when you walk up to your car (to show "Get in"), and again when you walk off. */
  onNearCar?: (near: boolean) => void
  /** How the street boy greets you: "Brother" or "Sister". */
  boyWord?: string
  /** The on-screen joystick (screen directions, -1..1). */
  stick?: { x: number; z: number }
  /** Your area, on the green sign over your gate (G2, Poultry Road…). */
  area?: string
}

/** Neighbours' walls: Ekpoma cream, sky blue, mint, peach… */
const HOUSE_TINTS = ['#efe3c8', '#cfe3f0', '#d8ecd5', '#f3d9c4', '#e9e1f2', '#f5edb8']
const ROOF = ['#7d8b99', '#8d5b3e', '#6f7f6a']
const FENCE = '#e6dccb'
const PILLAR = '#d3c6ad'
const GATE = '#3b4a5a'
const OWN_GATE = '#2f7a4f'
const DOOR = '#6b4a2b'
const GLASS = '#9ec9ef'

function buildCompounds(t: StreetTemplate, own: number, numbers: number[], paint?: string) {
  const boxes: Shape[] = []
  const { w, d, h } = t.house
  const depth = d + 3.4
  const half = (LOTS * t.lotW) / 2
  const pitch = 0.32
  for (let i = 0; i < LOTS; i++) {
    const cx = lotX(t, i)
    const wall = i === own && paint ? paint : HOUSE_TINTS[(numbers[i] * 7) % HOUSE_TINTS.length]
    const zc = -1.7 - d / 2
    // Yard, house, door and windows
    boxes.push({ p: [cx, 0.015, -depth / 2], s: [t.lotW - 0.25, 0.03, depth], c: '#cdc4b2' })
    boxes.push({ p: [cx, h / 2, zc], s: [w, h, d], c: wall })
    boxes.push({ p: [cx, 1.0, -1.66], s: [0.95, 2.0, 0.08], c: DOOR })
    boxes.push({ p: [cx - w * 0.3, 1.55, -1.66], s: [1.0, 0.8, 0.06], c: GLASS })
    boxes.push({ p: [cx + w * 0.3, 1.55, -1.66], s: [1.0, 0.8, 0.06], c: GLASS })
    // Zinc roof, two slopes
    const hd = (d + 0.7) / 2
    const roof = ROOF[numbers[i] % ROOF.length]
    const ry = h + (hd / 2) * Math.tan(pitch) + 0.06
    boxes.push({ p: [cx, ry, zc + hd / 2], s: [w + 0.6, 0.08, hd / Math.cos(pitch)], r: [pitch, 0, 0], c: roof })
    boxes.push({ p: [cx, ry, zc - hd / 2], s: [w + 0.6, 0.08, hd / Math.cos(pitch)], r: [-pitch, 0, 0], c: roof })
    // Front fence with a gap for the gate, pillars and the two gate leaves
    const piece = t.lotW / 2 - t.gateW / 2 - 0.2
    for (const side of [-1, 1]) {
      boxes.push({ p: [cx + side * (t.gateW / 2 + 0.2 + piece / 2), t.fenceH / 2, 0], s: [piece, t.fenceH, 0.22], c: FENCE })
      boxes.push({ p: [cx + side * (t.gateW / 2 + 0.1), (t.fenceH + 0.3) / 2, 0], s: [0.34, t.fenceH + 0.3, 0.34], c: PILLAR })
      boxes.push({
        p: [cx + side * (t.gateW / 4), t.fenceH * 0.48, 0.02],
        s: [t.gateW / 2 - 0.05, t.fenceH * 0.9, 0.06],
        c: i === own ? OWN_GATE : GATE,
      })
    }
    // Side wall on the left of every lot, back wall behind
    boxes.push({ p: [cx - t.lotW / 2, t.fenceH / 2, -depth / 2], s: [0.22, t.fenceH, depth], c: FENCE })
    boxes.push({ p: [cx, t.fenceH / 2, -depth], s: [t.lotW, t.fenceH, 0.22], c: FENCE })
  }
  boxes.push({ p: [half, t.fenceH / 2, -depth / 2], s: [0.22, t.fenceH, depth], c: FENCE })
  return boxes
}

function buildHostel(t: StreetTemplate, own: number, paint?: string) {
  const boxes: Shape[] = []
  const { d, h } = t.house
  const width = LOTS * t.lotW + 2
  boxes.push({ p: [0, h / 2, -d / 2], s: [width, h, d], c: '#efe6d2' })
  boxes.push({ p: [0, h / 2, 0.03], s: [width, 0.25, 0.1], c: '#c9b994' }) // floor band
  boxes.push({ p: [0, h + 0.15, -d / 2], s: [width + 0.8, 0.3, d + 0.8], c: '#8a99a6' })
  for (let i = 0; i < LOTS; i++) {
    const x = lotX(t, i)
    boxes.push({ p: [x - 0.5, 1.05, 0.04], s: [t.gateW, 2.1, 0.08], c: i === own ? (paint ?? OWN_GATE) : DOOR })
    boxes.push({ p: [x + 0.95, 1.5, 0.04], s: [0.8, 0.75, 0.06], c: GLASS })
    boxes.push({ p: [x, h * 0.74, 0.04], s: [1.6, 1.0, 0.06], c: GLASS })
  }
  return boxes
}

/** Ground, road and trees: the same for every street. */
function buildGround(width: number) {
  const boxes: Shape[] = [
    { p: [0, -0.02, -6], s: [width + 60, 0.02, 40], c: '#c48a5a' }, // laterite
    { p: [0, 0.01, ROAD.z0 + 0.6], s: [width + 60, 0.03, 1.5], c: '#cfc8ba' }, // pavement
    { p: [0, 0.005, 3.8], s: [width + 60, 0.02, 4.4], c: '#5d6168' }, // road
  ]
  for (let x = -width / 2 - 20; x < width / 2 + 20; x += 3) {
    boxes.push({ p: [x, 0.02, 3.8], s: [1.4, 0.01, 0.12], c: '#f1f1ea' })
  }
  const trunks: Shape[] = []
  const canopies: Shape[] = []
  return { boxes, trunks, canopies }
}

/** Sun, sky and ambient for the real time of day (eased, read twice a second). */
function StreetLights({ clock }: { clock: () => number }) {
  const sun = useRef<DirectionalLight>(null)
  const ambient = useRef<AmbientLight>(null)
  const hemi = useRef<HemisphereLight>(null)
  const next = useRef(0)
  useFrame((state) => {
    if (state.clock.elapsedTime < next.current) return
    next.current = state.clock.elapsedTime + 0.5
    const light = roomLightAt(clock())
    const el = (light.sunElevation * Math.PI) / 180
    const az = (light.sunAzimuth * Math.PI) / 180
    if (sun.current) {
      sun.current.color.set(light.sun)
      sun.current.intensity = light.sunIntensity
      sun.current.position.set(Math.sin(az) * Math.cos(el) * 30, Math.sin(el) * 30, Math.cos(az) * Math.cos(el) * 30)
    }
    if (ambient.current) {
      ambient.current.color.set(light.ambient)
      ambient.current.intensity = light.ambientIntensity
    }
    if (hemi.current) {
      hemi.current.color.set(light.hemiSky)
      hemi.current.groundColor.set(light.hemiGround)
      hemi.current.intensity = light.hemiIntensity
    }
  })
  return (
    <>
      <ambientLight ref={ambient} intensity={0.6} />
      <hemisphereLight ref={hemi} args={['#ffffff', '#c48a5a', 0.6]} />
      <directionalLight ref={sun} position={[12, 24, 16]} intensity={1} />
    </>
  )
}

/** Follows the player along the road from the front, a little above. */
function StreetCamera({ player, half }: { player: React.RefObject<[number, number]>; half: number }) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const look = useRef(new Vector3())
  const placed = useRef(false)
  const portrait = size.width / Math.max(size.height, 1) < 0.75

  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    camera.fov = portrait ? 62 : 45
    camera.updateProjectionMatrix()
    placed.current = false
  }, [camera, portrait])

  useFrame((_, delta) => {
    const [px, pz] = player.current
    // Portrait screens are narrow: stay closer to the player so the gates fill the width
    const x = Math.min(half - (portrait ? 3 : 7), Math.max(-half + (portrait ? 3 : 7), px))
    const goal = new Vector3(x, portrait ? 7.5 : 7, pz + (portrait ? 10.5 : 11.5))
    const target = new Vector3(x, 1.2, pz - 2.4)
    if (!placed.current) {
      camera.position.copy(goal)
      look.current.copy(target)
      placed.current = true
    } else {
      const k = Math.min(1, delta * 4)
      camera.position.lerp(goal, k)
      look.current.lerp(target, k)
    }
    camera.lookAt(look.current)
  })
  return null
}

/**
 * The street outside your home: a shared template per home type, light enough for phones
 * (all walls, gates and houses are a few instanced meshes). Only the road is walkable; your
 * gate has your house number and the floating "Your house" tag.
 */
export function StreetScene({ lodgingId, houseNumber, paint, appearance, clock, preloadGlb, onNearGate, car, onNearCar, boyWord = 'Brother', stick, area = 'Ekpoma' }: StreetProps) {
  const t = streetForLodging(lodgingId)
  const { own, numbers } = lotsFor(houseNumber)
  const half = (LOTS * t.lotW) / 2
  const gateAt = gateSpot(t, own)
  // Your car waits at the kerb a few steps along from your gate (the other way at the end of the street)
  const carX = gateAt[0] + 4.4 < half - 2.5 ? gateAt[0] + 4.4 : gateAt[0] - 4.4
  const CAR_Z = 2.7
  const layout = useMemo(() => {
    const base = streetLayout(t, own)
    if (!car) return base
    const block: [number, number, number, number] = [carX - PARKED_CAR.length / 2, CAR_Z - PARKED_CAR.width / 2, carX + PARKED_CAR.length / 2, CAR_Z + PARKED_CAR.width / 2]
    return { ...base, blocks: [...base.blocks, block] }
  }, [t, own, car, carX])
  const houses = useMemo(
    () => (t.kind === 'block' ? buildHostel(t, own, paint) : buildCompounds(t, own, numbers, paint)),
    // numbers only change with own's block
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, own, numbers[0], paint],
  )
  const ground = useMemo(() => buildGround(LOTS * t.lotW), [t])
  const gate = gateSpot(t, own)
  const player = useRef<[number, number]>(gate)
  const near = useRef<boolean | null>(null)
  const nearCar = useRef<boolean | null>(null)
  // The joystick in screen directions, turned to match the camera: "up" walks away from it
  const turnedStick = useMemo(
    () =>
      stick
        ? {
            get x() {
              const c = Math.cos(streetView.yaw)
              const s = Math.sin(streetView.yaw)
              return c * stick.x + s * stick.z
            },
            get z() {
              const c = Math.cos(streetView.yaw)
              const s = Math.sin(streetView.yaw)
              return -s * stick.x + c * stick.z
            },
          }
        : undefined,
    [stick],
  )
  const plateY = t.kind === 'block' ? 2.45 : t.fenceH + 0.55
  const day = clock ?? (() => 12 * 60)

  useEffect(() => {
    if (preloadGlb) useGLTF.preload(preloadGlb)
  }, [preloadGlb])

  // Leaving the street: the gate button goes away with it
  useEffect(() => () => onNearGate?.(false), [onNearGate])
  useEffect(() => () => onNearCar?.(false), [onNearCar])

  const onMove = (move: PlayerMove) => {
    player.current = [move.x, move.z]
    const isNear = Math.hypot(move.x - gate[0], move.z - gate[1]) <= GATE_REACH
    if (isNear !== near.current) {
      near.current = isNear
      onNearGate?.(isNear)
    }
    if (car) {
      // Within a step of the car's side or ends
      const gx = Math.max(0, Math.abs(move.x - carX) - PARKED_CAR.length / 2)
      const gz = Math.max(0, Math.abs(move.z - CAR_Z) - PARKED_CAR.width / 2)
      const byCar = Math.hypot(gx, gz) < 1.4
      if (byCar !== nearCar.current) {
        nearCar.current = byCar
        onNearCar?.(byCar)
      }
    }
  }

  return (
    <>
      <StreetLights clock={day} />
      <InstancedShapes key={`g-${ground.boxes.length}`} shapes={ground.boxes} />
      <InstancedShapes key={`h-${t.id}`} shapes={houses} />
      <InstancedShapes key={`t-${ground.trunks.length}`} kind="cylinder" shapes={ground.trunks} />
      <InstancedShapes key={`c-${ground.canopies.length}`} kind="sphere" shapes={ground.canopies} />

      {numbers.map((n, i) => (
        <Html
          key={n}
          position={[t.kind === 'block' ? lotX(t, i) - 0.5 : lotX(t, i), plateY, 0.25]}
          center
          zIndexRange={[10, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <span className={i === own ? `${styles.plate} ${styles.plateOwn}` : styles.plate}>No. {n}</span>
        </Html>
      ))}
      <HomeSign area={area} x={gate[0] - (t.kind === 'block' ? 0.5 : 0)} y={plateY + 1.35} z={0.3} />
      <StreetDressing width={LOTS * t.lotW} gateX={gate[0]} />
      <PassingCars width={LOTS * t.lotW} skipNear={car ? { x: carX, length: PARKED_CAR.length + 3 } : undefined} />

      {car ? <ParkedCar model={car.model} color={car.color} x={carX} z={CAR_Z} /> : null}
      <StreetBoy player={player} minX={-half + 2} maxX={half - 2} z={4.6} word={boyWord} />

      <RoomPlayer key={`street-${t.id}-${own}-${car ? 'car' : 'none'}`} layout={layout} spawn={gate} appearance={appearance} onMove={onMove} stick={turnedStick} />
      <OrbitStreetCamera player={player} />
    </>
  )
}
