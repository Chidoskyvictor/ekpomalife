'use client'

import { ContactShadows, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useMemo } from 'react'
import type { RoomItem, RoomState } from '@/lib/game/room-types'
import { RoomItemMesh } from './room-item'
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
    const x = grid.w * 0.55
    const z = grid.d * 1.35
    return { position: [x + 4.5, 6.5, z + 3.5] as [number, number, number], target: [x, 0.4, grid.d * 0.35] as [number, number, number] }
  }, [grid.w, grid.d])

  return (
    <Canvas
      orthographic
      dpr={lowPerf ? [1, 1.5] : [1, 1.75]}
      frameloop="demand"
      camera={{ position: cam.position, zoom: 48, near: 0.1, far: 80 }}
      gl={{ antialias: !lowPerf, alpha: true }}
      style={{ width: '100%', height: '100%' }}
      onCreated={({ camera, invalidate }) => {
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
        />
        {draftItems.map((item) => (
          <RoomItemMesh
            key={item.uid}
            item={item}
            selected={item.uid === selectedUid}
            spinning={!editMode && item.itemId === 'standing-fan'}
          />
        ))}
        {ghost ? <RoomItemMesh item={ghost.item} ghost valid={ghost.valid} /> : null}
        {!lowPerf ? (
          <ContactShadows position={[grid.w / 2, 0.01, grid.d / 2]} opacity={0.35} scale={20} blur={2.2} far={6} />
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
