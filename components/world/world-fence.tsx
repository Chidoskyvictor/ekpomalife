'use client'

import { MAP } from '@/lib/game/map-theme'
import { FENCE_X, FIRST_SLAB } from '@/lib/game/world-layout'
import { Block } from './materials'

/** Red AAU fence line down the first slab. */
export function WorldFence() {
  const z0 = FIRST_SLAB.z - FIRST_SLAB.d / 2 + 2
  const z1 = FIRST_SLAB.z + FIRST_SLAB.d / 2 - 2
  const length = z1 - z0
  const posts = Math.max(8, Math.floor(length / 4))

  return (
    <group>
      <Block
        position={[FENCE_X, 0.55, (z0 + z1) / 2]}
        size={[0.12, 1.1, length]}
        color="#c62828"
        shadow={false}
      />
      {Array.from({ length: posts }, (_, i) => {
        const t = i / (posts - 1)
        const z = z0 + t * length
        return (
          <Block
            key={i}
            position={[FENCE_X, 0.7, z]}
            size={[0.22, 1.4, 0.22]}
            color="#8b1a1a"
            shadow={false}
          />
        )
      })}
      <Block
        position={[FENCE_X, 1.35, (z0 + z1) / 2]}
        size={[0.16, 0.1, length]}
        color="#e53935"
        shadow={false}
      />
      {/* Subtle ground mark */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[FENCE_X, 0.06, (z0 + z1) / 2]}>
        <planeGeometry args={[0.5, length]} />
        <meshStandardMaterial color={MAP.laterite} roughness={0.9} transparent opacity={0.35} />
      </mesh>
    </group>
  )
}
