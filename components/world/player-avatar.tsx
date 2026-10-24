'use client'

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Vector3, type Group } from 'three'
import { CharacterFigure } from '@/components/look/character-figure'
import { getPlace, getPlaceByZone } from '@/lib/game/places'
import { MAP_ZONES } from '@/lib/game/world-layout'
import { DEFAULT_APPEARANCE, normalizeAppearance, type Appearance } from '@/lib/game/look'

export function avatarSpot(locationId: string): [number, number, number] {
  const place = getPlace(locationId) ?? getPlaceByZone(locationId)
  const zone = MAP_ZONES.find((entry) => entry.id === (place?.zoneId ?? locationId))
  if (zone) {
    const [fw, fd] = zone.footprint
    return [zone.position[0] + fw * 0.15, 0, zone.position[1] + fd * 0.15]
  }
  return [0, 0, 0]
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
  const moving = useRef(false)
  const look = normalizeAppearance(appearance ?? DEFAULT_APPEARANCE)

  useFrame((_, delta) => {
    const group = ref.current
    if (!group) return
    target.current.set(...avatarSpot(locationId))
    const distance = group.position.distanceTo(target.current)
    if (distance > 0.05) {
      const step = Math.min(1, delta * 2.2)
      group.position.lerp(target.current, step)
      group.lookAt(target.current.x, group.position.y, target.current.z)
    }
    // The figure plays its walk cycle while travelling, idles otherwise
    moving.current = distance > 0.3
  })

  return (
    <group ref={ref} position={avatarSpot(locationId)} scale={0.55}>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.7, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} />
      </mesh>
      <CharacterFigure appearance={look} moving={moving} />
    </group>
  )
}
