'use client'

import { useMemo } from 'react'
import { ExtrudeGeometry, Shape } from 'three'
import { MAP } from '@/lib/game/map-theme'
import { SLABS, type Slab } from '@/lib/game/world-layout'

function slabGeometry(slab: Pick<Slab, 'w' | 'd' | 'h' | 'radius'>) {
  const { w, d, h, radius } = slab
  const r = Math.min(radius, w / 2 - 0.4, d / 2 - 0.4)
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
  return new ExtrudeGeometry(shape, {
    depth: h,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.1,
    bevelSegments: 3,
    curveSegments: 10,
  })
}

function Island({ slab }: { slab: Slab }) {
  const geometry = useMemo(() => slabGeometry(slab), [slab])

  return (
    <mesh
      geometry={geometry}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[slab.x, -slab.h, slab.z]}
      receiveShadow
      castShadow
    >
      <meshStandardMaterial color={MAP.land} roughness={0.94} />
    </mesh>
  )
}

export function WorldGround() {
  const waterY = -SLABS[0]!.h - 0.28
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, waterY, 0]} receiveShadow>
        <planeGeometry args={[420, 420]} />
        <meshStandardMaterial color={MAP.water} roughness={0.96} />
      </mesh>
      {SLABS.map((slab) => (
        <Island key={slab.name} slab={slab} />
      ))}
    </group>
  )
}
