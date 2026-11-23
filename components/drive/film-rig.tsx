'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useMemo, useRef } from 'react'
import type { Group, PerspectiveCamera } from 'three'
import { CarModel, type CarRig } from '@/components/cars/car-model'
import { driveTelemetry } from '@/lib/game/drive'
import { HALF, LANE, MID_LANE, roadById, spotAt } from '@/lib/game/drive-road'

/*
 * Film mode (dev only): two scripted cars racing down a real road with their hazards on, and a
 * scripted camera, for the trailer. No physics and no HUD. Time comes from `window.__filmT` when a
 * recorder sets it (frame-exact captures), otherwise from the clock.
 *
 * Shots (`shot`):
 *   chase   - low over the Lexus's bonnet, looking at the Benz ahead
 *   between - very low between the two cars, door to door
 *   wheel   - beside the Lexus's rear wheel, the wheel turning
 *   whip    - a roadside cameraman: stands still, swings round to follow the cars as they fly past
 *   top     - drone straight down over both cars
 *   front   - ahead of the cars, low, as they rush at the camera
 */

export type FilmShot = 'chase' | 'between' | 'wheel' | 'wheel-benz' | 'whip' | 'top' | 'front'

declare global {
  interface Window {
    __filmT?: number
  }
}

type Props = {
  road: string
  /** Where the lead car is at t = 0 (m along the road) and which way it goes (+1 / -1). */
  s0: number
  dir: number
  shot: FilmShot
  /** Lead car speed, m/s. */
  speed?: number
}

const LEAD = { model: 'gla', color: '#f2f2ef' }
const CHASER = { model: 'rx350', color: '#b9bec5' }

export function FilmRig({ road, s0, dir, shot, speed = 30 }: Props) {
  const lead = useRef<Group>(null)
  const chaser = useRef<Group>(null)
  const leadRig = useRef<CarRig>({ steer: 0, spin: 0, braking: false, reversing: false, hazard: true })
  const chaseRig = useRef<CarRig>({ steer: 0, spin: 0, braking: false, reversing: false, hazard: true })
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const start = useRef<number | null>(null)
  // The roadside cameraman's spot: 70 m down the road from the start, on the kerb of the cars' side
  const kind = roadById(road).kind
  // Lanes of this road: the Benz in the outside lane, the Lexus in the inside lane next to it
  const leadOff = kind === 'highway' ? MID_LANE.highway : LANE[kind]
  const chaseOff = kind === 'highway' ? 3.9 : MID_LANE[kind]
  const post = useMemo(() => spotAt(road, s0 + dir * 70, dir * (HALF[kind] + 3.5)), [road, s0, dir, kind])

  useFrame(({ clock }) => {
    if (start.current === null) start.current = clock.elapsedTime
    const t = typeof window !== 'undefined' && typeof window.__filmT === 'number' ? window.__filmT : clock.elapsedTime - start.current

    // Lead (Benz) in the middle lane; the Lexus starts a length behind in the inside lane, closes in and leans on it
    const sLead = s0 + dir * speed * t
    const gain = Math.min(1, t / 2.2)
    const sChase = sLead - dir * (7 - 6.2 * gain)
    const push = Math.max(0, Math.sin(t * 2.1)) * 0.7 * gain
    const a = spotAt(road, sLead, dir * leadOff)
    // Starts right behind the Benz in its lane, then pulls out beside it (video 2's opening move)
    const side = leadOff + (chaseOff - leadOff) * Math.min(1, Math.max(0, (t - 0.8) / 1.4))
    const b = spotAt(road, sChase, dir * (side + push * (side === chaseOff ? 1 : 0)))
    const place = (g: Group | null, p: { x: number; z: number; dx: number; dz: number }, roll: number) => {
      if (!g) return
      g.position.set(p.x, 0.05, p.z)
      g.rotation.set(0, Math.atan2(p.dx * dir, p.dz * dir), roll)
    }
    place(lead.current, a, 0)
    place(chaser.current, b, -push * 0.03)
    // Wheels: at race speed a real wheel turns ~13 times a second, which a 30 fps camera shows frozen or going
    // backwards (the wagon-wheel effect: the Benz rim has 10 spokes 36° apart). On film they turn ~1.15 times a
    // second, about 14° a frame, a third of a spoke gap, so the eye reads them clearly as rolling forward.
    const spin = t * Math.PI * 2 * 1.15
    leadRig.current.spin = spin
    chaseRig.current.spin = spin * 1.03
    chaseRig.current.steer = push * 0.08

    // The town and traffic stream around the lead car
    driveTelemetry.x = a.x
    driveTelemetry.z = a.z
    driveTelemetry.h = Math.atan2(a.dx * dir, a.dz * dir)
    driveTelemetry.speed = speed

    // Camera
    const fx = a.dx * dir
    const fz = a.dz * dir
    // Left of travel (Nigeria drives on the right; the Lexus is on the inside, i.e. towards the median = +left)
    const lx = fz
    const lz = -fx
    const shake = Math.sin(t * 37) * 0.012 + Math.sin(t * 23) * 0.01
    camera.fov = 50
    if (shot === 'chase') {
      // Just behind and above the Lexus's tail (like video 2's shot over the car's rear), the Benz ahead
      camera.position.set(b.x - fx * 5.6, 2.9 + shake, b.z - fz * 5.6)
      camera.lookAt(a.x + fx * 6, 1.0, a.z + fz * 6)
    } else if (shot === 'between') {
      const mx = (a.x + b.x) / 2
      const mz = (a.z + b.z) / 2
      camera.position.set(mx - fx * 2.6, 0.42 + shake, mz - fz * 2.6)
      camera.lookAt(mx + fx * 10, 0.5, mz + fz * 10)
      camera.fov = 62
    } else if (shot === 'wheel' || shot === 'wheel-benz') {
      // Low beside a front wheel, on the car's open side, a little behind it: the rim turning, the road rushing past
      const c = shot === 'wheel' ? b : a
      const out = shot === 'wheel' ? 1 : -1
      const wx = c.x + lx * out * 2.7 - fx * 2.4
      const wz = c.z + lz * out * 2.7 - fz * 2.4
      camera.position.set(wx, 0.45 + shake * 0.5, wz)
      camera.lookAt(c.x + lx * out * 0.85 + fx * 1.3, 0.38, c.z + lz * out * 0.85 + fz * 1.3)
      camera.fov = 50
    } else if (shot === 'whip') {
      camera.position.set(post.x, 1.55, post.z)
      camera.lookAt(a.x, 0.8, a.z)
      camera.fov = 38
    } else if (shot === 'top') {
      const mx = (a.x + b.x) / 2
      const mz = (a.z + b.z) / 2
      camera.position.set(mx + 0.01, 24, mz)
      camera.lookAt(mx, 0, mz)
      camera.fov = 45
    } else {
      // front
      camera.position.set(a.x + fx * 14 + lx * 1.2, 0.6 + shake, a.z + fz * 14 + lz * 1.2)
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
      <group ref={chaser}>
        <Suspense fallback={null}>
          <CarModel id={CHASER.model} color={CHASER.color} rig={chaseRig} plate="SAMUEL" />
        </Suspense>
      </group>
    </>
  )
}
