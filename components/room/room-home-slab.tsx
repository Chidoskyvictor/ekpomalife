'use client'

import { useMemo } from 'react'
import { ExtrudeGeometry, Shape } from 'three'

const CEMENT = '#b8b3a8'
const CEMENT_RIM = '#8f8a80'
const SLAB_H = 0.38

function circleShape(radius: number) {
  const shape = new Shape()
  shape.absarc(0, 0, radius, 0, Math.PI * 2, false)
  return shape
}

function diskGeometry(radius: number, depth: number) {
  return new ExtrudeGeometry(circleShape(radius), {
    depth,
    bevelEnabled: false,
    curveSegments: 48,
  })
}

/** Big round cement pad — house mesh will sit here later. */
export function RoomHomeSlab({ radius, cx, cz }: { radius: number; cx: number; cz: number }) {
  const fill = useMemo(() => diskGeometry(radius, SLAB_H), [radius])
  const rim = useMemo(() => diskGeometry(radius + 0.28, 0.06), [radius])

  return (
    <group position={[cx, 0, cz]}>
      <mesh
        geometry={rim}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -SLAB_H + 0.01, 0]}
        receiveShadow
        castShadow
      >
        <meshStandardMaterial color={CEMENT_RIM} roughness={0.9} />
      </mesh>
      <mesh
        geometry={fill}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -SLAB_H, 0]}
        receiveShadow
        castShadow
      >
        <meshStandardMaterial color={CEMENT} roughness={0.84} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]} receiveShadow>
        <ringGeometry args={[radius - 0.22, radius, 64]} />
        <meshStandardMaterial color={CEMENT_RIM} roughness={0.88} />
      </mesh>
    </group>
  )
}
