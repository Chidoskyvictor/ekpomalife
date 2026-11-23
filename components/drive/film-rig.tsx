'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useMemo, useRef } from 'react'
import type { Group, PerspectiveCamera } from 'three'
import { CarModel, type CarRig } from '@/components/cars/car-model'
import { TruckModel } from '@/components/cars/truck-model'
import { driveTelemetry } from '@/lib/game/drive'
import { HALF, LANE, MID_LANE, roadById, spotAt } from '@/lib/game/drive-road'

/*
 * Film mode (dev only): the trailer's race, scripted, for frame-exact recording. No physics, no HUD,
 * no random traffic (the scene's NPCs are off in film mode). Every vehicle here is worked out ahead of
 * time on one timeline, with gaps checked, so nothing ever drives through anything.
 *
 * The story (film time t, seconds), after the owner's reference "car edit":
 *   0-3    the Lexus (SAMUEL) right behind the Benz (PRODIGY) in the middle lane
 *   3-5    the Lexus pulls into the inside lane, door to door with the Benz
 *   ~6     both fly under the G1 ROAD gantry
 *   6-11   the Ekpoma Life truck ahead in the Lexus's lane; the Benz shoots past it in the middle lane
 *   11-15  the Lexus is boxed in: it brakes hard, slides and spins, stopping short of the truck
 *   15-    the Benz drives on alone
 * Time comes from `window.__filmT` when a recorder sets it, otherwise from the clock.
 */

export type FilmShot =
  | 'chase' // behind and above the Lexus, the Benz ahead
  | 'between' // very low between the two cars, door to door
  | 'gantry' // a roadside cameraman under the G1 ROAD gantry, swinging round as they fly past
  | 'behind' // behind both cars, the truck ahead in the Lexus's lane
  | 'top' // drone straight down over the Lexus and the truck
  | 'truckwheel' // low beside the truck's back wheels, the Lexus sliding up behind it
  | 'spin' // roadside, following the Lexus as it spins out
  | 'front' // ahead of the Benz, low, as it rushes at the camera
  | 'wheel' // beside the Lexus's front wheel
  | 'wheel-benz'

declare global {
  interface Window {
    __filmT?: number
    /** A recorder can switch the shot without reloading */
    __filmShot?: FilmShot
  }
}

type Props = { road: string; s0: number; dir: number; shot: FilmShot; speed?: number }

const LEAD = { model: 'gla', color: '#f2f2ef' }
const CHASER = { model: 'rx350', color: '#b9bec5' }
const TRUCK_BACK = 10.9 // trailer's back end behind the truck's origin (m)
const TRUCK_FRONT = 3.04
const LEX_HALF = 2.45
const BENZ_HALF = 2.2

// Lanes on the expressway (offset from the centre line, on the cars' own side)
const MID = MID_LANE.highway // 7.25: middle lane
const INSIDE = 3.9 // inside lane, by the median
const OUTSIDE = LANE.highway // 10.75

/** When the Lexus, boxed in behind the truck with the Benz alongside, stands on the brakes. */
const BRAKE_AT = 10.1

type Frame = { lead: number; leadOff: number; lex: number; lexOff: number; lexV: number; lexYaw: number; lexBrake: boolean; truck: number }

/** The whole race worked out ahead of time at 240 steps a second (distances along the road from the start). */
function simulate(speed: number): Frame[] {
  const dt = 1 / 240
  const out: Frame[] = []
  const truckV = 10
  const truck0 = 240
  let lex = -9
  let lexV = speed
  let yaw = 0
  let yawV = 0
  let off = MID
  for (let i = 0; i <= 240 * 30; i++) {
    const t = i * dt
    const lead = speed * t
    const truck = truck0 + truckV * t
    // Where the Lexus wants to be: closing on the Benz, then alongside it (centres 0.4 m apart)
    // (it changes lane while still a full car length behind, then draws level)
    const gap = t < 1 ? 9 : t < 2.2 ? 9 - ((t - 1) / 1.2) * 2.2 : t < 3.8 ? 6.8 : Math.max(0.4, 6.8 - (t - 3.8) * 3.2)
    const want = lead - gap
    // Lane: middle, then into the inside lane while still well behind the Benz (no overlap during the move)
    const laneT = Math.min(1, Math.max(0, (t - 2.3) / 1.3))
    const ease = laneT * laneT * (3 - 2 * laneT)
    let targetOff = MID + (INSIDE - MID) * ease
    // Shoulder-to-shoulder push once alongside (never closer than 0.95 m door to door)
    if (t > 5.2 && t < 9.4) targetOff += Math.max(0, Math.sin((t - 5.2) * 2.3)) * 0.45
    // Speed: chase the target, but never past the point where the Lexus would reach the truck's back
    let vWant = speed + (want - lex) * 1.6
    // How far the Lexus reaches forward, turned sideways or not
    const reach = LEX_HALF * Math.abs(Math.cos(yaw)) + 0.97 * Math.abs(Math.sin(yaw))
    const room = truck - TRUCK_BACK - 0.8 - (lex + reach)
    const vSafe = truckV + Math.sqrt(Math.max(0, 2 * 7 * room))
    let brake = false
    if (t > BRAKE_AT) {
      // Boxed in behind the truck with the Benz alongside: stand on the brakes and slide to a stop
      vWant = 0
      brake = true
    }
    if (vWant > vSafe) {
      vWant = vSafe
      brake = true
    }
    const acc = Math.max(-9, Math.min(4, (vWant - lexV) * 3))
    lexV = Math.max(0, lexV + acc * dt)
    lex += lexV * dt
    // Hard braking at speed breaks the back loose: the car slides round, up to a half spin, and drifts into
    // the empty middle lane (the Benz is long gone by then), away from the median
    // Only once it's slowing hard: a small slide at speed, the full spin as it scrubs off the last of it
    if (t > BRAKE_AT && lexV > 1) {
      const limit = lexV > 14 ? 0.5 : 2.3
      yawV += (1.6 - yawV) * dt * 2
      yaw = Math.min(limit, yaw + yawV * dt)
    }
    // …and it drifts into the empty middle lane, only once the Benz is well clear ahead
    if (t > BRAKE_AT && lead - lex > 14) targetOff = INSIDE + Math.min(1.6, (lead - lex - 14) * 0.08)
    off += (targetOff - off) * Math.min(1, dt * 4)
    out.push({ lead, leadOff: MID, lex, lexOff: off, lexV, lexYaw: yaw, lexBrake: brake, truck })
  }
  return out
}

