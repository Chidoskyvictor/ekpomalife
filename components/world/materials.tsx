'use client'

import { BoxGeometry, MeshStandardMaterial } from 'three'
import { MAP } from '@/lib/game/map-theme'

export const unitBox = new BoxGeometry(1, 1, 1)

const cache = new Map<string, MeshStandardMaterial>()

export function paint(color: string, roughness = 0.82) {
  const key = `${color}:${roughness}`
  let material = cache.get(key)
  if (!material) {
    material = new MeshStandardMaterial({ color, roughness, metalness: 0.02 })
    cache.set(key, material)
  }
  return material
}

export const glass = new MeshStandardMaterial({
  color: MAP.window,
  roughness: 0.28,
  metalness: 0.12,
  emissive: MAP.window,
  emissiveIntensity: 0.04,
})

export function Block({
  position,
  size,
  color,
  material,
  shadow = true,
}: {
  position: [number, number, number]
  size: [number, number, number]
  color?: string
  material?: MeshStandardMaterial
  shadow?: boolean
}) {
  return (
    <mesh
      geometry={unitBox}
      material={material ?? paint(color ?? MAP.building)}
      position={position}
      scale={size}
      castShadow={shadow}
      receiveShadow
    />
  )
}
