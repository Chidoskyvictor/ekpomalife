'use client'

import { Clone, useGLTF } from '@react-three/drei'
import { Suspense, useMemo } from 'react'
import { Group, type Object3D } from 'three'
import { planRoadBits, type RoadBitName } from '@/lib/game/road-bits'
import { ROAD_FRAME, ROAD_GAPS, ROAD_W } from '@/lib/game/world-layout'
import { mapPalette as MAP } from '@/lib/game/map-theme'

/**
 * City Bits road kit (`campusroad.glb`): straight / junction / corner / t-split / crossing.
 * Meshes are 0.02×0.02 with node scale 100 → 2×2 tiles lying in XY; we lay them flat.
 */
const ROAD_URL = '/models/campusroad.glb'
const NATIVE_TILE = 2
const BIT_NAMES: RoadBitName[] = [
  'road_straight',
  'road_corner',
  'road_corner_curved',
  'road_junction',
  'road_tsplit',
  'road_straight_crossing',
]

useGLTF.preload(ROAD_URL)

function extractBits(scene: Object3D) {
  const bits: Partial<Record<RoadBitName, Object3D>> = {}
  for (const name of BIT_NAMES) {
    const node = scene.getObjectByName(name)
    if (!node) continue
    const holder = new Group()
    const clone = node.clone(true)
    clone.position.set(0, 0, 0)
    // Kit is XY-flat (thin Z); bake onto XZ so Clone yaw props don't wipe it
    clone.rotation.x = -Math.PI / 2
    holder.add(clone)
    bits[name] = holder
  }
  return bits
}

function RoadBitNetwork() {
  const { scene } = useGLTF(ROAD_URL)
  const bits = useMemo(() => extractBits(scene), [scene])
  const scale = ROAD_W / NATIVE_TILE
  const placements = useMemo(() => planRoadBits(ROAD_GAPS, ROAD_W), [])

  return (
    <group position={[0, 0.07, 0]}>
      {placements.map((p) => {
        const src = bits[p.bit] ?? bits.road_straight
        if (!src) return null
        return (
          <Clone
            key={`${p.bit}-${p.x.toFixed(2)}-${p.z.toFixed(2)}`}
            object={src}
            position={[p.x, 0, p.z]}
            rotation={[0, p.rot, 0]}
            scale={scale}
            castShadow
            receiveShadow
          />
        )
      })}
    </group>
  )
}

/** Thin underlay only on snapped road cells — no crossing double-beds. */
function RoadBeds() {
  const placements = useMemo(() => planRoadBits(ROAD_GAPS, ROAD_W), [])
  return (
    <group>
      {placements.map((p) => (
        <mesh
          key={`bed-${p.x.toFixed(2)}-${p.z.toFixed(2)}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[p.x, 0.035, p.z]}
          receiveShadow
        >
          <planeGeometry args={[ROAD_W * 1.02, ROAD_W * 1.02]} />
          <meshStandardMaterial color="#2a2a2a" roughness={0.96} />
        </mesh>
      ))}
    </group>
  )
}

export function WorldRoads() {
  return (
    <group>
      {ROAD_FRAME.map((frame, i) => (
        <mesh key={`frame-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[frame.x, 0.03, frame.z]} receiveShadow>
          <planeGeometry args={[frame.w, frame.d]} />
          <meshStandardMaterial color={MAP.road} roughness={0.94} />
        </mesh>
      ))}
      <RoadBeds />
      <Suspense fallback={null}>
        <RoadBitNetwork />
      </Suspense>
    </group>
  )
}
