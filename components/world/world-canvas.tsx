'use client'

import { MapControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'
import { getLocation } from '@/lib/game/content'
import { useGame } from '@/hooks/use-game'
import { PlayerAvatar } from './player-avatar'
import { WorldGround } from './world-ground'
import { WorldLandmarks } from './world-landmarks'
import { WorldTown } from './world-town'

const CAMERA_OFFSET = new Vector3(36, 44, 36)

type PanControls = { target: Vector3; update: () => void }

function CameraRig({ focusId }: { focusId: string | null }) {
  const controls = useThree((state) => state.controls) as unknown as PanControls | null
  const camera = useThree((state) => state.camera)
  const width = useThree((state) => state.size.width)
  const goal = useRef<Vector3 | null>(null)

  useEffect(() => {
    camera.zoom = Math.max(9, Math.min(16, width / 80))
    camera.updateProjectionMatrix()
  }, [camera, width])

  useEffect(() => {
    const location = focusId ? getLocation(focusId) : null
    goal.current = location ? new Vector3(location.position[0], 0, location.position[1] + 4) : null
  }, [focusId])

  useFrame((_, delta) => {
    if (!controls || !goal.current) return
    const step = Math.min(1, delta * 3)
    const move = goal.current.clone().sub(controls.target).multiplyScalar(step)
    controls.target.add(move)
    camera.position.add(move)
    if (controls.target.distanceTo(goal.current) < 0.05) goal.current = null
    controls.update()
  })

  return null
}

export function WorldCanvas() {
  const { state, selectedId, select } = useGame()
  const currentId = state?.locationId ?? null

  return (
    <div className="absolute inset-0 bg-[#cfe5c4]" aria-label="Interactive map of Ekpoma" role="application">
      <Canvas
        shadows
        orthographic
        dpr={[1, 2]}
        camera={{ position: CAMERA_OFFSET.toArray(), zoom: 12, near: -200, far: 400 }}
        onPointerMissed={() => select(null)}
      >
        <color attach="background" args={['#cfe5c4']} />
        <ambientLight intensity={1.1} />
        <hemisphereLight args={['#fff8e6', '#7fae6c', 0.6]} />
        <directionalLight
          position={[30, 50, 20]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-60}
          shadow-camera-right={60}
          shadow-camera-top={60}
          shadow-camera-bottom={-60}
          shadow-bias={-0.0005}
        />
        <WorldGround />
        <WorldTown />
        <WorldLandmarks selectedId={selectedId} currentId={currentId} onSelect={select} />
        {state ? <PlayerAvatar locationId={state.locationId} color={state.avatarColor} /> : null}
        <MapControls
          makeDefault
          enableRotate={false}
          screenSpacePanning
          minZoom={6}
          maxZoom={40}
          zoomSpeed={0.8}
        />
        <CameraRig focusId={selectedId} />
      </Canvas>
    </div>
  )
}
