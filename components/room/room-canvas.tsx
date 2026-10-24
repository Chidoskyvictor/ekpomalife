'use client'

import { ContactShadows, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useMemo } from 'react'
import type { RoomItem, RoomState } from '@/lib/game/room-types'
import { RoomShell } from './room-shell'

export function RoomCanvas({
  room,
  draftItems,
  selectedUid,
  ghost,
  editMode,
  period,
  lowPerf,
}: {
  room: RoomState
  draftItems: RoomItem[]
  selectedUid: string | null
  ghost: { item: RoomItem; valid: boolean } | null
  editMode: boolean
  period?: string
  lowPerf?: boolean
}) {
  const grid = room.tier.grid
  const hasGen = draftItems.some((row) => row.placed && row.itemId === 'small-gen')
  const cam = useMemo(() => {
    const cx = grid.w / 2
    const cz = grid.d / 2
    return {
      position: [cx + 5.5, 7.5, cz + 5.5] as [number, number, number],
      target: [cx, 0, cz] as [number, number, number],
    }
  }, [grid.w, grid.d])

  return (
    <Canvas
      orthographic
      dpr={lowPerf ? [1, 1.5] : [1, 1.75]}
      camera={{ position: cam.position, zoom: 52, near: 0.1, far: 80 }}
      gl={{ antialias: !lowPerf, alpha: false }}
      style={{ width: '100%', height: '100%' }}
      onCreated={({ camera, gl, invalidate, scene }) => {
        gl.setClearColor('#eef3f8', 1)
        scene.background = null
        camera.lookAt(...cam.target)
        invalidate()
      }}
    >
      <Suspense fallback={null}>
        <RoomShell
          grid={grid}
          style={room.style}
          period={period}
          hasGen={hasGen}
          showGrid={editMode}
          foundationOnly
        />
        {!lowPerf ? (
          <ContactShadows
            position={[grid.w / 2, 0.02, grid.d / 2]}
            opacity={0.28}
            scale={Math.max(grid.w, grid.d) * 1.6}
            blur={2.4}
            far={8}
          />
        ) : null}
        <OrbitControls
          makeDefault
          target={cam.target}
          enablePan={false}
          minZoom={32}
          maxZoom={70}
          minPolarAngle={0.55}
          maxPolarAngle={1.25}
          minAzimuthAngle={-0.35}
          maxAzimuthAngle={0.85}
        />
      </Suspense>
    </Canvas>
  )
}
