'use client'

import { useMemo } from 'react'
import { ExtrudeGeometry, Shape } from 'three'
import { mapPalette as MAP } from '@/lib/game/map-theme'
import { SLABS, type Slab } from '@/lib/game/world-layout'

function roundedRect(w: number, d: number, radius: number) {
  const r = Math.min(radius, w / 2 - 0.2, d / 2 - 0.2)
  const x = -w / 2
  const y = -d / 2
  const shape = new Shape()
  shape.moveTo(x + r, y)
  shape.lineTo(x + w - r, y)
  shape.quadraticCurveTo(x + w, y, x + w, y + r)
  shape.lineTo(x + w, y + d - r)
  shape.quadraticCurveTo(x + w, y + d, x + w - r, y + d)
  shape.lineTo(x + r, y + d)
  shape.quadraticCurveTo(x, y + d, x, y + d - r)
  shape.lineTo(x, y + r)
  shape.quadraticCurveTo(x, y, x + r, y)
  return shape
}

function slabGeometry(w: number, d: number, h: number, radius: number) {
  return new ExtrudeGeometry(roundedRect(w, d, radius), {
    depth: h,
    bevelEnabled: false,
    curveSegments: 10,
  })
}

function Island({ slab }: { slab: Slab }) {
  const fill = useMemo(() => slabGeometry(slab.w, slab.d, slab.h, slab.radius), [slab])
  const outline = useMemo(
    () => slabGeometry(slab.w + 0.36, slab.d + 0.36, 0.03, slab.radius + 0.08),
    [slab],
  )
  const color = slab.color ?? (slab.tone === 'residential' ? MAP.landLight : MAP.land)

  return (
    <group>
      <mesh
        geometry={outline}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[slab.x, -slab.h + 0.01, slab.z]}
        receiveShadow
      >
        <meshStandardMaterial color={MAP.slabOutline} roughness={0.78} />
      </mesh>
      <mesh
        geometry={fill}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[slab.x, -slab.h, slab.z]}
        receiveShadow
      >
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
    </group>
  )
}

export function WorldGround() {
  return (
    <group>
      {SLABS.map((slab) => (
        <Island key={slab.name} slab={slab} />
      ))}
    </group>
  )
}
