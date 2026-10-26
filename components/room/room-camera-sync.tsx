'use client'

import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { PerspectiveCamera } from 'three'
import { applyRoomCamera, roomCameraTurnLimits, scaledRoomCamera, type RoomView } from '@/lib/game/room-camera'

/** How far from straight-down Buy mode's camera sits (radians). */
const TOP_DOWN_POLAR = 0.45

/** `scale` pulls the camera back for bigger homes. */
export function RoomCameraSync({ scale = 1, view = 'corner', turn = 0, locked = false, topDown = false }: { scale?: number; view?: RoomView; turn?: number; locked?: boolean; topDown?: boolean }) {
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

  // Buy mode looks down on the room (nearly top-down); leaving it restores the usual angle
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    if (topDown) {
      controls.minPolarAngle = controls.maxPolarAngle = TOP_DOWN_POLAR
      controls.setPolarAngle(TOP_DOWN_POLAR)
      controls.update()
    } else if (camera instanceof PerspectiveCamera) {
      controls.minPolarAngle = 0.15
      controls.maxPolarAngle = limits.maxPolar
      applyRoomCamera(camera, controls, size, placement)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topDown])

  // Buy mode's "Turn room": 0 = default, 1 = swing to one side, 2 = the other (inside the allowed swing)
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    const offset = turn === 1 ? limits.maxAzimuth : turn === 2 ? limits.minAzimuth : (limits.maxAzimuth + limits.minAzimuth) / 2
    controls.setAzimuthalAngle(offset)
    controls.update()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn])

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      // Dragging a Buy-mode ghost must not also swing the camera
      enabled={!locked}
      enableDamping
      dampingFactor={0.06}
      enablePan
      minDistance={placement.minDistance}
      maxDistance={placement.maxDistance}
      minPolarAngle={topDown ? TOP_DOWN_POLAR : 0.15}
      maxPolarAngle={topDown ? TOP_DOWN_POLAR : limits.maxPolar}
      minAzimuthAngle={limits.minAzimuth}
      maxAzimuthAngle={limits.maxAzimuth}
      rotateSpeed={0.85}
      zoomSpeed={0.9}
    />
  )
}
