'use client'

import { useGLTF } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import { Box3, type Material, type Matrix4 } from 'three'
import { Instances } from '@/components/travel/drive-scene'
import { bakeStaticParts, type StaticPart } from '@/components/world/bake-static'

/*
 * The roadside trees: real low-poly GLB trees (Quaternius via poly.pizza, CC0, see
 * public/models/trees/CREDITS.md), each variant merged into one or two parts and drawn as shared
 * copies. Each model is scaled to a real height and stood on the ground.
 */

/** [file, height in metres]: two palms, three broadleaf trees. */
export const TREE_VARIANTS: [string, number][] = [
  ['/models/trees/palm-a.glb', 9],
  ['/models/trees/palm-b.glb', 7.5],
  ['/models/trees/tree-a.glb', 7],
  ['/models/trees/tree-b.glb', 6],
  ['/models/trees/tree-c.glb', 6.5],
]
export const PALMS = [0, 1]
export const LEAFY = [2, 3, 4]

function Variant({ url, height, matrices }: { url: string; height: number; matrices: Matrix4[] }) {
  const { scene } = useGLTF(url)
  const parts = useMemo(() => {
    const baked = bakeStaticParts(scene.clone(true))
    const box = new Box3()
    for (const p of baked) {
      p.geometry.computeBoundingBox()
      box.union(p.geometry.boundingBox!)
    }
    const k = height / Math.max(0.01, box.max.y - box.min.y)
    const cx = (box.min.x + box.max.x) / 2
    const cz = (box.min.z + box.max.z) / 2
    for (const p of baked) {
      p.geometry.translate(-cx, -box.min.y, -cz)
      p.geometry.scale(k, k, k)
    }
    return baked
  }, [scene, height])
  useEffect(
    () => () =>
      parts.forEach((part) => {
        part.geometry.dispose()
        if ((part.material as Material).userData.baked) (part.material as Material).dispose()
      }),
    [parts],
  )
  if (!matrices.length) return null
  return (
    <>
      {parts.map((part: StaticPart, i) => (
        <Instances key={i} geometry={part.geometry} material={part.material} matrices={matrices} />
      ))}
    </>
  )
}

/** `byVariant[i]`: where the copies of TREE_VARIANTS[i] stand (a matrix each: position, turn, size). */
export function Trees({ byVariant }: { byVariant: Matrix4[][] }) {
  return (
    <>
      {TREE_VARIANTS.map(([url, height], i) => (
        <Variant key={url} url={url} height={height} matrices={byVariant[i] ?? []} />
      ))}
    </>
  )
}

for (const [url] of TREE_VARIANTS) useGLTF.preload(url)
