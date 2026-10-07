'use client'

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Vector3, type Group } from 'three'
import { getLocation } from '@/lib/game/content'

export function avatarSpot(locationId: string): [number, number, number] {
  const location = getLocation(locationId)
  if (!location) return [0, 0, 0]
  return [location.position[0] + location.size[0] / 2 + 0.6, 0, location.position[1] + location.size[2] / 2 + 0.9]
}

export function PlayerAvatar({ locationId, color }: { locationId: string; color: string }) {
  const ref = useRef<Group>(null)
  const target = useRef(new Vector3())

  useFrame((state, delta) => {
    const group = ref.current
    if (!group) return
    target.current.set(...avatarSpot(locationId))
    const distance = group.position.distanceTo(target.current)
    if (distance > 0.05) {
      const step = Math.min(1, delta * 2.2)
      group.position.lerp(target.current, step)
      group.lookAt(target.current.x, group.position.y, target.current.z)
    }
    const moving = distance > 0.3
    group.position.y = Math.abs(Math.sin(state.clock.elapsedTime * (moving ? 12 : 3))) * (moving ? 0.25 : 0.08)
  })

  return (
    <group ref={ref} position={avatarSpot(locationId)}>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.7, 24]} />
        <meshBasicMaterial color="#f2c94c" transparent opacity={0.55} />
      </mesh>
      <mesh position={[0, 0.65, 0]} castShadow>
        <capsuleGeometry args={[0.32, 0.6, 4, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.45, 0]} castShadow>
        <sphereGeometry args={[0.3, 16, 12]} />
        <meshStandardMaterial color="#7a4a2e" />
      </mesh>
    </group>
  )
}
