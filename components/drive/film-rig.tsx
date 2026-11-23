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
  | 'bumpers' // very low just behind both back bumpers, side by side (the reference's close shot)
  | 'gantry' // a roadside cameraman under the G1 ROAD gantry, swinging round as they fly past
  | 'behind' // behind both cars, the truck ahead in the Lexus's lane
  | 'top' // drone straight down over the Lexus and the truck
  | 'overlexus' // over the Lexus's rear, the Benz pulling out, the truck coming head-on
  | 'squeeze' // slow-motion close-up, the Lexus sliding sideways right up to the truck's nose
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

// In front at the start and trapped by the truck: the Lexus. Right behind it and the winner: the Benz.
const LEAD = { model: 'rx350', color: '#b9bec5', plate: 'SAMUEL' }
const CHASER = { model: 'gla', color: '#f2f2ef', plate: 'PRODIGY' }
const TRUCK_BACK = 10.9 // trailer's back end behind the truck's origin (m)
const TRUCK_FRONT = 3.04
const LEX_HALF = 2.45
const BENZ_HALF = 2.2

// Lanes on the expressway (offset from the centre line, on the cars' own side)
const MID = MID_LANE.highway // 7.25: middle lane
const INSIDE = 3.9 // inside lane, by the median
const OUTSIDE = LANE.highway // 10.75

/** The truck's angle once it has swung across (rad; its back end swings toward the median). */
const TRUCK_SWING = 0.22

type Frame = {
  /** The Lexus (in front at the start, the one that gets trapped) */
  lead: number; leadOff: number; leadV: number; leadYaw: number; leadBrake: boolean
  /** The Benz (behind at the start, the one that gets through and wins) */
  lex: number; lexOff: number; lexV: number; lexYaw: number; lexBrake: boolean
  /** The truck's cab: along the road, across it, and how far it has swung */
  truck: number; truckOff: number; truckYaw: number
}

/**
 * The race worked out ahead of time at 240 steps a second, after the owner's reference edit: the Lexus
 * leads with the Benz right behind; the Benz pulls into the outside lane and draws level; the Ekpoma
 * Life truck comes head-on down the middle lane and swings across the middle and inside lanes; the Benz
 * squeezes past in the free outside lane, the Lexus is trapped, brakes, slides sideways and stops just
 * short of the truck. Nothing ever touches (the clearance check proves it).
 */
