/** Default orbit camera for the room view (each home is centred on the origin). */

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

/**
 * Which way the camera looks in. `corner`: from the front-left (single room, self-con and
 * one bedroom: low front and left walls). `front`: straight in through the open front (the
 * hostel, which has full walls on the other three sides).
 */
export type RoomView = 'corner' | 'front'

export const ROOM_CAMERA_FRONT: RoomCameraPlacement = {
  ...ROOM_CAMERA,
  position: [-1.4, 8.55, 13.3],
  target: [0, 0.75, 0.3],
}

/** The default camera for a view, pulled back along its view line for bigger homes. */
export function scaledRoomCamera(scale: number, view: RoomView = 'corner'): RoomCameraPlacement {
  const base = view === 'front' ? ROOM_CAMERA_FRONT : ROOM_CAMERA
  if (scale === 1) return base
  const [px, py, pz] = base.position
  const [tx, ty, tz] = base.target
  return {
    ...base,
    position: [tx + (px - tx) * scale, ty + (py - ty) * scale, tz + (pz - tz) * scale],
    maxDistance: ROOM_CAMERA.maxDistance * scale,
  }
}

/**
 * How far players may swing the camera, so they can't end up behind a full wall:
 * up to 55° either side of the corner view (low front and left walls), 15° either side of
 * the front view (full side walls), and never down to eye level.
 */
export function roomCameraTurnLimits(placement: RoomCameraPlacement, view: RoomView) {
  const [px, , pz] = placement.position
  const [tx, , tz] = placement.target
  const centre = Math.atan2(px - tx, pz - tz)
  const swing = ((view === 'front' ? 15 : 55) * Math.PI) / 180
  return { minAzimuth: centre - swing, maxAzimuth: centre + swing, maxPolar: 1.25 }
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
