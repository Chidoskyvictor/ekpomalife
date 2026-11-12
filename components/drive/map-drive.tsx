'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { CanvasTexture, SRGBColorSpace, Vector3, type Group } from 'three'
import { CarModel } from '@/components/cars/car-model'
import type { Peer, PeerState } from '@/lib/game/club-live'
import { CARS } from '@/lib/game/cars-rules'
import { driveCommand, driveInput, driveTelemetry, driveView, type DriveStart } from '@/lib/game/drive'

/* Feel of the car, in map units (a car is about 1.9 long there). Multiplied by the world's `unit`.
   Each car has its own top speed (km/h on the dial = units × 9) and pull; these are for an unknown model. */
const TOP = 9
const TOP_OFF_ROAD = 4.6
const REVERSE = 3
const GAS = 5.5
const BRAKE = 13
const DRAG = 2.4
const TURN = 1.25
/** A hit faster than this leaves a dent. */
const DENT_SPEED = 4.6

export type DriveWorld = {
  /** Metres (or map units) per "map unit" of car feel: 1 on the town map, 2.5 in the street world. */
  unit: number
  /** How big to draw the car model (it is modelled in metres). */
  carScale: number
  blocked: (x: number, z: number) => boolean
  /** Full speed here? (off the tarmac is slower) */
  fast: (x: number, z: number) => boolean
}

/**
 * Your car while you drive it: thumbs in `driveInput` move it, kerbs, walls and the ends of the
 * road stop it (a bump, and a dent if it was hard), and the camera follows low behind the boot.
 * Writes where it is to `driveTelemetry` and to the live room every frame.
 */