function simulate(speed: number): Frame[] {
  const dt = 1 / 240
  const out: Frame[] = []
  const TRUCK_V = 13
  const SWING_AT = 9.2
  // Cab meets the race around t = 10.6
  let truck = speed * 10.6 + TRUCK_V * 10.6
  let truckV = TRUCK_V
  let truckYaw = 0
  let lexus = 0
  let lexusV = speed
  let lexusYaw = 0
  let lexusYawV = 0
  let lexusOff = MID
  let benz = -9
  let benzV = speed
  let benzOff = MID
  for (let i = 0; i <= 240 * 30; i++) {
    const t = i * dt
    // Truck: wrong way down the middle lane, then brakes and swings its back end across toward the median
    if (t > SWING_AT) {
      truckV = Math.max(0, truckV - 9 * dt)
      truckYaw = Math.min(TRUCK_SWING, truckYaw + dt * 0.35)
    }
    truck -= truckV * dt
    // Benz: right behind the Lexus, moves out while still a car length back, then draws level and goes on past
    const gap = t < 1 ? 9 : t < 2.2 ? 9 - ((t - 1) / 1.2) * 2.2 : t < 3.8 ? 6.8 : Math.max(-1, 6.8 - (t - 3.8) * 3.2)
    const laneT = Math.min(1, Math.max(0, (t - 2.3) / 1.3))
    const ease = laneT * laneT * (3 - 2 * laneT)
    let benzTarget = MID + (OUTSIDE - MID) * ease
    // The reference's bumper-to-bumper moment: the Benz leans right up to the Lexus (0.38 m apart at the closest)
    // around t = 6, then backs off to its lane before the truck arrives
    if (t > 4.9 && t < 7.3) {
      const k = (t - 4.9) / 2.4
      benzTarget -= Math.sin(Math.PI * k) ** 2 * (OUTSIDE - MID - 2.3)
    }
    const benzWant = t < 9 ? lexus - gap : benz + speed
    benzV = Math.max(0, benzV + Math.max(-9, Math.min(4, (speed + (benzWant - benz) * 1.6 - benzV) * 3)) * dt)
    if (t >= 9) benzV += (speed - benzV) * dt * 2
    benz += benzV * dt
    benzOff += (benzTarget - benzOff) * Math.min(1, dt * 4)
    // Lexus: in the middle lane, straight at the truck. Brakes when it sees it, slides, stops just short of the cab
    const reach = LEX_HALF * Math.abs(Math.cos(lexusYaw)) + 0.97 * Math.abs(Math.sin(lexusYaw))
    const room = truck - TRUCK_FRONT - 0.9 - (lexus + reach)
    const braking = t > 9.3
    let vWant = braking ? 0 : speed
    const vSafe = Math.sqrt(Math.max(0, 2 * 8 * room)) - truckV * 0.2
    if (vWant > vSafe) vWant = Math.max(0, vSafe)
    lexusV = Math.max(0, lexusV + Math.max(-9.5, Math.min(4, (vWant - lexusV) * 3)) * dt)
    lexus += lexusV * dt
    if (braking && lexusV > 0.5) {
      lexusYawV += (1.4 - lexusYawV) * dt * 2
      lexusYaw = Math.min(1.25, lexusYaw + lexusYawV * dt)
    }
    out.push({
      lead: lexus, leadOff: lexusOff, leadV: lexusV, leadYaw: lexusYaw, leadBrake: braking,
      lex: benz, lexOff: benzOff, lexV: benzV, lexYaw: 0, lexBrake: false,
      truck, truckOff: MID, truckYaw,
    })
  }
  return out
}

/** Other traffic, all on the opposite carriageway, so nothing can cross the race. [start, lane offset, speed, model, colour] */
const ONCOMING: [number, number, number, string, string][] = [
  [90, -OUTSIDE, 17, 'scout', '#5a6b3a'],
  [140, -MID, 22, 'corolla', '#c9ccd1'],
  [210, -INSIDE, 26, 'camry', '#1f2a44'],
  [290, -OUTSIDE, 18, 'corolla', '#7a1c22'],
  [330, -MID, 21, 'suv', '#f2f2ef'],
  [420, -INSIDE, 25, 'camry', '#c8b560'],
  [480, -OUTSIDE, 16, 'scout', '#3d4a66'],
  [560, -MID, 24, 'suv', '#7a1c22'],
  [620, -INSIDE, 27, 'corolla', '#111317'],
  [700, -MID, 20, 'corolla', '#f2f2ef'],
  [760, -OUTSIDE, 18, 'camry', '#8a8f96'],
  [860, -INSIDE, 24, 'suv', '#5a6b3a'],
]

/** Cars parked along the kerb on the race's side, by the shops, never in a lane. [along, model, colour] */
const PARKED: [number, string, string][] = [
  [-20, 'corolla', '#c9ccd1'], [24, 'camry', '#1f2a44'], [70, 'scout', '#5a6b3a'], [118, 'corolla', '#7a1c22'],
  [165, 'suv', '#f2f2ef'], [214, 'camry', '#8a8f96'], [262, 'corolla', '#c8b560'], [300, 'scout', '#3d4a66'],
  [350, 'camry', '#111317'], [395, 'corolla', '#f2f2ef'], [440, 'suv', '#7a1c22'], [490, 'corolla', '#1f2a44'],
  [540, 'camry', '#c9ccd1'],
]
/** Parking line: just outside the outside lane's edge line, on the shoulder by the kerb. */
const PARK_OFF = 13.6

