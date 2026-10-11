'use client'

import { useMemo } from 'react'
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import { ROAD_GAPS, type RoadGap } from '@/lib/game/world-layout'

const ROAD_WIDTH = 3.6

function gapSize(gap: RoadGap) {
  const alongZ = gap.d > gap.w
  return {
    alongZ,
    w: alongZ ? Math.max(gap.w, ROAD_WIDTH) : gap.w,
    d: alongZ ? gap.d : Math.max(gap.d, ROAD_WIDTH),
  }
}

function paintRoad(alongZ: boolean, length: number) {
  const across = 256
  const along = Math.max(512, Math.round(length * 24))
  const canvas = document.createElement('canvas')
  canvas.width = alongZ ? across : along
  canvas.height = alongZ ? along : across
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#1c1c1e'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#2a2a2c'
  for (let i = 0; i < 180; i++) {
    ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 2, 2)
  }

  const paintStripes = (draw: (u: number, v: number, uw: number, vh: number) => void) => {
    if (alongZ) draw(canvas.width, canvas.height, canvas.width, canvas.height)
    else draw(canvas.height, canvas.width, canvas.width, canvas.height)
  }

  paintStripes((acrossPx, alongPx, w, h) => {
    const edge = acrossPx * 0.08
    const dashW = acrossPx * 0.07
    const dashL = alongPx * 0.08
    const gapL = alongPx * 0.07
    ctx.fillStyle = '#f4f4f4'
    if (alongZ) {
      ctx.fillRect(edge, 0, 3, h)
      ctx.fillRect(w - edge - 3, 0, 3, h)
      for (let y = dashL * 0.3; y < h; y += dashL + gapL) {
        ctx.fillRect(w / 2 - dashW / 2, y, dashW, dashL)
      }
    } else {
      ctx.fillRect(0, edge, w, 3)
      ctx.fillRect(0, h - edge - 3, w, 3)
      for (let x = dashL * 0.3; x < w; x += dashL + gapL) {
        ctx.fillRect(x, h / 2 - dashW / 2, dashL, dashW)
      }
    }
  })

  const map = new CanvasTexture(canvas)
  map.colorSpace = SRGBColorSpace
  map.anisotropy = 8
  map.wrapS = map.wrapT = RepeatWrapping
  return map
}

function RoadInGap({ gap }: { gap: RoadGap }) {
  const { alongZ, w, d } = gapSize(gap)
  const material = useMemo(() => {
    const map = paintRoad(alongZ, alongZ ? d : w)
    return { map, roughness: 0.95, metalness: 0 }
  }, [alongZ, w, d])

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[gap.x, 0.06, gap.z]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial map={material.map} roughness={material.roughness} metalness={material.metalness} />
    </mesh>
  )
}

export function WorldRoads() {
  return (
    <group>
      {ROAD_GAPS.map((gap) => (
        <RoadInGap key={gap.name} gap={gap} />
      ))}
    </group>
  )
}
