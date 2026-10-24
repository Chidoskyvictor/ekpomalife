'use client'

import { useGLTF } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { Suspense, useLayoutEffect, useMemo } from 'react'
import { Box3, Vector3, type Mesh, type Object3D } from 'three'
import { applyGlbTextureAnisotropy } from '@/components/world/glb-textures'
import { useLowPerf } from '@/hooks/use-low-perf'
import type { Appearance } from '@/lib/game/look'
import type { FurnitureId } from '@/lib/game/room-furniture'
import { ROOM_CAMERA } from '@/lib/game/room-camera'
import { SELFCON_GLB_URL, SELFCON_SLAB_PAD_SCALE_XZ } from '@/lib/game/selfcon-model'
import { RoomCameraSync } from './room-camera-sync'
import { CharacterFigure } from '@/components/look/character-figure'
import { RoomPlayer, type RoomPlayerControl } from './room-player'

type PlayerProps = {
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
    const box = new Box3().setFromObject(mesh)
    const size = box.getSize(new Vector3())
    const thinPad = size.y <= 0.35 && size.x >= 8 && size.z >= 8
    if (!thinPad) return
    mesh.scale.x *= SELFCON_SLAB_PAD_SCALE_XZ
    mesh.scale.z *= SELFCON_SLAB_PAD_SCALE_XZ
  })
}

function SelfconModel({ appearance, host, onFurniture, control }: PlayerProps) {
  const gl = useThree((state) => state.gl)
  const { scene } = useGLTF(SELFCON_GLB_URL)
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

  return (
    <>
      <primitive object={prepared} />
      {/* Same offset as the model, so the player walks in the GLB's own floor coordinates */}
      <group position={[prepared.position.x, prepared.position.y, prepared.position.z]}>
        <RoomPlayer appearance={appearance} onFurniture={onFurniture} control={control} />
        {host ? (
          // The host waits by the table, facing the door side of the room
          <group position={[-0.6, 0, -1.4]} rotation={[0, Math.PI / 5, 0]}>
            <CharacterFigure appearance={host} />
          </group>
        ) : null}
      </group>
    </>
  )
}

function SelfconRoomCanvasInner(props: PlayerProps) {
  const lowPerf = useLowPerf()
  const debug = useRoomCameraDebug()
  const cam = debug?.placement ?? ROOM_CAMERA

  return (
    <Canvas
      dpr={lowPerf ? [1, 1.35] : [1, 1.85]}
      camera={{
        position: cam.position,
        fov: cam.fov,
        near: 0.05,
        far: 120,
      }}
      gl={{ antialias: !lowPerf, powerPreference: 'high-performance' }}
      style={{ width: '100%', height: '100%', touchAction: 'none' }}
      onCreated={({ gl }) => {
        gl.setClearColor('#eef3f8', 1)
      }}
    >
      <ambientLight intensity={0.75} />
      <hemisphereLight args={['#ffffff', '#c5c0b6', 0.5]} />
      <directionalLight position={[6, 10, 5]} intensity={1.05} />
      <Suspense fallback={null}>
        <SelfconModel {...props} />
      </Suspense>
      <RoomCameraSync />
    </Canvas>
  )
}

export function SelfconRoomCanvas(props: PlayerProps) {
  return <SelfconRoomCanvasInner {...props} />
}

useGLTF.preload(SELFCON_GLB_URL)
