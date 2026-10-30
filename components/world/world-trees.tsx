'use client'

import { useGLTF } from '@react-three/drei'
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import {
  Box3,
  Euler,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
  type Material,
  type Mesh,
  type Object3D,
} from 'three'
import { TREE_SPOTS, type TreeSpot } from '@/lib/game/world-layout'

const TREE_URL = '/models/tree.glb?v=mo2'
const PINE_URL = '/models/pinetree.glb?v=mo2'

useGLTF.preload(TREE_URL)
useGLTF.preload(PINE_URL)

/** Target world height for `s = 1`. */
const TARGET_H = { tree: 2.8, pine: 4.2 }

function nativeHeight(scene: Object3D) {
  const size = new Box3().setFromObject(scene).getSize(new Vector3())
  return Math.max(size.y, 0.05)
}

type Part = { geometry: BufferGeometry; material: Material | Material[]; local: Matrix4 }

/** Every mesh in the GLB with its transform relative to the scene root (what <Clone> reproduced). */
function collectParts(scene: Object3D): Part[] {
  scene.updateMatrixWorld(true)
  const rootInv = new Matrix4().copy(scene.matrixWorld).invert()
  const parts: Part[] = []
  scene.traverse((node) => {
    const mesh = node as Mesh
    if (!mesh.isMesh || !mesh.visible) return
    parts.push({
      geometry: mesh.geometry,
      material: mesh.material,
      local: new Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld),
    })
  })
  return parts
}

function PartInstances({ part, spots, base, castShadow }: { part: Part; spots: Matrix4[]; base: number; castShadow: boolean }) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const m = new Matrix4()
    spots.forEach((spot, i) => {
      m.multiplyMatrices(spot, part.local)
      mesh.setMatrixAt(i, m)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    mesh.computeBoundingBox()
  }, [part, spots])
  return (
    <instancedMesh
      key={`${base}-${spots.length}`}
      ref={ref}
      args={[part.geometry, part.material, spots.length]}
      castShadow={castShadow}
      receiveShadow={false}
    />
  )
}

function TreeInstances({
  spots,
  scene,
  kind,
  castShadow,
}: {
  spots: TreeSpot[]
  scene: Object3D
  kind: TreeSpot['kind']
  castShadow: boolean
}) {
  const baseH = useMemo(() => nativeHeight(scene), [scene])
  const unit = TARGET_H[kind] / baseH
  const parts = useMemo(() => collectParts(scene), [scene])
  // Same per-tree transform the old <Clone position rotation scale> applied
  const matrices = useMemo(() => {
    const q = new Quaternion()
    const e = new Euler()
    const p = new Vector3()
    const sc = new Vector3()
    return spots.map((spot) => {
      p.set(spot.x, 0, spot.z)
      q.setFromEuler(e.set(0, spot.rot ?? 0, 0))
      const k = unit * spot.s
      sc.set(k, k, k)
      return new Matrix4().compose(p, q, sc)
    })
  }, [spots, unit])

  if (!matrices.length) return null
  return (
    <group>
      {parts.map((part, i) => (
        <PartInstances key={i} base={i} part={part} spots={matrices} castShadow={castShadow} />
      ))}
    </group>
  )
}

function TreeForest({ mobile }: { mobile: boolean }) {
  const deciduous = useGLTF(TREE_URL)
  const pine = useGLTF(PINE_URL)
  const spots = useMemo(() => {
    const all = TREE_SPOTS
    if (!mobile) return all
    // Keep denser than before, but thin on phones
    return all.filter((_, i) => i % 2 === 0)
  }, [mobile])

  const trees = useMemo(() => spots.filter((s) => s.kind === 'tree'), [spots])
  const pines = useMemo(() => spots.filter((s) => s.kind === 'pine'), [spots])

  return (
    <group>
      <TreeInstances spots={trees} scene={deciduous.scene} kind="tree" castShadow={!mobile} />
      <TreeInstances spots={pines} scene={pine.scene} kind="pine" castShadow={!mobile} />
    </group>
  )
}

export function WorldTrees({ mobile = false }: { mobile?: boolean }) {
  return (
    <Suspense fallback={null}>
      <TreeForest mobile={mobile} />
    </Suspense>
  )
}
