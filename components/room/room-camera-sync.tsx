'use client'

import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { PerspectiveCamera } from 'three'
import { applyRoomCamera, roomCameraTurnLimits, scaledRoomCamera, type RoomView } from '@/lib/game/room-camera'
import { useRoomCameraDebug } from './room-camera-debug-context'

/** `scale` pulls the camera back for bigger homes (ignored once the camera debug panel has an override). */
export function RoomCameraSync({ scale = 1, view = 'corner' }: { scale?: number; view?: RoomView }) {
  const ctx = useRoomCameraDebug()
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const debugPlacement = ctx?.hasOverride ? ctx.placement : null
  const placement = useMemo(
    () => debugPlacement ?? scaledRoomCamera(scale, view),
    [debugPlacement, scale, view],
  )
  const resetGeneration = ctx?.resetGeneration ?? 0
  // Keep the camera on the open side of the house; free while tuning in the debug panel
  const limits = debugPlacement ? null : roomCameraTurnLimits(placement, view)

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
      maxPolarAngle={limits?.maxPolar ?? Math.PI / 2 - 0.08}
      minAzimuthAngle={limits?.minAzimuth ?? -Infinity}
      maxAzimuthAngle={limits?.maxAzimuth ?? Infinity}
      rotateSpeed={0.85}
      zoomSpeed={0.9}
    />
  )
}
