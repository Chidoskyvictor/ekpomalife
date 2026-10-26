'use client'

import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { PerspectiveCamera } from 'three'
import { applyRoomCamera, roomCameraTurnLimits, scaledRoomCamera, type RoomView } from '@/lib/game/room-camera'

/** How far from straight-down Buy mode's camera sits (radians). */
const TOP_DOWN_POLAR = 0.45
/**
 * Buy mode keeps the whole house in the part of the screen the shop leaves free: above the bottom
 * sheet on phones, left of the side panel on wide screens. Sizes mirror buy-panel.module.css.
 */
const SHEET_FRACTION = 0.56
const SHEET_MAX = 520
const SIDE_PANEL = 392
const SIDE_MIN_WIDTH = 900
const TOP_PAD = 54
/** Zoom that fits the house in a 360 × 326 free area (a 360 × 740 phone with the sheet up). */
const FIT_ZOOM = 0.56

/** Zoom and picture shift that put the house in the free area of a `width × height` screen. */
function buyFraming(width: number, height: number) {
  const side = width >= SIDE_MIN_WIDTH
  const sheet = Math.min(height * SHEET_FRACTION, SHEET_MAX)
  const freeW = side ? width - SIDE_PANEL : width
  const freeH = side ? height : height - sheet
  const zoom = Math.min(1.3, Math.max(0.3, FIT_ZOOM * Math.min(freeW / 360, freeH / 326)))
  return {
    zoom,
    // setViewOffset moves the picture by moving the window: +x slides it left, +y slides it up
    x: side ? Math.round(SIDE_PANEL / 2) : 0,
    y: side ? 0 : Math.round(height / 2 - (freeH + TOP_PAD) / 2),
  }
}

/** `scale` pulls the camera back for bigger homes. */
export function RoomCameraSync({ scale = 1, view = 'corner', turn = 0, topDown = false }: { scale?: number; view?: RoomView; turn?: number; topDown?: boolean }) {
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
    if (!(camera instanceof PerspectiveCamera)) return
    if (topDown) {
      // Start looking down on the room; you can still turn, tilt, pan and zoom as usual
      controls.setPolarAngle(TOP_DOWN_POLAR)
      // Zoom out a little and slide the picture up, so the whole house sits above the catalogue sheet
      const frame = buyFraming(size.width, size.height)
      camera.zoom = frame.zoom
      camera.setViewOffset(size.width, size.height, frame.x, frame.y, size.width, size.height)
      camera.updateProjectionMatrix()
      controls.update()
    } else {
      camera.zoom = 1
      camera.clearViewOffset()
      applyRoomCamera(camera, controls, size, placement)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topDown, size.width, size.height])

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
