'use client'

import { useMemo } from 'react'
import type { RoomStyle } from '@/lib/game/room-types'

const FLOOR_COLORS: Record<RoomStyle['floorId'], string> = {
  cement: '#b8b3a8',
  'tiles-white': '#f1f5f9',
  'tiles-terracotta': '#c26d4a',
  'wood-laminate': '#a67c52',
  'rug-carpet': '#7c6a58',
}

export function RoomShell({
  grid,
  style,
  period,
  hasGen,
  showGrid,
}: {
  grid: { w: number; d: number }
  style: RoomStyle
  period?: string
  hasGen: boolean
  showGrid?: boolean
}) {
  const evening = period === 'evening' || period === 'night'
  const dim = evening && !hasGen
  const floorColor = FLOOR_COLORS[style.floorId]
  const lines = useMemo(() => {
    if (!showGrid) return null
    const segs: [number, number, number, number][] = []
    for (let x = 0; x <= grid.w; x++) segs.push([x, 0, x, grid.d])
    for (let z = 0; z <= grid.d; z++) segs.push([0, z, grid.w, z])
    return segs
  }, [grid.w, grid.d, showGrid])

  return (
    <group>
      <ambientLight intensity={dim ? 0.25 : evening ? 0.45 : 0.7} />
      <directionalLight
        position={[6, 10, 4]}
        intensity={dim ? 0.2 : evening ? 0.55 : 1.05}
        color={evening ? '#ffd7a8' : '#ffffff'}
      />
      {evening ? (
        <pointLight position={[grid.w * 0.5, 1.6, 1.2]} intensity={hasGen ? 0.9 : 0.25} color="#ffcc88" />
      ) : null}

      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[grid.w / 2, 0, grid.d / 2]} receiveShadow>
        <planeGeometry args={[grid.w, grid.d]} />
        <meshStandardMaterial color={floorColor} />
      </mesh>

      {/* Back wall (z = 0) */}
      <mesh position={[grid.w / 2, 1.4, 0]}>
        <boxGeometry args={[grid.w, 2.8, 0.08]} />
        <meshStandardMaterial color={style.wallColor} />
      </mesh>

      {/* Left wall */}
      <mesh position={[0, 1.4, grid.d / 2]}>
        <boxGeometry args={[0.08, 2.8, grid.d]} />
        <meshStandardMaterial color={style.wallColor} />
      </mesh>

      {/* Window on back wall */}
      <mesh position={[grid.w * 0.65, 1.55, 0.05]}>
        <planeGeometry args={[1.2, 0.9]} />
        <meshStandardMaterial color="#9ec9ef" emissive="#7eb6e8" emissiveIntensity={evening ? 0.05 : 0.25} />
      </mesh>

      {showGrid && lines
        ? lines.map(([x1, z1, x2, z2], i) => {
            const midX = (x1 + x2) / 2
            const midZ = (z1 + z2) / 2
            const len = Math.hypot(x2 - x1, z2 - z1)
            const horiz = Math.abs(z2 - z1) < 0.001
            return (
              <mesh
                key={`g-${i}`}
                position={[midX, 0.02, midZ]}
                rotation={horiz ? [-Math.PI / 2, 0, 0] : [-Math.PI / 2, 0, Math.PI / 2]}
              >
                <planeGeometry args={[len, 0.02]} />
                <meshBasicMaterial color={z1 === 0 && z2 === 0 ? '#3d9ad6' : '#94a3b8'} transparent opacity={0.45} />
              </mesh>
            )
          })
        : null}
    </group>
  )
}