export function FilmRig({ road, s0, dir, shot, speed = 30 }: Props) {
  const lead = useRef<Group>(null)
  const chaser = useRef<Group>(null)
  const truck = useRef<Group>(null)
  const others = useRef<(Group | null)[]>([])
  const parked = useRef<(Group | null)[]>([])
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
    const a = at(f.lead, f.leadOff) // the Lexus
    const b = at(f.lex, f.lexOff) // the Benz
    const heading = (p: { dx: number; dz: number }) => Math.atan2(p.dx * dir, p.dz * dir)
    const place = (g: Group | null, p: { x: number; z: number; dx: number; dz: number }, yaw = 0, roll = 0) => {
      if (!g) return
      g.position.set(p.x, 0.05, p.z)
      g.rotation.set(0, heading(p) + yaw, roll)
    }
    place(lead.current, a, f.leadYaw, f.leadBrake && f.leadV > 3 ? -0.03 : 0)
    place(chaser.current, b)
    // The truck faces the race; as it swings, its back end goes toward the median (road space: along, across)
    const k = at(f.truck, f.truckOff)
    const nose = at(f.truck - Math.cos(f.truckYaw) * 5, f.truckOff + Math.sin(f.truckYaw) * 5)
    if (truck.current) {
      truck.current.position.set(k.x, 0.05, k.z)
      truck.current.rotation.set(0, Math.atan2(nose.x - k.x, nose.z - k.z), 0)
    }
    ONCOMING.forEach(([p0, off, v, ,], i) => {
      const g = others.current[i]
      if (!g) return
      const p = at(p0 - v * t, off)
      g.position.set(p.x, 0.05, p.z)
      g.rotation.set(0, heading(p) + Math.PI, 0)
    })
    PARKED.forEach(([p0], i) => {
      const g = parked.current[i]
      if (!g) return
      const p = at(p0, PARK_OFF)
      g.position.set(p.x, 0.05, p.z)
      g.rotation.set(0, heading(p), 0)
    })
    // Wheels on film turn ~1.15 a second at race speed (a 30 fps camera freezes or reverses real-speed wheels)
    const turn = Math.PI * 2 * 1.15 * (1 / 30)
    leadRig.current.spin += (f.leadV / speed) * turn
    chaseRig.current.spin += (f.lexV / speed) * turn
    leadRig.current.braking = f.leadBrake
    leadRig.current.steer = f.leadBrake ? -0.35 : 0

    // The town streams around the action
    const focus = t > 13 ? b : a
    driveTelemetry.x = focus.x
    driveTelemetry.z = focus.z
    driveTelemetry.h = heading(a)
    driveTelemetry.speed = speed

    // Camera (placed in road space: along the road, across it)
    const shotNow = (typeof window !== 'undefined' && window.__filmShot) || shot
    const shake = Math.sin(t * 37) * 0.012 + Math.sin(t * 23) * 0.01
    const cam = (p: number, off: number, y: number) => {
      const c = at(p, off)
      camera.position.set(c.x, y, c.z)
    }
    const look = (p: number, off: number, y: number) => {
      const c = at(p, off)
      camera.lookAt(c.x, y, c.z)
    }
    const midP = (f.lead + f.lex) / 2
    const midO = (f.leadOff + f.lexOff) / 2
    camera.fov = 50
    camera.up.set(0, 1, 0)
    if (shotNow === 'chase') {
      // Behind and above the Benz, the Lexus just ahead (the reference's shot over the chasing car's rear)
      cam(f.lex - 5.6, f.lexOff, 2.9 + shake)
      look(f.lead + 6, f.leadOff, 1.0)
    } else if (shotNow === 'between') {
      cam(midP - 2.6, midO, 0.42 + shake)
      look(midP + 10, midO, 0.5)
      camera.fov = 62
    } else if (shotNow === 'bumpers') {
      // The reference's close shot: very low right behind the two back bumpers, side by side, almost touching
      const backP = Math.min(f.lead, f.lex) - 3.6
      cam(backP, midO, 0.32 + shake * 0.6)
      look(backP + 9, midO, 0.55)
      camera.fov = 78
    } else if (shotNow === 'gantry') {
      camera.position.set(gantryPost.x, 1.6, gantryPost.z)
      const c = at(midP, midO)
      camera.lookAt(c.x, 0.9, c.z)
      camera.fov = 40
    } else if (shotNow === 'behind') {
      cam(midP - 11, midO, 2.4 + shake)
      look(midP + 30, midO, 1.2)
      camera.fov = 48
    } else if (shotNow === 'top') {
      const cp = (f.lead + f.lex + f.truck + 5) / 3
      const co = (f.leadOff + f.lexOff + f.truckOff) / 3
      const c = at(cp, co)
      const up = at(cp + 1, co)
      camera.position.set(c.x, 32, c.z)
      camera.up.set(up.x - c.x, 0, up.z - c.z)
      camera.lookAt(c.x, 0, c.z)
      camera.fov = 45
    } else if (shotNow === 'overlexus') {
      // Over the Lexus's rear: the Benz pulls out beside it and the truck comes at them head-on
      cam(f.lead - 5.4, f.leadOff, 2.7 + shake)
      look(f.lead + 28, (f.leadOff + f.lexOff) / 2, 1.3)
      camera.fov = 52
    } else if (shotNow === 'squeeze') {
      // Slow-motion close-up: low between the truck's nose and the Lexus as it slides sideways right up to it
      cam(f.truck - TRUCK_FRONT - 0.6, f.truckOff + 2.3, 0.45 + shake * 0.3)
      look(f.lead, f.leadOff, 0.6)
      camera.fov = 58
    } else if (shotNow === 'truckwheel') {
      // Low by the truck's front wheel on the free (outside) side, looking at the Lexus sliding up to the cab
      cam(f.truck + 1.2, f.truckOff + 2.1, 0.5 + shake * 0.3)
      look(f.lead, f.leadOff, 0.7)
      camera.fov = 52
    } else if (shotNow === 'spin') {
      // ahead of the Lexus and off to the side, so the slide shows its side and front swinging round
      cam(f.lead + 9, OUTSIDE + 2.5, 1.4)
      look(f.lead, f.leadOff, 0.8)
      camera.fov = 40
    } else if (shotNow === 'wheel' || shotNow === 'wheel-benz') {
      // Low beside the Benz's front wheel on its kerb side, the rim turning, the road rushing past
      cam(f.lex - 2.4, f.lexOff + 2.2, 0.45 + shake * 0.5)
      look(f.lex + 1.3, f.lexOff + 0.85, 0.38)
    } else {
      // front: ahead of the Benz, low, as it rushes at the camera, the winner
      cam(f.lex + 10, f.lexOff - 1.4, 0.6 + shake)
      look(f.lex - 2, f.lexOff, 0.7)
      camera.fov = 46
    }
    camera.updateProjectionMatrix()
    if (typeof window !== 'undefined') (window as unknown as { __filmDebug?: unknown }).__filmDebug = { t, shot: shotNow, lexus: [f.lead, f.leadOff, f.leadYaw], benz: [f.lex, f.lexOff], truck: [f.truck, f.truckOff, f.truckYaw], cam: camera.position.toArray(), a: [a.x, a.z], b: [b.x, b.z], k: [k.x, k.z] }
  })

  return (
    <>
      <group ref={lead}>
        <Suspense fallback={null}>
          <CarModel id={LEAD.model} color={LEAD.color} rig={leadRig} plate={LEAD.plate} />
        </Suspense>
      </group>
      <group ref={truck}>
        <Suspense fallback={null}>
          <TruckModel />
        </Suspense>
      </group>
      <group ref={chaser}>
        <Suspense fallback={null}>
          <CarModel id={CHASER.model} color={CHASER.color} rig={chaseRig} plate={CHASER.plate} />
        </Suspense>
      </group>
      {PARKED.map(([, model, color], i) => (
        <group key={`p${i}`} ref={(g) => void (parked.current[i] = g)}>
          <Suspense fallback={null}>
            <CarModel id={model} color={color} />
          </Suspense>
        </group>
      ))}
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
export const filmScript = { simulate, LEX_HALF, BENZ_HALF, TRUCK_BACK, TRUCK_FRONT, MID, INSIDE, OUTSIDE, TRUCK_SWING }
