'use client'

import { useGLTF, useTexture } from '@react-three/drei'
import { useMemo } from 'react'
import { DoubleSide, SRGBColorSpace } from 'three'

/*
 * The Ekpoma Life semi-truck: "Logistics Semi-Truck" by Nez1x75 (Sketchfab, CC BY 4.0; credit in
 * brand/cars/CREDITS.md). Its own livery is covered by our panels on both trailer sides and the roof.
 * Model frame: front (cab) at +z, wheels on y = 0 once lifted. About 14 m long.
 */

const URL = '/models/cars/truck.glb'
/** The model's lowest point sits 1.39 m below its origin. */
const LIFT = 1.39
// The trailer box in the model's own frame (measured in Blender): sides at x = 0.859 / -1.005,
// from 1.016 m to 10.873 m behind the origin, side panels from -0.631 m to 1.78 m high, roof at 1.78 m
const BOX = { right: 0.859, left: -1.005, back: -10.873, front: -1.016, bottom: -0.631, top: 1.78 }
const LEN = BOX.front - BOX.back
const MID_Z = (BOX.front + BOX.back) / 2
const SIDE_H = BOX.top - BOX.bottom
const MID_Y = (BOX.top + BOX.bottom) / 2
const WIDTH = BOX.right - BOX.left
const MID_X = (BOX.right + BOX.left) / 2

export function TruckModel() {
  const { scene } = useGLTF(URL)
  const truck = useMemo(() => scene.clone(true), [scene])
  const [side, roof] = useTexture(['/models/cars/truck-side.webp', '/models/cars/truck-roof.webp'])
  side.colorSpace = SRGBColorSpace
  roof.colorSpace = SRGBColorSpace
  side.anisotropy = 8
  roof.anisotropy = 8
  return (
    <group position={[0, LIFT, 0]}>
      <primitive object={truck} />
      {/* Right side (+x): reads front to back, the logo by the cab */}
      <mesh position={[BOX.right + 0.012, MID_Y, MID_Z]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[LEN - 0.08, SIDE_H - 0.12]} />
        <meshStandardMaterial map={side} roughness={0.5} metalness={0.05} />
      </mesh>
      {/* Left side (-x) */}
      <mesh position={[BOX.left - 0.012, MID_Y, MID_Z]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[LEN - 0.08, SIDE_H - 0.12]} />
        <meshStandardMaterial map={side} roughness={0.5} metalness={0.05} />
      </mesh>
      {/* Roof, for the drone shot from above: the name runs along the trailer */}
      <mesh position={[MID_X, BOX.top + 0.012, MID_Z]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[LEN - 0.08, WIDTH - 0.06]} />
        <meshStandardMaterial map={roof} roughness={0.6} side={DoubleSide} />
      </mesh>
    </group>
  )
}

useGLTF.preload(URL)
