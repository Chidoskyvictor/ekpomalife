'use client'

import { useGLTF } from '@react-three/drei'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Box3, Matrix4, Object3D, Vector3, type InstancedMesh, type Material } from 'three'
import {
  HOSTEL_GLB,
  type HostelSlot,
  extSlabHostelSlots,
  rearHostelSlabSlots,
} from '@/lib/game/hostel-slab-layout'
import { bakeStaticParts, type StaticPart } from './bake-static'
import { applyGlbTextureAnisotropy } from './glb-textures'

const LIFT_Y = 0.06

function meshFootprint(scene: Object3D) {
  const size = new Box3().setFromObject(scene).getSize(new Vector3())
  const ok = (n: number) => Number.isFinite(n) && n > 0.05 && n < 400
  return {
    x: ok(size.x) ? size.x : 10,
    z: ok(size.z) ? size.z : 10,
  }
}

function scaleToCell(mesh: { x: number; z: number }, cellW: number, cellD: number, fill = 0.86) {
  return Math.max(0.03, Math.min((cellW / mesh.x) * fill, (cellD / mesh.z) * fill))
}

/**
 * Bake the hostel GLB (160 small meshes, 30 flat colours) into a couple of vertex-coloured parts,
 * centred on the ground at the origin. Each part is one InstancedMesh for every hostel on the map.
 */
function bakeHostelParts(scene: Object3D): StaticPart[] {
  const root = scene.clone(true)
  root.position.set(0, 0, 0)
  root.rotation.set(0, 0, 0)
  root.scale.set(1, 1, 1)
  const box = new Box3().setFromObject(root)
  const center = box.getCenter(new Vector3())
  const toGround = new Matrix4().makeTranslation(-center.x, -box.min.y, -center.z)
  const parts = bakeStaticParts(root)
  parts.forEach((part) => part.geometry.applyMatrix4(toGround))
  return parts
}

function HostelPartInstances({ part, matrices }: { part: StaticPart; matrices: Matrix4[] }) {
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

function slotMatrices(slots: HostelSlot[], scale: number) {
  const dummy = new Object3D()
  return slots.map((slot) => {
    dummy.position.set(slot.x, LIFT_Y, slot.z)
    dummy.rotation.set(0, slot.rotation, 0)
    dummy.scale.setScalar(scale)
    dummy.updateMatrix()
    return dummy.matrix.clone()
  })
}

/** Off-campus hostel grids, drawn as one instanced batch per material (no shadows). */
export function ExtSlabHostels() {
  const gl = useThree((state) => state.gl)
  const { scene } = useGLTF(HOSTEL_GLB)

  useLayoutEffect(() => {
    applyGlbTextureAnisotropy(scene, gl)
  }, [scene, gl])

  const parts = useMemo(() => bakeHostelParts(scene), [scene])
  useEffect(
    () => () =>
      parts.forEach((part) => {
        part.geometry.dispose()
        if ((part.material as Material).userData.baked) (part.material as Material).dispose()
      }),
    [parts],
  )

  const matrices = useMemo(() => {
    const meshSize = meshFootprint(scene)
    const grid = (slots: HostelSlot[], fill: number) => {
      const first = slots[0]
      return first ? slotMatrices(slots, scaleToCell(meshSize, first.cellW, first.cellD, fill)) : []
    }
    return [...grid(rearHostelSlabSlots(), 0.86), ...grid(extSlabHostelSlots(), 0.86)]
  }, [scene])

  if (matrices.length === 0) return null
  return (
    <group>
      {parts.map((part, i) => (
        <HostelPartInstances key={i} part={part} matrices={matrices} />
      ))}
    </group>
  )
}

useGLTF.preload(HOSTEL_GLB)
