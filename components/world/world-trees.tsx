'use client'

import { Clone, useGLTF } from '@react-three/drei'
import { Suspense, useMemo } from 'react'
import { Box3, Vector3, type Object3D } from 'three'
import { TREE_SPOTS, type TreeSpot } from '@/lib/game/world-layout'

const TREE_URL = '/models/tree.glb'
const PINE_URL = '/models/pinetree.glb'

useGLTF.preload(TREE_URL)
useGLTF.preload(PINE_URL)

/** Target world height for `s = 1`. */
const TARGET_H = { tree: 2.8, pine: 4.2 }

function nativeHeight(scene: Object3D) {
  const size = new Box3().setFromObject(scene).getSize(new Vector3())
  return Math.max(size.y, 0.05)
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

  return (
    <group>
      {spots.map((spot, i) => (
        <Clone
          key={`${kind}-${i}-${spot.x.toFixed(2)}-${spot.z.toFixed(2)}`}
          object={scene}
          position={[spot.x, 0, spot.z]}
          rotation={[0, spot.rot ?? 0, 0]}
          scale={unit * spot.s}
          castShadow={castShadow}
          receiveShadow={false}
        />
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
