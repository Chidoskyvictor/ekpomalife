'use client'

import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { PerspectiveCamera } from 'three'
import { applyRoomCamera, roomCameraTurnLimits, scaledRoomCamera, type RoomView } from '@/lib/game/room-camera'

/** `scale` pulls the camera back for bigger homes. */
export function RoomCameraSync({ scale = 1, view = 'corner' }: { scale?: number; view?: RoomView }) {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const placement = useMemo(() => scaledRoomCamera(scale, view), [scale, view])
  // Keep the camera on the open side of the house
  const limits = roomCameraTurnLimits(placement, view)

  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    const id = requestAnimationFrame(() => {
      applyRoomCamera(camera, controlsRef.current, size, placement)
    })
    return () => cancelAnimationFrame(id)
  }, [camera, size.width, size.height, placement])

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
      maxPolarAngle={limits.maxPolar}
      minAzimuthAngle={limits.minAzimuth}
      maxAzimuthAngle={limits.maxAzimuth}
      rotateSpeed={0.85}
      zoomSpeed={0.9}
    />
  )
}
