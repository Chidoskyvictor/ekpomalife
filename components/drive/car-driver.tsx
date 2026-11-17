'use client'

import { useFrame } from '@react-three/fiber'
import { Suspense, useMemo, useRef, type MutableRefObject } from 'react'
import { MathUtils, type Group } from 'three'
import { CharacterFigure, type FigurePose } from '@/components/look/character-figure'
import { seatFor } from '@/lib/game/car-seats'
import { driveView } from '@/lib/game/drive'
import { DEFAULT_APPEARANCE, normalizeAppearance } from '@/lib/game/look'

/** Share of the climb spent walking to the door; the rest is sitting down. */
const WALK = 0.55
/** The sit clip drops the hips below the figure's origin: lift it by this share of its scale so it rests on the cushion. */
const SIT_LIFT = 0.4

/**
 * A person at the wheel (or in the passenger seat). `progress` goes 0 (stood by the driver's door)
 * to 1 (seated, hands toward the wheel) and back; the door swings open in between.
 * Draw it inside the car's own group (car frame, sized with the car).
 */
export function CarDriver({
  model,
  appearance,
  color,
  progress,
  seat = 'driver',
  doors = true,
}: {
  model: string
  appearance: unknown
  color: string
  progress: MutableRefObject<number>
  seat?: 'driver' | 'passenger'
  /** Swing the door while climbing in/out (off on weak phones). */
  doors?: boolean
}) {
  const spec = seatFor(model)
  const look = useMemo(() => normalizeAppearance((appearance as never) ?? DEFAULT_APPEARANCE), [appearance])
  const root = useRef<Group>(null)
  const door = useRef<Group>(null)
  const walking = useRef(false)
  const pose = useRef<FigurePose | null>('type')
  const [sx, sy, sz] = seat === 'driver' ? spec.driver : spec.passenger
  const out = seat === 'driver' ? 1 : -1
  const doorX = out * (spec.half + 0.25)

  useFrame(() => {
    const g = root.current
    if (!g) return
    const t = progress.current
    const w = Math.min(1, t / WALK)
    const sit = t <= WALK ? 0 : (t - WALK) / (1 - WALK)
    // Stand 1.4 m out from the car, step to the door, then slide in and settle on the seat
    const x = t <= WALK ? MathUtils.lerp(out * (spec.half + 1.3), doorX, w) : MathUtils.lerp(doorX, sx, MathUtils.smoothstep(sit, 0, 1))
    g.position.set(x, MathUtils.lerp(0, sy + SIT_LIFT * spec.scale, MathUtils.smoothstep(sit, 0.3, 1)), sz)
    g.rotation.y = MathUtils.lerp(-out * Math.PI / 2, 0, MathUtils.smoothstep(sit, 0, 0.7))
    // Not drawn when the camera is your own eyes
    g.visible = t > 0.001 && !(seat === 'driver' && driveView.mode === 1 && t >= 1)
    walking.current = t > 0.001 && t < WALK && t < 0.999
    pose.current = t > WALK ? 'type' : null
    const d = door.current
    if (d) {
      // Open while stepping in, shut again once seated
      const open = t <= 0.001 || t >= 0.999 ? 0 : MathUtils.smoothstep(t, 0, 0.3) * (1 - MathUtils.smoothstep(t, 0.75, 1))
      d.visible = doors && open > 0.01
      d.rotation.y = -out * open * 1.1
    }
  })

  const door3 = spec.door
  return (
    <>
      <group ref={root} scale={spec.scale} visible={false}>
        <Suspense fallback={null}>
          <CharacterFigure appearance={look} moving={walking} pose={pose} />
        </Suspense>
      </group>
      {door3 && seat === 'driver' ? (
        // Hinged at its front edge
        <group ref={door} position={[out * (spec.half + 0.01), 0, door3[0]]} visible={false}>
          <mesh position={[0, (door3[2] + door3[3]) / 2, -door3[1] / 2]}>
            <boxGeometry args={[0.04, door3[3] - door3[2], door3[1]]} />
            <meshStandardMaterial color={color} roughness={0.5} metalness={0.2} />
          </mesh>
        </group>
      ) : null}
    </>
  )
}

