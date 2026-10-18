'use client'

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group, Mesh } from 'three'

export function RoomPrimitive({
  kind,
  spinning,
}: {
  kind: string
  spinning?: boolean
}) {
  const blade = useRef<Mesh>(null)
  useFrame((_, dt) => {
    if (!spinning || !blade.current) return
    blade.current.rotation.y += dt * 4
  })

  switch (kind) {
    case 'mattress':
      return (
        <group>
          <mesh position={[0, 0.12, 0]} castShadow>
            <boxGeometry args={[1.7, 0.18, 2.6]} />
            <meshStandardMaterial color="#d4c4a8" />
          </mesh>
          <mesh position={[0, 0.24, -0.7]}>
            <boxGeometry args={[1.5, 0.12, 0.5]} />
            <meshStandardMaterial color="#f5f0e6" />
          </mesh>
        </group>
      )
    case 'fan':
      return (
        <group>
          <mesh position={[0, 0.55, 0]}>
            <cylinderGeometry args={[0.06, 0.1, 1.1, 8]} />
            <meshStandardMaterial color="#cbd5e1" />
          </mesh>
          <mesh ref={blade} position={[0, 1.15, 0]}>
            <boxGeometry args={[0.9, 0.04, 0.16]} />
            <meshStandardMaterial color="#94a3b8" />
          </mesh>
        </group>
      )
    case 'lamp-rechargeable':
      return (
        <group>
          <mesh position={[0, 0.2, 0]}>
            <boxGeometry args={[0.28, 0.4, 0.18]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
          <mesh position={[0, 0.48, 0]}>
            <sphereGeometry args={[0.12, 12, 12]} />
            <meshStandardMaterial color="#fde68a" emissive="#fbbf24" emissiveIntensity={0.4} />
          </mesh>
        </group>
      )
    case 'gen':
      return (
        <mesh position={[0, 0.35, 0]}>
          <boxGeometry args={[0.7, 0.7, 0.55]} />
          <meshStandardMaterial color="#dc2626" />
        </mesh>
      )
    case 'bucket':
      return (
        <mesh position={[0, 0.28, 0]}>
          <cylinderGeometry args={[0.28, 0.22, 0.5, 12]} />
          <meshStandardMaterial color="#38bdf8" />
        </mesh>
      )
    case 'bag':
      return (
        <mesh position={[0, 0.35, 0]}>
          <boxGeometry args={[0.55, 0.7, 0.35]} />
          <meshStandardMaterial color="#b45309" />
        </mesh>
      )
    case 'poster':
      return (
        <mesh position={[0, 1.2, 0]}>
          <planeGeometry args={[0.7, 0.9]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
      )
    case 'curtain':
      return (
        <mesh position={[0, 1.3, 0]}>
          <planeGeometry args={[1.5, 1.8]} />
          <meshStandardMaterial color="#c2410c" transparent opacity={0.85} />
        </mesh>
      )
    default:
      return (
        <mesh position={[0, 0.35, 0]}>
          <boxGeometry args={[0.6, 0.7, 0.6]} />
          <meshStandardMaterial color="#94a3b8" />
        </mesh>
      )
  }
}

export function FurnitureFallback({
  color = '#64748b',
  w = 1,
  d = 1,
  h = 0.7,
}: {
  color?: string
  w?: number
  d?: number
  h?: number
}) {
  const root = useRef<Group>(null)
  return (
    <group ref={root}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w * 0.85, h, d * 0.85]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  )
}

export function primitiveKindFromModel(model: string): string | null {
  if (model.startsWith('primitive:')) return model.slice('primitive:'.length)
  if (model.includes('bed')) return 'mattress'
  if (model.includes('Fan') || model.includes('fan')) return 'fan'
  if (model.includes('lamp') || model.includes('Lamp')) return 'lamp-rechargeable'
  if (model.includes('Fridge') || model.includes('fridge')) return 'default'
  if (model.includes('Stove') || model.includes('stove')) return 'default'
  if (model.includes('Plant') || model.includes('plant')) return 'default'
  if (model.includes('chair') || model.includes('Chair')) return 'default'
  if (model.includes('table') || model.includes('Table')) return 'default'
  if (model.includes('rug') || model.includes('Rug')) return 'default'
  if (model.includes('bookcase') || model.includes('wardrobe')) return 'default'
  return null
}
