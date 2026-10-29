'use client'

import { useGLTF } from '@react-three/drei'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Matrix4, Object3D, type InstancedMesh, type Material } from 'three'
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

export function WorldHighway() {
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
    </group>
  )
}
