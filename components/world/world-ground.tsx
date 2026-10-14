'use client'

import { useMemo } from 'react'
import { ExtrudeGeometry, Shape } from 'three'
import { MAP } from '@/lib/game/map-theme'
import { SLABS, UKE_LATERITE, type Slab } from '@/lib/game/world-layout'
import { WorldRoads } from './world-roads'

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
  const color = slab.tone === 'residential' ? MAP.landLight : MAP.land

  return (
    <group>
      <mesh
        geometry={outline}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[slab.x, -slab.h + 0.01, slab.z]}
        receiveShadow
      >
        <meshStandardMaterial color={MAP.slabOutline} roughness={0.96} />
      </mesh>
      <mesh
        geometry={fill}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[slab.x, -slab.h, slab.z]}
        receiveShadow
      >
        <meshStandardMaterial color={color} roughness={0.94} />
      </mesh>
    </group>
  )
}

function LateritePatch() {
  const geometry = useMemo(
    () => slabGeometry(UKE_LATERITE.w, UKE_LATERITE.d, 0.04, 1.2),
    [],
  )
  return (
    <mesh
      geometry={geometry}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[UKE_LATERITE.x, 0.02, UKE_LATERITE.z]}
      receiveShadow
    >
      <meshStandardMaterial color={MAP.laterite} roughness={0.92} />
    </mesh>
  )
}

export function WorldGround() {
  const floorY = -SLABS[0]!.h - 0.08
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY, 0]} receiveShadow>
        <planeGeometry args={[420, 420]} />
        <meshStandardMaterial color={MAP.water} roughness={0.96} />
      </mesh>
      {SLABS.map((slab) => (
        <Island key={slab.name} slab={slab} />
      ))}
      <LateritePatch />
      <WorldRoads />
    </group>
  )
}
