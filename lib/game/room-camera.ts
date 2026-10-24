/** Default orbit camera for the selfcon room view. */

import type { PerspectiveCamera } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

export type RoomCameraPlacement = {
  position: [number, number, number]
  target: [number, number, number]
  fov: number
  minDistance: number
  maxDistance: number
}

/** Portrait phone reference (matches approved room screenshot). */
export const ROOM_CAMERA_REFERENCE_ASPECT = 390 / 844

export const ROOM_CAMERA_DESKTOP_FOV = 40
export const ROOM_CAMERA_MOBILE_FOV = 75

export const ROOM_CAMERA: RoomCameraPlacement = {
  position: [-9.142, 8.55, 9.967],
  target: [-0.6, 0.75, 0.05],
  fov: ROOM_CAMERA_DESKTOP_FOV,
  minDistance: 4.2,
  maxDistance: 15,
}

/** Portrait uses {@link ROOM_CAMERA_MOBILE_FOV}; wide desktop uses placement FOV (default 40). */
export function roomCameraFovForAspect(viewportAspect: number, desktopFov = ROOM_CAMERA.fov) {
  if (viewportAspect <= ROOM_CAMERA_REFERENCE_ASPECT) return ROOM_CAMERA_MOBILE_FOV
  return desktopFov
}

export function applyRoomCamera(
  camera: PerspectiveCamera,
  controls: OrbitControlsImpl | null,
  viewport: { width: number; height: number },
  placement: RoomCameraPlacement = ROOM_CAMERA,
) {
  const aspect = viewport.width / Math.max(viewport.height, 1)
  camera.fov = roomCameraFovForAspect(aspect, placement.fov)
  camera.position.set(...placement.position)
  camera.updateProjectionMatrix()
  if (!controls) return
  controls.target.set(...placement.target)
  controls.minDistance = placement.minDistance
  controls.maxDistance = placement.maxDistance
  controls.update()
}