/** Other traffic, all on the opposite carriageway, so nothing can cross the race. [start, lane offset, speed, model, colour] */
const ONCOMING: [number, number, number, string, string][] = [
  [140, -MID, 22, 'corolla', '#c9ccd1'],
  [260, -INSIDE, 26, 'camry', '#1f2a44'],
  [420, -OUTSIDE, 18, 'scout', '#5a6b3a'],
  [560, -MID, 24, 'suv', '#7a1c22'],
  [700, -INSIDE, 20, 'corolla', '#f2f2ef'],
]

export function FilmRig({ road, s0, dir, shot, speed = 30 }: Props) {
  const lead = useRef<Group>(null)
  const chaser = useRef<Group>(null)
  const truck = useRef<Group>(null)
  const others = useRef<(Group | null)[]>([])
  const leadRig = useRef<CarRig>({ steer: 0, spin: 0, braking: false, reversing: false, hazard: true })
  const chaseRig = useRef<CarRig>({ steer: 0, spin: 0, braking: false, reversing: false, hazard: true })
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const start = useRef<number | null>(null)
  const kind = roadById(road).kind
  const sim = useMemo(() => simulate(speed), [speed])
  // The G1 ROAD gantry (expressway s = 7058 toward Auchi): a cameraman at the kerb 30 m before it, so the cars fly
  // past him and on under the green sign
  const gantryPost = useMemo(() => spotAt(road, 7058 - dir * 30, dir * (HALF[kind] + 3.2)), [road, dir, kind])

  useFrame(({ clock }) => {
    if (start.current === null) start.current = clock.elapsedTime
    const t = Math.max(0, typeof window !== 'undefined' && typeof window.__filmT === 'number' ? window.__filmT : clock.elapsedTime - start.current)
    const f = sim[Math.min(sim.length - 1, Math.round(t * 240))]!
    const at = (p: number, off: number) => spotAt(road, s0 + dir * p, dir * off)
    const a = at(f.lead, f.leadOff)
    const b = at(f.lex, f.lexOff)
    const k = at(f.truck, INSIDE)
    const heading = (p: { dx: number; dz: number }) => Math.atan2(p.dx * dir, p.dz * dir)
    const place = (g: Group | null, p: { x: number; z: number; dx: number; dz: number }, yaw = 0, roll = 0) => {
      if (!g) return
      g.position.set(p.x, 0.05, p.z)
      g.rotation.set(0, heading(p) + yaw, roll)
    }
    place(lead.current, a)
    place(chaser.current, b, f.lexYaw, f.lexBrake && f.lexV > 3 ? -0.03 : 0)
    place(truck.current, k)
    ONCOMING.forEach(([p0, off, v, ,], i) => {
      const g = others.current[i]
      if (!g) return
      const p = at(p0 - v * t, off)
      g.position.set(p.x, 0.05, p.z)
      g.rotation.set(0, heading(p) + Math.PI, 0)
    })
    // Wheels: turn at ~1.15 a second on film (a 30 fps camera freezes or reverses real-speed wheels); the
    // Lexus's slow as it brakes and stop when it stops
    leadRig.current.spin = t * Math.PI * 2 * 1.15
    chaseRig.current.spin += (f.lexV / speed) * Math.PI * 2 * 1.15 * (1 / 30)
    chaseRig.current.braking = f.lexBrake
    chaseRig.current.steer = f.lexBrake ? -0.35 : 0
    leadRig.current.braking = false

    // The town streams around the action
    const focus = t > 11 ? b : a
    driveTelemetry.x = focus.x
    driveTelemetry.z = focus.z
    driveTelemetry.h = heading(a)
    driveTelemetry.speed = speed

    // Camera
    const shotNow = (typeof window !== 'undefined' && window.__filmShot) || shot
    const fx = a.dx * dir
    const fz = a.dz * dir
    const lx = fz // towards the median (left of travel)
    const lz = -fx
    const shake = Math.sin(t * 37) * 0.012 + Math.sin(t * 23) * 0.01
    camera.fov = 50
    camera.up.set(0, 1, 0)
    if (shotNow === 'chase') {
      camera.position.set(b.x - fx * 5.6, 2.9 + shake, b.z - fz * 5.6)
      camera.lookAt(a.x + fx * 6, 1.0, a.z + fz * 6)
    } else if (shotNow === 'between') {
      const mx = (a.x + b.x) / 2
      const mz = (a.z + b.z) / 2
      camera.position.set(mx - fx * 2.6, 0.42 + shake, mz - fz * 2.6)
      camera.lookAt(mx + fx * 10, 0.5, mz + fz * 10)
      camera.fov = 62
    } else if (shotNow === 'gantry') {
      camera.position.set(gantryPost.x, 1.6, gantryPost.z)
      camera.lookAt((a.x + b.x) / 2, 0.9, (a.z + b.z) / 2)
      camera.fov = 40
    } else if (shotNow === 'behind') {
      const mx = (a.x + b.x) / 2
      const mz = (a.z + b.z) / 2
      camera.position.set(mx - fx * 11, 2.4 + shake, mz - fz * 11)
      camera.lookAt(mx + fx * 30, 1.2, mz + fz * 30)
      camera.fov = 48
    } else if (shotNow === 'top') {
      const mx = (b.x + k.x) / 2 - fx * 2
      const mz = (b.z + k.z) / 2 - fz * 2
      // Road running straight up the screen, the way the cars are going
      camera.position.set(mx, 30, mz)
      camera.up.set(fx, 0, fz)
      camera.lookAt(mx, 0, mz)
      camera.fov = 45
    } else if (shotNow === 'truckwheel') {
      // Low by the truck's back wheels on its median side, looking back at the Lexus sliding up
      const bx = k.x - fx * (TRUCK_BACK - 2.2) + lx * 1.9
      const bz = k.z - fz * (TRUCK_BACK - 2.2) + lz * 1.9
      camera.position.set(bx, 0.55 + shake * 0.3, bz)
      camera.lookAt(b.x, 0.7, b.z)
      camera.fov = 52
    } else if (shotNow === 'spin') {
      const post = at(f.lex + 16, OUTSIDE + 3.5)
      camera.position.set(post.x, 1.5, post.z)
      camera.lookAt(b.x, 0.8, b.z)
      camera.fov = 40
    } else if (shotNow === 'wheel' || shotNow === 'wheel-benz') {
      const c = shotNow === 'wheel' ? b : a
      const out = shotNow === 'wheel' ? 1 : -1
      camera.position.set(c.x + lx * out * 2.2 - fx * 2.4, 0.45 + shake * 0.5, c.z + lz * out * 2.2 - fz * 2.4)
      camera.lookAt(c.x + lx * out * 0.85 + fx * 1.3, 0.38, c.z + lz * out * 0.85 + fz * 1.3)
    } else {
      // front: ahead of the Benz, low, it rushes at the camera
      camera.position.set(a.x + fx * 16 + lx * 1.4, 0.6 + shake, a.z + fz * 16 + lz * 1.4)
      camera.lookAt(a.x - fx * 2, 0.7, a.z - fz * 2)
      camera.fov = 46
    }
    camera.updateProjectionMatrix()
  })

  return (
    <>
      <group ref={lead}>
        <Suspense fallback={null}>
          <CarModel id={LEAD.model} color={LEAD.color} rig={leadRig} plate="PRODIGY" />
        </Suspense>
      </group>
      <group ref={truck}>
        <Suspense fallback={null}>
          <TruckModel />
        </Suspense>
      </group>
      <group ref={chaser}>
        <Suspense fallback={null}>
          <CarModel id={CHASER.model} color={CHASER.color} rig={chaseRig} plate="SAMUEL" />
        </Suspense>
      </group>
      {ONCOMING.map(([, , , model, color], i) => (
        <group key={i} ref={(g) => void (others.current[i] = g)}>
          <Suspense fallback={null}>
            <CarModel id={model} color={color} />
          </Suspense>
        </group>
      ))}
    </>
  )
}

/** For tests: the scripted race, and the closest any two vehicles come (m, edge to edge along/across). */
export const filmScript = { simulate, LEX_HALF, BENZ_HALF, TRUCK_BACK, TRUCK_FRONT, MID, INSIDE }
