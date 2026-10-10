'use client'

import { MapControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'
import { getLocation } from '@/lib/game/content'
import { MAP } from '@/lib/game/map-theme'
import { LAND_CENTER, WORLD } from '@/lib/game/world-layout'
import { useGame } from '@/hooks/use-game'
import { PlayerAvatar } from './player-avatar'
import { WorldGround } from './world-ground'
import { WorldLandmarks } from './world-landmarks'

const PITCH = (48 * Math.PI) / 180
const HEADING = 0
const DISTANCE = 78
const MIN_PITCH = (35 * Math.PI) / 180
const MAX_PITCH = (58 * Math.PI) / 180
const TARGET_PAD = 8

const CAMERA_OFFSET = new Vector3(
  DISTANCE * Math.sin(PITCH) * Math.sin(HEADING),
  DISTANCE * Math.cos(PITCH),
  DISTANCE * Math.sin(PITCH) * Math.cos(HEADING),
)

type PanControls = { target: Vector3; update: () => void }

function CameraRig({ focusId }: { focusId: string | null }) {
  const controls = useThree((state) => state.controls) as unknown as PanControls | null
  const camera = useThree((state) => state.camera)
  const goal = useRef<Vector3 | null>(null)

  useEffect(() => {
    const location = focusId ? getLocation(focusId) : null
    goal.current = location ? new Vector3(location.position[0], 0, location.position[1] + 4) : null
  }, [focusId])

  useFrame((_, delta) => {
    if (!controls) return
    if (goal.current) {
      const step = Math.min(1, delta * 3)
      const move = goal.current.clone().sub(controls.target).multiplyScalar(step)
      controls.target.add(move)
      camera.position.add(move)
      if (controls.target.distanceTo(goal.current) < 0.05) goal.current = null
    }
    const minX = WORLD.x - WORLD.w / 2 + TARGET_PAD
    const maxX = WORLD.x + WORLD.w / 2 - TARGET_PAD
    const minZ = WORLD.z - WORLD.d / 2 + TARGET_PAD
    const maxZ = WORLD.z + WORLD.d / 2 - TARGET_PAD
    const x = Math.min(maxX, Math.max(minX, controls.target.x))
    const z = Math.min(maxZ, Math.max(minZ, controls.target.z))
    if (x !== controls.target.x || z !== controls.target.z) {
      camera.position.x += x - controls.target.x
      camera.position.z += z - controls.target.z
      controls.target.x = x
      controls.target.z = z
    }
    controls.target.y = 0
    controls.update()
  })

  return null
}

export function WorldCanvas() {
  const { state, selectedId, select } = useGame()
  const currentId = state?.locationId ?? null

  return (
    <div className="absolute inset-0 bg-[#6EC8EE]" aria-label="Interactive map of Ekpoma" role="application">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{
          position: [LAND_CENTER.x + CAMERA_OFFSET.x, CAMERA_OFFSET.y, LAND_CENTER.z + CAMERA_OFFSET.z],
          fov: 42,
          near: 0.5,
          far: 420,
        }}
        onPointerMissed={() => select(null)}
      >
        <color attach="background" args={[MAP.water]} />
        <hemisphereLight args={['#FFF6E8', MAP.shadow, 0.9]} />
        <directionalLight
          position={[40, 70, 22]}
          intensity={1.15}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-110}
          shadow-camera-right={110}
          shadow-camera-top={110}
          shadow-camera-bottom={-110}
          shadow-bias={-0.0004}
        />
        <WorldGround />
        <WorldLandmarks selectedId={selectedId} currentId={currentId} onSelect={select} />
        {state ? <PlayerAvatar locationId={state.locationId} color={state.avatarColor} appearance={state.appearance} /> : null}
        <MapControls
          makeDefault
          enableRotate
          screenSpacePanning
          minPolarAngle={MIN_PITCH}
          maxPolarAngle={MAX_PITCH}
          minDistance={32}
          maxDistance={100}
          zoomSpeed={0.7}
          rotateSpeed={0.45}
          target={[LAND_CENTER.x, 0, LAND_CENTER.z]}
        />
        <CameraRig focusId={selectedId} />
      </Canvas>
    </div>
  )
}
