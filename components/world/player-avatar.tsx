'use client'

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Vector3, type Group } from 'three'
import { CharacterFigure } from '@/components/look/character-figure'
import { getLocation } from '@/lib/game/content'
import { isMapLocation } from '@/lib/game/world-layout'
import { DEFAULT_APPEARANCE, normalizeAppearance, type Appearance } from '@/lib/game/look'

export function avatarSpot(locationId: string): [number, number, number] {
  const location = getLocation(isMapLocation(locationId) ? locationId : 'aau_campus')
  if (!location) return [0, 0, 0]
  return [location.position[0] + location.size[0] / 2 + 0.6, 0, location.position[1] + location.size[2] / 2 + 0.9]
}

export function PlayerAvatar({
  locationId,
  color,
  appearance,
}: {
  locationId: string
  color: string
  appearance?: Appearance
}) {
  const ref = useRef<Group>(null)
  const target = useRef(new Vector3())
  const look = normalizeAppearance(appearance ?? { ...DEFAULT_APPEARANCE, fabric: 'plain-navy' })

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
    <group ref={ref} position={avatarSpot(locationId)} scale={0.55}>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.7, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} />
      </mesh>
      <CharacterFigure appearance={look} />
    </group>
  )
}
