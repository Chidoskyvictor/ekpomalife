'use client'

import { BoxGeometry, MeshStandardMaterial } from 'three'

export const unitBox = new BoxGeometry(1, 1, 1)

const cache = new Map<string, MeshStandardMaterial>()

export function paint(color: string, roughness = 0.65) {
  const key = `${color}:${roughness}`
  let material = cache.get(key)
  if (!material) {
    material = new MeshStandardMaterial({ color, roughness })
    cache.set(key, material)
  }
  return material
}

export const glass = new MeshStandardMaterial({
  color: '#8fd3ff',
  roughness: 0.08,
  metalness: 0.55,
  emissive: '#2f80ed',
  emissiveIntensity: 0.12,
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
      material={material ?? paint(color ?? '#ffffff')}
      position={position}
      scale={size}
      castShadow={shadow}
      receiveShadow
    />
  )
}
