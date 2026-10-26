'use client'

import { useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, Color, CylinderGeometry, Euler, Matrix4, Quaternion, SphereGeometry, Vector3, type InstancedMesh } from 'three'

export type Shape = {
  /** Centre */
  p: [number, number, number]
  /** Size (box: w h d; sphere: diameter per axis; cylinder: diameter, height, diameter) */
  s: [number, number, number]
  /** Rotation in radians */
  r?: [number, number, number]
  c: string
}

const GEOMETRY = {
  box: () => new BoxGeometry(1, 1, 1),
  sphere: () => new SphereGeometry(0.5, 10, 8),
  cylinder: () => new CylinderGeometry(0.5, 0.5, 1, 10),
}

/**
 * Many coloured shapes in one draw call (fences, gates, houses on the street). Keeps the
 * street light on phones: a whole row of compounds is a handful of InstancedMeshes.
 */
export function InstancedShapes({
  shapes,
  kind = 'box',
  roughness = 0.85,
  shadows = false,
}: {
  shapes: Shape[]
  kind?: keyof typeof GEOMETRY
  roughness?: number
  shadows?: boolean
}) {
  const mesh = useRef<InstancedMesh>(null)
  const geometry = useMemo(() => GEOMETRY[kind](), [kind])

  useLayoutEffect(() => {
    const target = mesh.current
    if (!target) return
    const m = new Matrix4()
    const q = new Quaternion()
    const e = new Euler()
    const color = new Color()
    shapes.forEach((shape, i) => {
      e.set(...(shape.r ?? [0, 0, 0]))
      m.compose(new Vector3(...shape.p), q.setFromEuler(e), new Vector3(...shape.s))
      target.setMatrixAt(i, m)
      target.setColorAt(i, color.set(shape.c))
    })
    target.instanceMatrix.needsUpdate = true
    if (target.instanceColor) target.instanceColor.needsUpdate = true
    target.computeBoundingSphere()
  }, [shapes])

  useLayoutEffect(() => () => geometry.dispose(), [geometry])

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, undefined, shapes.length]}
      castShadow={shadows}
      receiveShadow={shadows}
      // Taps go to the floor under the shapes
      raycast={() => null}
    >
      <meshStandardMaterial roughness={roughness} />
    </instancedMesh>
  )
}
