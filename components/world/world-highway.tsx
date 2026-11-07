'use client'

import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Color, Matrix4, Object3D, type InstancedMesh, type Material } from 'three'
import { FIRST_SLAB, FRONT_SLAB, FRONT_SLAB_EXT } from '@/lib/game/world-layout'
import { bakeStaticParts, type StaticPart } from './bake-static'

/**
 * `highway.glb`: a 60-long, 25.2-wide dual carriageway running along Z (centred on the origin).
 * It lies in the water between the north slab and the south slabs, so we turn it to run along X,
 * scale its width to the gap, and repeat it end to end across the full width of the map.
 * The 10 meshes are baked into a few vertex-coloured parts and every piece is an instance of
 * them, so the whole highway costs a handful of draw calls (no shadows).
 */
const HIGHWAY_URL = '/models/highway.glb?v=mo2'
const NATIVE_LENGTH = 60
const NATIVE_WIDTH = 25.2
/** Tuck the road edges this far under each slab so no blue shows at the sides. */
const TUCK = 0.2
/** The slab top is y = 0; the model's surface is 0.25 thick, scaled down. */
const LIFT_Y = -0.1

useGLTF.preload(HIGHWAY_URL)

const CAR_URL = '/models/npc-car.glb?v=1'
/** Lane centres across the native road (+ = one side). Each carriageway has two lanes. */
const LANES = [4.9, 8.7, -4.9, -8.7]
/** Car speed along the map (world units / s), before the per-car jitter. */
const CAR_SPEED = 9
/** Paint colours for the cars (tints the same model so the traffic isn't all one colour). */
const CAR_COLORS = ['#ffffff', '#d62828', '#1d4ed8', '#111827', '#f2c94c', '#9ca3af', '#15803d', '#ea580c', '#7c3aed', '#e5e7eb']

function HighwayPart({ part, matrices }: { part: StaticPart; matrices: Matrix4[] }) {
  const ref = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix))
    mesh.instanceMatrix.needsUpdate = true
  }, [matrices])

  return (
    <instancedMesh
      ref={ref}
      args={[part.geometry, part.material, matrices.length]}
      castShadow={false}
      receiveShadow={false}
      frustumCulled={false}
    />
  )
}

/** The highway's span and lane positions in world space (shared by the road pieces and the traffic). */
function roadFrame() {
  const northEdge = FIRST_SLAB.z + FIRST_SLAB.d / 2
  const southEdge = Math.min(FRONT_SLAB.z - FRONT_SLAB.d / 2, FRONT_SLAB_EXT.z - FRONT_SLAB_EXT.d / 2)
  const west = FIRST_SLAB.x - FIRST_SLAB.w / 2
  const span = FIRST_SLAB.w
  const widthScale = (southEdge - northEdge + TUCK * 2) / NATIVE_WIDTH
  return { west, span, widthScale, z: (northEdge + southEdge) / 2 }
}

/**
 * A few cars driving both ways along the highway so the map feels alive. One car model, drawn as
 * instances (a couple of draw calls for all of them), moved every frame; fewer cars on slow phones.
 */
function HighwayTraffic({ count }: { count: number }) {
  const { scene } = useGLTF(CAR_URL)
  const parts = useMemo(() => bakeStaticParts(scene.clone(true)), [scene])
  useEffect(
    () => () =>
      parts.forEach((part) => {
        part.geometry.dispose()
        if ((part.material as Material).userData.baked) (part.material as Material).dispose()
      }),
    [parts],
  )
  const frame = useMemo(roadFrame, [])
  const cars = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const lane = LANES[i % LANES.length]!
        return {
          z: frame.z + lane * frame.widthScale,
          dir: lane > 0 ? 1 : -1,
          x: frame.west + ((i * 0.37 + 0.11) % 1) * frame.span,
          speed: CAR_SPEED * (0.8 + ((i * 0.53) % 0.4)),
        }
      }),
    [count, frame],
  )
  const refs = useRef<(InstancedMesh | null)[]>([])
  const dummy = useMemo(() => new Object3D(), [])
  useLayoutEffect(() => {
    const color = new Color()
    for (const mesh of refs.current) {
      if (!mesh) continue
      cars.forEach((_, i) => mesh.setColorAt(i, color.set(CAR_COLORS[i % CAR_COLORS.length]!)))
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }, [cars, parts])
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    cars.forEach((car, i) => {
      car.x += car.dir * car.speed * dt
      if (car.x > frame.west + frame.span) car.x -= frame.span
      if (car.x < frame.west) car.x += frame.span
      dummy.position.set(car.x, LIFT_Y + 0.05, car.z)
      // The model's front is +z: turn it to face its way along X
      dummy.rotation.set(0, car.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0)
      dummy.scale.setScalar(frame.widthScale * 1.6)
      dummy.updateMatrix()
      for (const mesh of refs.current) mesh?.setMatrixAt(i, dummy.matrix)
    })
    for (const mesh of refs.current) if (mesh) mesh.instanceMatrix.needsUpdate = true
  })
  return (
    <group>
      {parts.map((part, i) => (
        <instancedMesh
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          args={[part.geometry, part.material, cars.length]}
          castShadow={false}
          receiveShadow={false}
          frustumCulled={false}
        />
      ))}
    </group>
  )
}

export function WorldHighway({ cars = 10 }: { cars?: number }) {
  const { scene } = useGLTF(HIGHWAY_URL)

  const parts = useMemo(() => bakeStaticParts(scene.clone(true)), [scene])
  useEffect(
    () => () =>
      parts.forEach((part) => {
        part.geometry.dispose()
        if ((part.material as Material).userData.baked) (part.material as Material).dispose()
      }),
    [parts],
  )

  const matrices = useMemo(() => {
    const northEdge = FIRST_SLAB.z + FIRST_SLAB.d / 2
    const southEdge = Math.min(FRONT_SLAB.z - FRONT_SLAB.d / 2, FRONT_SLAB_EXT.z - FRONT_SLAB_EXT.d / 2)
    const west = FIRST_SLAB.x - FIRST_SLAB.w / 2
    const span = FIRST_SLAB.w
    const widthScale = (southEdge - northEdge + TUCK * 2) / NATIVE_WIDTH
    const count = Math.ceil(span / (NATIVE_LENGTH * widthScale))
    // Stretch each piece a touch so whole pieces end exactly at the map edges.
    const lengthScale = span / (count * NATIVE_LENGTH)
    const pieceLength = NATIVE_LENGTH * lengthScale
    const z = (northEdge + southEdge) / 2

    const dummy = new Object3D()
    return Array.from({ length: count }, (_, i) => {
      dummy.position.set(west + pieceLength * (i + 0.5), LIFT_Y, z)
      // Turned 90° so the road runs along X; model Z (its length) becomes world X.
      dummy.rotation.set(0, Math.PI / 2, 0)
      dummy.scale.set(widthScale, widthScale, lengthScale)
      dummy.updateMatrix()
      return dummy.matrix.clone()
    })
  }, [])

  return (
    <group>
      {parts.map((part, i) => (
        <HighwayPart key={i} part={part} matrices={matrices} />
      ))}
      {cars > 0 ? <HighwayTraffic count={cars} /> : null}
    </group>
  )
}