export function DriveCar({
  car,
  start,
  send,
  world,
}: {
  car: { model: string; color: string }
  start: DriveStart
  send: (state: PeerState) => void
  world: DriveWorld
}) {
  const group = useRef<Group>(null)
  const camera = useThree((s) => s.camera)
  const spec = CARS.find((c) => c.id === car.model)
  const carTop = spec ? spec.topKmh / 9 : TOP
  const carGas = spec?.accel ?? GAS
  const body = useRef({ x: start.x, z: start.z, h: start.h, v: 0, shake: 0, steer: 0 })
  const look = useMemo(() => new Vector3(), [])
  const want = useMemo(() => new Vector3(), [])
  const placed = useRef(false)
  const u = world.unit

  // Keyboard for desktop: arrows or WASD
  useEffect(() => {
    const keys = new Set<string>()
    const sync = () => {
      driveInput.gas = keys.has('arrowup') || keys.has('w')
      driveInput.brake = keys.has('arrowdown') || keys.has('s')
      driveInput.steer = (keys.has('arrowleft') || keys.has('a') ? 1 : 0) - (keys.has('arrowright') || keys.has('d') ? 1 : 0)
    }
    const down = (e: KeyboardEvent) => {
      keys.add(e.key.toLowerCase())
      sync()
    }
    const up = (e: KeyboardEvent) => {
      keys.delete(e.key.toLowerCase())
      sync()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const b = body.current
    const top = (world.fast(b.x, b.z) ? carTop : TOP_OFF_ROAD) * u
    if (driveCommand.warp) {
      Object.assign(b, { x: driveCommand.warp.x, z: driveCommand.warp.z, h: driveCommand.warp.h, v: 0, steer: 0 })
      driveCommand.warp = null
      placed.current = false
    }

    if (driveInput.gas) b.v += carGas * u * dt * Math.max(0.35, 1 - Math.abs(b.v) / (carTop * u * 1.15)) // pulls hard, eases near the top
    else if (driveInput.brake) b.v -= (b.v > 0.3 * u ? BRAKE : GAS * 0.7) * u * dt // brake, then roll backwards
    else b.v -= Math.sign(b.v) * Math.min(Math.abs(b.v), DRAG * u * dt)
    if (b.v > top) b.v = Math.max(top, b.v - BRAKE * u * dt)
    if (b.v < -REVERSE * u) b.v = -REVERSE * u
    if (driveCommand.hold) b.v = 0

    // The wheel eases toward your thumb, bites as the car gets moving, and firms up at speed
    // (reversed when backing up)
    b.steer += (driveInput.steer - b.steer) * Math.min(1, dt * 5)
    const pace = Math.abs(b.v) / (TOP * u) // steering firms up the same way for every car
    b.h += b.steer * TURN * dt * Math.min(1, Math.abs(b.v) / (2.5 * u)) * (1 - 0.5 * Math.min(1, pace)) * Math.sign(b.v)

    const nx = b.x + Math.sin(b.h) * b.v * dt
    const nz = b.z + Math.cos(b.h) * b.v * dt
    // Already inside something (parked tight against a kerb)? Let it drive out
    if (!world.blocked(nx, nz) || world.blocked(b.x, b.z)) {
      b.x = nx
      b.z = nz
    } else {
      const hit = Math.abs(b.v) / u
      if (hit > 0.8) {
        driveTelemetry.bumps += 1
        b.shake = Math.min(0.5, hit * 0.06) * u
        if (hit > DENT_SPEED) driveTelemetry.dents += 1
      }
      b.v = -b.v * 0.3
    }

    const g = group.current
    if (g) {
      g.position.set(b.x, 0.05, b.z)
      g.rotation.y = b.h
    }

    // Street level: low and close behind the boot, so roads feel wide and buildings tall
    b.shake = Math.max(0, b.shake - dt * 1.6 * u)
    const jolt = b.shake ? (Math.random() - 0.5) * b.shake : 0
    // Looked around? The view swings back behind the car a moment after you let go and drive on
    const v = driveView
    if (!v.held && performance.now() - v.at > 2500 && Math.abs(b.v) > 1.5 * u) {
      const ease = Math.min(1, dt * 2.5)
      v.yaw -= v.yaw * ease
      v.tilt -= v.tilt * ease
    }
    const around = b.h + v.yaw
    const back = 4.6 * u * v.zoom
    want.set(b.x - Math.sin(around) * back + jolt, (1.9 + v.tilt * 4) * u * v.zoom, b.z - Math.cos(around) * back + jolt)
    if (placed.current) camera.position.lerp(want, 1 - Math.exp(-dt * (v.held ? 14 : 5)))
    else camera.position.copy(want)
    placed.current = true
    // Straight behind: look up the road. Turned: look at the car
    const ahead = 4 * u * Math.max(0, Math.cos(v.yaw))
    look.set(b.x + Math.sin(b.h) * ahead, 0.7 * u, b.z + Math.cos(b.h) * ahead)
    camera.lookAt(look)

    driveTelemetry.x = b.x
    driveTelemetry.z = b.z
    driveTelemetry.h = b.h
    driveTelemetry.speed = b.v / u
    send({ x: b.x, y: 0, z: b.z, h: b.h, pose: 'sit', moving: Math.abs(b.v) > 0.2 * u })
  })

  return (
    <group ref={group} position={[start.x, 0.05, start.z]} rotation={[0, start.h, 0]} scale={world.carScale}>
      <CarModel id={car.model} color={car.color} />
    </group>
  )
}

const nameCache = new Map<string, CanvasTexture>()
function nameTexture(name: string) {
  let hit = nameCache.get(name)
  if (!hit) {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 64
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'rgba(17,24,39,.82)'
    ctx.beginPath()
    ctx.roundRect(2, 8, 252, 48, 24)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = '700 28px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`@${name}`.slice(0, 15), 128, 33)
    hit = new CanvasTexture(canvas)
    hit.colorSpace = SRGBColorSpace
    nameCache.set(name, hit)
  }
  return hit
}

const PLAYBACK_DELAY_MS = 250

/** Another player's car, gliding after the positions their phone sends. Hidden until they are at the wheel. */
function PeerCar({ peer, scale }: { peer: Peer; scale: number }) {
  const group = useRef<Group>(null)
  const [model, color] = (peer.car ?? '').split(':')
  useFrame((_, delta) => {
    const g = group.current
    const s = peer.state
    if (!g) return
    const driving = Boolean(s && s.pose === 'sit')
    if (driving && !g.visible) g.position.set(s!.x, 0.05, s!.z)
    g.visible = driving
    if (!driving || !s) return
    // Play their positions back ~0.25 s late, interpolating between real samples, so the car moves
    // steadily instead of chasing the newest point and jumping when the next one arrives.
    const tr = peer.trail
    let tx = s.x, tz = s.z, th = s.h
    if (tr && tr.length > 1) {
      const at = performance.now() - PLAYBACK_DELAY_MS
      let i = tr.length - 1
      while (i > 0 && tr[i - 1].t > at) i--
      const a = tr[Math.max(0, i - 1)]
      const b = tr[i]
      if (at >= b.t) {
        // Past the newest sample (late packet): carry on at their last speed for a moment
        const p = tr[tr.length - 2]
        const span = Math.max(1, b.t - p.t)
        const ahead = Math.min(at - b.t, 300) / span
        tx = b.x + (b.x - p.x) * ahead
        tz = b.z + (b.z - p.z) * ahead
        th = b.h
      } else if (at > a.t) {
        const f = (at - a.t) / Math.max(1, b.t - a.t)
        tx = a.x + (b.x - a.x) * f
        tz = a.z + (b.z - a.z) * f
        th = a.h + Math.atan2(Math.sin(b.h - a.h), Math.cos(b.h - a.h)) * f
      } else {
        tx = a.x; tz = a.z; th = a.h
      }
    }
    // Snap if far off (teleport / respawn), otherwise a light smoothing on top
    if (Math.hypot(tx - g.position.x, tz - g.position.z) > 40) g.position.set(tx, 0.05, tz)
    const k = 1 - Math.exp(-delta * 18)
    g.position.x += (tx - g.position.x) * k
    g.position.z += (tz - g.position.z) * k
    let turn = th - g.rotation.y
    turn = Math.atan2(Math.sin(turn), Math.cos(turn))
    g.rotation.y += turn * k
  })
  if (!model) return null
  return (
    <group ref={group} visible={false}>
      <group scale={scale}>
        <CarModel id={model} color={color ?? '#c9ccd1'} />
      </group>
      <sprite position={[0, 2.0 * scale + 0.45, 0]} scale={[2.6 * scale, 0.65 * scale, 1]}>
        <spriteMaterial map={nameTexture(peer.username)} depthTest={false} />
      </sprite>
    </group>
  )
}

/** Everyone else who is driving right now. */
export function PeerCars({ peers, roster, scale }: { peers: MutableRefObject<Map<string, Peer>>; roster: number; scale: number }) {
  // roster bumps when someone joins or leaves
  const list = useMemo(() => [...peers.current.values()].filter((p) => p.car), [peers, roster]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group>
      {list.map((p) => (
        <PeerCar key={p.userId} peer={p} scale={scale} />
      ))}
    </group>
  )
}
