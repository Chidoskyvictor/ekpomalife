'use client'

import { useEffect, useMemo } from 'react'
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import { WORLD, mulberry32 } from '@/lib/game/world-layout'

const BASE_Y = -0.3
const SPAN = 900

/** Faint static grain so the blue reads as a solid ground surface, not a flat fill. */
function grainTexture() {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)
  const rand = mulberry32(911)
  for (let i = 0; i < 900; i++) {
    const shade = rand() > 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.5)'
    ctx.fillStyle = shade
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1 + rand() * 2)
  }
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(SPAN / 18, SPAN / 18)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/** Still, matte blue ground under the campus slabs (soft on the eyes). */
export function WorldBase({ color }: { color: string }) {
  const texture = useMemo(() => grainTexture(), [])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[WORLD.x, BASE_Y, WORLD.z]} receiveShadow>
      <planeGeometry args={[SPAN, SPAN]} />
      <meshStandardMaterial color={color} map={texture} roughness={1} metalness={0} />
    </mesh>
  )
}
