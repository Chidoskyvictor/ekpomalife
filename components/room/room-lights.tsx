'use client'

import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  Color,
  type AmbientLight,
  type DirectionalLight,
  type HemisphereLight,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  type PointLight,
} from 'three'
import type { RoomLayout } from '@/lib/game/room-layouts'
import { roomLightAt, type RoomLight } from '@/lib/game/room-lighting'

/** Bulb / tube materials in the home GLBs that glow when the lamps are on. */
const GLOWING = new Set(['LampBulb', 'HostelTube'])
const LAMP_COLOR = '#ffd9a0'

type Live = Omit<RoomLight, 'skyTop' | 'skyBottom' | 'skyOpacity'>

/**
 * Sun, sky light and the room's own lamps for the time of day. Mounted inside the home's
 * offset group, so positions are the GLB's own. Values ease toward the clock every frame,
 * so a jump in game time (a server refresh) fades instead of snapping.
 */
export function RoomLights({ layout, root, clock }: { layout: RoomLayout; root: Object3D; clock: () => number }) {
  const sun = useRef<DirectionalLight>(null)
  const ambient = useRef<AmbientLight>(null)
  const hemi = useRef<HemisphereLight>(null)
  const lamps = useRef<(PointLight | null)[]>([])
  const live = useRef<Live | null>(null)
  const bulbs = useRef<MeshStandardMaterial[]>([])

  // Warm ceiling lights spread along each floor area (at most four per home, for phones)
  const lampSpots = useMemo(() => {
    const spots: { position: [number, number, number]; reach: number }[] = []
    for (const [x0, z0, x1, z1] of layout.floors) {
      const w = x1 - x0
      const d = z1 - z0
      const count = Math.min(2, Math.max(1, Math.round(Math.max(w, d) / 6)))
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count
        const x = w >= d ? x0 + w * t : (x0 + x1) / 2
        const z = w >= d ? (z0 + z1) / 2 : z0 + d * t
        spots.push({ position: [x, 2.6, z], reach: Math.max(w, d / count, w / count, d) * 1.1 })
      }
    }
    return spots.slice(0, 4)
  }, [layout])
  const centre = useMemo(() => {
    const xs = layout.floors.flatMap(([x0, , x1]) => [x0, x1])
    const zs = layout.floors.flatMap(([, z0, , z1]) => [z0, z1])
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2]
  }, [layout])

  // Bulbs get their own material copies so they can glow (the GLB's shared ones stay as they are)
  useLayoutEffect(() => {
    const swapped: [Mesh, Material][] = []
    root.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh || Array.isArray(mesh.material) || !GLOWING.has(mesh.material.name)) return
      const glow = mesh.material.clone() as MeshStandardMaterial
      glow.emissive = new Color(LAMP_COLOR)
      swapped.push([mesh, mesh.material])
      mesh.material = glow
      bulbs.current.push(glow)
    })
    return () => {
      for (const [mesh, original] of swapped) {
        ;(mesh.material as Material).dispose()
        mesh.material = original
      }
      bulbs.current = []
    }
  }, [root])

  useFrame((_, delta) => {
    const target = roomLightAt(clock())
    const k = live.current ? Math.min(1, delta * 1.5) : 1
    const cur = (live.current ??= { ...target })
    const ease = (a: number, b: number) => a + (b - a) * k
    for (const key of ['sunIntensity', 'sunElevation', 'sunAzimuth', 'ambientIntensity', 'hemiIntensity', 'lamps'] as const) {
      cur[key] = ease(cur[key], target[key])
    }
    for (const key of ['sun', 'ambient', 'hemiSky', 'hemiGround'] as const) {
      cur[key] = '#' + new Color(cur[key]).lerp(new Color(target[key]), k).getHexString()
    }

    if (sun.current) {
      const el = (cur.sunElevation * Math.PI) / 180
      const az = (cur.sunAzimuth * Math.PI) / 180
      sun.current.position.set(
        centre[0] + Math.cos(el) * Math.sin(az) * 15,
        Math.sin(el) * 15,
        centre[1] + Math.cos(el) * Math.cos(az) * 15,
      )
      sun.current.target.position.set(centre[0], 0, centre[1])
      sun.current.target.updateMatrixWorld()
      sun.current.color.set(cur.sun)
      sun.current.intensity = cur.sunIntensity
    }
    if (ambient.current) {
      ambient.current.color.set(cur.ambient)
      ambient.current.intensity = cur.ambientIntensity
    }
    if (hemi.current) {
      hemi.current.color.set(cur.hemiSky)
      hemi.current.groundColor.set(cur.hemiGround)
      hemi.current.intensity = cur.hemiIntensity
    }
    for (const lamp of lamps.current) {
      if (!lamp) continue
      lamp.intensity = cur.lamps * 7
      lamp.visible = cur.lamps > 0.02
    }
    for (const bulb of bulbs.current) bulb.emissiveIntensity = 0.15 + cur.lamps * 2.4
  })

  return (
    <>
      <ambientLight ref={ambient} />
      <hemisphereLight ref={hemi} />
      <directionalLight ref={sun} />
      {lampSpots.map((spot, i) => (
        <pointLight
          key={i}
          ref={(light) => {
            lamps.current[i] = light
          }}
          position={spot.position}
          color={LAMP_COLOR}
          distance={spot.reach}
          decay={1}
          intensity={0}
        />
      ))}
    </>
  )
}
