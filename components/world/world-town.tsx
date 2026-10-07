'use client'

import { useMemo } from 'react'
import { generateTown } from '@/lib/game/world-layout'

const LEAF_TONES = ['#4f9a5a', '#5aa865', '#3f8a4f', '#68b26a']

export function WorldTown() {
  const { houses, trees } = useMemo(() => generateTown(), [])

  return (
    <group>
      {houses.map((house, index) => (
        <group key={`h${index}`} position={[house.x, 0, house.z]} rotation={[0, house.rot, 0]}>
          <mesh position={[0, house.h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[house.w, house.h, house.d]} />
            <meshStandardMaterial color={house.wall} />
          </mesh>
          <mesh position={[0, house.h + 0.35, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[Math.max(house.w, house.d) * 0.78, 0.7, 4]} />
            <meshStandardMaterial color={house.roof} flatShading />
          </mesh>
        </group>
      ))}
      {trees.map((tree, index) => (
        <group key={`t${index}`} position={[tree.x, 0, tree.z]} scale={tree.s}>
          <mesh position={[0, 0.5, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.16, 1, 6]} />
            <meshStandardMaterial color="#8a5a3b" />
          </mesh>
          <mesh position={[0, 1.4, 0]} castShadow>
            <icosahedronGeometry args={[0.85, 0]} />
            <meshStandardMaterial color={LEAF_TONES[Math.floor(tree.tone * LEAF_TONES.length)]} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  )
}
