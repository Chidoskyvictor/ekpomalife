'use client'

import { BoxGeometry, MeshStandardMaterial } from 'three'

export const unitBox = new BoxGeometry(1, 1, 1)

const materialCache = new globalThis.Map<string, MeshStandardMaterial>()

const GLASS = '#A6D7E6'
const BUILDING = '#F7F5EE'

export function paint(color: string, roughness = 0.82) {
  const key = `${color}:${roughness}`
  let material = materialCache.get(key)
  if (!material) {
    material = new MeshStandardMaterial({ color, roughness, metalness: 0.02 })
    materialCache.set(key, material)
  }
  return material
}

let glassMaterial: MeshStandardMaterial | undefined

export function glass(): MeshStandardMaterial {
  if (!glassMaterial) {
    glassMaterial = new MeshStandardMaterial({
      color: GLASS,
      roughness: 0.28,
      metalness: 0.12,
      emissive: GLASS,
      emissiveIntensity: 0.04,
    })
  }
  return glassMaterial
}

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
      material={material ?? paint(color ?? BUILDING)}
      position={position}
      scale={size}
      castShadow={shadow}
      receiveShadow
    />
  )
}
