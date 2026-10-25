'use client'

import { useGLTF } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { Suspense, useLayoutEffect, useMemo } from 'react'
import { Box3, Vector3, type Material, type Mesh, type Object3D } from 'three'
import { applyGlbTextureAnisotropy } from '@/components/world/glb-textures'
import { useLowPerf } from '@/hooks/use-low-perf'
import { shadeOf } from '@/lib/game/house-paint'
import type { Appearance } from '@/lib/game/look'
import { paintOf, releasePaint } from '@/lib/game/paint-material'
import type { FurnitureId } from '@/lib/game/room-furniture'
import { scaledRoomCamera } from '@/lib/game/room-camera'
import { ROOM_LAYOUTS, type RoomLayout } from '@/lib/game/room-layouts'
import { RoomCameraSync } from './room-camera-sync'
import { CharacterFigure } from '@/components/look/character-figure'
import { RoomLights } from './room-lights'
import { RoomPlayer, type RoomPlayerControl } from './room-player'

/** Footprint scale for the thin wide lawn discs in the home GLBs (1 = Blender size). */
const LAWN_SCALE_XZ = 0.76

type PlayerProps = {
  layout: RoomLayout
  /** Wall paint (#rrggbb) of whoever lives here; the GLB's own colours when unset. */
  paint?: string
  /** Current game time in minutes, read every frame for the day/night lighting (midday when unset). */
  clock?: () => number
  appearance?: Appearance
  /** Visiting: the owner's look, standing in their room. */
  host?: Appearance
  onFurniture?: (id: FurnitureId) => void
  control?: RoomPlayerControl
}
import { useRoomCameraDebug } from './room-camera-debug-context'

function centerOnGround(scene: Object3D) {
  const box = new Box3().setFromObject(scene)
  const center = box.getCenter(new Vector3())
  const floor = box.min.y
  scene.position.x -= center.x
  scene.position.z -= center.z
  scene.position.y -= floor
}

function shadeMeshes(root: Object3D) {
  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
  })
}

function shrinkRoundSlabPads(root: Object3D) {
  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    // Only the round lawn discs — the bigger homes' tile floors and pavers are big flat meshes too
    if (!mesh.name.startsWith('Grass')) return
    const box = new Box3().setFromObject(mesh)
    const size = box.getSize(new Vector3())
    const thinPad = size.y <= 0.35 && size.x >= 8 && size.z >= 8
    if (!thinPad) return
    mesh.scale.x *= LAWN_SCALE_XZ
    mesh.scale.z *= LAWN_SCALE_XZ
  })
}

/** Wall materials in the home GLBs → which paint they take (right-hand wall full, the rest a shade darker). */
const WALL_PAINT: Record<string, (hex: string) => string> = {
  'Wall.001': (hex) => hex,
  Wall: (hex) => shadeOf(hex),
  Partition: (hex) => shadeOf(hex),
}

/** Swap the walls of a cloned home onto painted copies; undo (and release them) on cleanup. */
function usePaintedWalls(root: Object3D, paint: string | undefined) {
  useLayoutEffect(() => {
    if (!paint) return
    const swapped: [Mesh, Material][] = []
    root.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh || Array.isArray(mesh.material)) return
      const tone = WALL_PAINT[mesh.material.name]
      if (!tone) return
      swapped.push([mesh, mesh.material])
      mesh.material = paintOf(mesh.material, tone(paint))
    })
    return () => {
      for (const [mesh, original] of swapped) {
        releasePaint(mesh.material as Material)
        mesh.material = original
      }
    }
  }, [root, paint])
}

const MIDDAY = () => 12 * 60

function HomeModel({ layout, paint, clock = MIDDAY, appearance, host, onFurniture, control }: PlayerProps) {
  const gl = useThree((state) => state.gl)
  const { scene } = useGLTF(layout.glb)
  useLayoutEffect(() => {
    applyGlbTextureAnisotropy(scene, gl)
  }, [scene, gl])

  const prepared = useMemo(() => {
    const clone = scene.clone(true)
    centerOnGround(clone)
    shrinkRoundSlabPads(clone)
    shadeMeshes(clone)
    return clone
  }, [scene])
  usePaintedWalls(prepared, paint)

  return (
    <>
      <primitive object={prepared} />
      {/* Same offset as the model, so the player walks in the GLB's own floor coordinates */}
      <group position={[prepared.position.x, prepared.position.y, prepared.position.z]}>
        <RoomLights layout={layout} root={prepared} clock={clock} />
        <RoomPlayer key={layout.id} layout={layout} appearance={appearance} onFurniture={onFurniture} control={control} />
        {host ? (
          // The host waits inside, facing the visitor
          <group position={layout.host.position} rotation={[0, layout.host.rotation, 0]}>
            <CharacterFigure appearance={host} />
          </group>
        ) : null}
      </group>
    </>
  )
}

/** Your home (single room, self-con or one bedroom) with your character in it. */
export function HomeCanvas(props: PlayerProps) {
  const lowPerf = useLowPerf()
  const debug = useRoomCameraDebug()
  const cam = debug?.hasOverride ? debug.placement : scaledRoomCamera(props.layout.cameraScale, props.layout.view)

  return (
    <Canvas
      dpr={lowPerf ? [1, 1.35] : [1, 1.85]}
      camera={{
        position: cam.position,
        fov: cam.fov,
        near: 0.05,
        far: 120,
      }}
      gl={{ antialias: !lowPerf, powerPreference: 'high-performance', alpha: true }}
      style={{ width: '100%', height: '100%', touchAction: 'none' }}
      onCreated={({ gl }) => {
        // See-through: the page's own background (--app-wash) shows behind the house
        gl.setClearColor('#000000', 0)
      }}
    >
      <Suspense fallback={null}>
        <HomeModel {...props} />
      </Suspense>
      <RoomCameraSync scale={props.layout.cameraScale} view={props.layout.view} />
    </Canvas>
  )
}

for (const layout of Object.values(ROOM_LAYOUTS)) useGLTF.preload(layout.glb)
