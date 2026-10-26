'use client'

import { useGLTF } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useLayoutEffect, useMemo, type ReactNode } from 'react'
import { Box3, Vector3, type Material, type Mesh, type Object3D } from 'three'
import { applyGlbTextureAnisotropy } from '@/components/world/glb-textures'
import { useLowPerf } from '@/hooks/use-low-perf'
import { shadeOf } from '@/lib/game/house-paint'
import type { Appearance } from '@/lib/game/look'
import { paintOf, releasePaint } from '@/lib/game/paint-material'
import type { SpotKey } from '@/lib/game/room-layouts'
import { scaledRoomCamera } from '@/lib/game/room-camera'
import type { RoomLayout } from '@/lib/game/room-layouts'
import { StreetScene, type StreetProps } from '@/components/home/street-scene'
import { RoomCameraSync } from './room-camera-sync'
import { CharacterFigure } from '@/components/look/character-figure'
import { RoomLights } from './room-lights'
import { RoomPlayer, type PlayerMove, type RoomPlayerControl } from './room-player'
import { BuyLayer, PlacedPieces, type HomeFurnishing } from './placed-furniture'
import { useBuyUi } from '@/lib/game/home-buy-store'

/** Footprint scale for the thin wide lawn discs in the home GLBs (1 = Blender size). */
const LAWN_SCALE_XZ = 0.76

type PlayerProps = {
  layout: RoomLayout
  /** Wall paint (#rrggbb) of whoever lives here; the GLB's own colours when unset. */
  paint?: string
  /** Current game time in minutes, read every frame for the day/night lighting (midday when unset). */
  clock?: () => number
  /** Extra scene pieces in the model's own coordinates (e.g. a club's lights and screens). */
  effects?: (root: Object3D) => ReactNode
  /** Your character's position and pose every frame. */
  onPlayerMove?: (move: PlayerMove) => void
  appearance?: Appearance
  /** Visiting: the owner's look, standing in their room. */
  host?: Appearance
  onFurniture?: (id: SpotKey) => void
  /** What the player bought and placed in this home (drawn, blocks walking, and Buy mode edits it). */
  furnishing?: HomeFurnishing | null
  control?: RoomPlayerControl
  /** Start the character here (e.g. just inside the door when coming in from the street). */
  spawn?: [number, number]
}

type CanvasProps = PlayerProps & {
  /** Outside on your street instead of in the home (same canvas, so switching is quick). */
  street?: StreetProps | null
  /** The scene (inside or the street) has loaded and drawn its first frame. */
  onReady?: () => void
  /** Changes on every inside ↔ outside switch, so the scene and player start fresh. */
  visit?: number
}

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

function HomeModel({ layout, paint, clock = MIDDAY, effects, onPlayerMove, appearance, host, onFurniture, control, spawn, furnishing }: PlayerProps) {
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
        {effects?.(prepared)}
        {furnishing ? <PlacedPieces furnishing={furnishing} /> : null}
        {furnishing ? <BuyLayer furnishing={furnishing} /> : null}
        <RoomPlayer
          key={layout.id}
          layout={layout}
          appearance={appearance}
          onFurniture={onFurniture}
          control={control}
          onMove={onPlayerMove}
          spawn={spawn}
        />
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

/** Mounted inside the scene's Suspense: runs once everything above it has loaded. */
function SceneReady({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    if (!onReady) return
    // Two frames: the first draw of the new scene has reached the screen
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => onReady())
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [onReady])
  return null
}

/**
 * Your home (single room, self-con or one bedroom) with your character in it, or the street
 * outside it. Only one is mounted at a time: the one you leave is torn down (its street
 * meshes disposed); the home's GLB stays cached so going back in is instant.
 */
export function HomeCanvas({ street, onReady, visit = 0, ...props }: CanvasProps) {
  const lowPerf = useLowPerf()
  const cam = scaledRoomCamera(props.layout.cameraScale, props.layout.view)
  const { turn, active: buying } = useBuyUi()

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
        {street ? <StreetScene key={`street-${visit}`} {...street} /> : <HomeModel key={`${props.layout.id}-${visit}`} {...props} />}
        <SceneReady key={`ready-${street ? 'street' : props.layout.id}-${visit}`} onReady={onReady} />
      </Suspense>
      {street ? null : <RoomCameraSync scale={props.layout.cameraScale} view={props.layout.view} turn={turn} topDown={buying} />}
    </Canvas>
  )
}

/** Fetch and parse a home in the background (only the one you'll see, not every home). */
export function preloadHome(layout: RoomLayout) {
  useGLTF.preload(layout.glb)
}

/** Drop a home's GLB from memory once you've left it for good (e.g. off to the map). */
export function releaseHome(layout: RoomLayout) {
  useGLTF.clear(layout.glb)
}
