'use client'

import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { PerspectiveCamera } from 'three'
import { applyRoomCamera, ROOM_CAMERA } from '@/lib/game/room-camera'
import { useRoomCameraDebug } from './room-camera-debug-context'

export function RoomCameraSync() {
  const ctx = useRoomCameraDebug()
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const placement = ctx?.placement ?? ROOM_CAMERA
  const resetGeneration = ctx?.resetGeneration ?? 0

  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    const id = requestAnimationFrame(() => {
      applyRoomCamera(camera, controlsRef.current, size, placement)
    })
    return () => cancelAnimationFrame(id)
  }, [camera, size.width, size.height, placement, resetGeneration])

  useFrame(() => {
    if (!ctx?.enabled || !(camera instanceof PerspectiveCamera)) return
    const controls = controlsRef.current
    const target = controls?.target
    if (!target) return
    const distance = camera.position.distanceTo(target)
    ctx.reportLive({
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [target.x, target.y, target.z],
      fov: camera.fov,
      minDistance: controls.minDistance,
      maxDistance: controls.maxDistance,
      distance,
    })
  })

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.06}
      enablePan
      minDistance={placement.minDistance}
      maxDistance={placement.maxDistance}
      minPolarAngle={0.15}
      maxPolarAngle={Math.PI / 2 - 0.08}
      rotateSpeed={0.85}
      zoomSpeed={0.9}
    />
  )
}
