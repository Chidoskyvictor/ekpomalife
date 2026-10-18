'use client'

import { MapControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useRef, useState } from 'react'
import { NoToneMapping, Vector3 } from 'three'
import { getPlace, getPlaceByZone } from '@/lib/game/places'
import { MAP } from '@/lib/game/map-theme'
import { FIRST_SLAB, LAND_CENTER, MAP_ZONES, WORLD } from '@/lib/game/world-layout'
import { useGame } from '@/hooks/use-game'
import { MapLoadOverlay, useMapLoadProgress } from './map-load-overlay'
import { MapLoadReporter } from './map-load-reporter'
import { PlayerAvatar } from './player-avatar'
import { WorldGround } from './world-ground'
import { WorldKenney } from './world-kenney'
import { WorldRoads } from './world-roads'
import { WorldTrees } from './world-trees'
import { WorldZones } from './world-zones'

const PITCH = (32 * Math.PI) / 180
const HEADING = 0
const DISTANCE = 145
const MIN_PITCH = (22 * Math.PI) / 180
const MAX_PITCH = (50 * Math.PI) / 180
const TARGET_PAD = 10

const CAMERA_OFFSET = new Vector3(
  DISTANCE * Math.sin(PITCH) * Math.sin(HEADING),
  DISTANCE * Math.cos(PITCH),
  DISTANCE * Math.sin(PITCH) * Math.cos(HEADING),
)

type PanControls = { target: Vector3; update: () => void }

function CameraRig({ focusId }: { focusId: string | null }) {
  const controls = useThree((state) => state.controls) as unknown as PanControls | null
  const camera = useThree((state) => state.camera)
  const goal = useRef<Vector3 | null>(null)

  useEffect(() => {
    if (!focusId) {
      goal.current = null
      return
    }
    const place = getPlace(focusId) ?? getPlaceByZone(focusId)
    const zone = MAP_ZONES.find((entry) => entry.id === (place?.zoneId ?? focusId))
    goal.current = zone ? new Vector3(zone.position[0], 0, zone.position[1] + 4) : null
  }, [focusId])

  useFrame((_, delta) => {
    if (!controls) return
    if (goal.current) {
      const step = Math.min(1, delta * 3)
      const move = goal.current.clone().sub(controls.target).multiplyScalar(step)
      controls.target.add(move)
      camera.position.add(move)
      if (controls.target.distanceTo(goal.current) < 0.05) goal.current = null
    }
    const minX = WORLD.x - WORLD.w / 2 + TARGET_PAD
    const maxX = WORLD.x + WORLD.w / 2 - TARGET_PAD
    const minZ = WORLD.z - WORLD.d / 2 + TARGET_PAD
    const maxZ = WORLD.z + WORLD.d / 2 - TARGET_PAD
    const x = Math.min(maxX, Math.max(minX, controls.target.x))
    const z = Math.min(maxZ, Math.max(minZ, controls.target.z))
    if (x !== controls.target.x || z !== controls.target.z) {
      camera.position.x += x - controls.target.x
      camera.position.z += z - controls.target.z
      controls.target.x = x
      controls.target.z = z
    }
    controls.target.y = 0
    controls.update()
  })

  return null
}

export function WorldCanvas() {
  const { state, selectedId, select } = useGame()
  const night = state?.period === 'evening' || state?.period === 'night'
  const { targetPercent, assetsDone, onProgress } = useMapLoadProgress()
  const [mobile, setMobile] = useState(
    () => window.matchMedia('(max-width: 767px), (pointer: coarse)').matches,
  )

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px), (pointer: coarse)')
    const sync = () => setMobile(query.matches)
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  const ambient = night ? 0.18 : 0.55
  const hemi = night ? (mobile ? 0.4 : 0.32) : mobile ? 1.15 : 1
  const sun = night ? (mobile ? 0.38 : 0.3) : mobile ? 1.35 : 1.2
  const fill = night ? 0.08 : 0.28
  const water = night ? '#2a4f66' : MAP.water

  return (
    <div
      className="absolute inset-0"
      style={{ background: water }}
      aria-label="Interactive map of Ekpoma"
      role="application"
    >
      <MapLoadOverlay targetPercent={targetPercent} assetsDone={assetsDone} />
      <Canvas
        shadows={!mobile}
        dpr={mobile ? [1, 1] : [1, 1.75]}
        gl={{
          antialias: !mobile,
          powerPreference: mobile ? 'low-power' : 'high-performance',
          failIfMajorPerformanceCaveat: false,
          toneMapping: NoToneMapping,
          toneMappingExposure: night ? 0.72 : 1,
        }}
        camera={{
          position: [LAND_CENTER.x + CAMERA_OFFSET.x, CAMERA_OFFSET.y, LAND_CENTER.z + CAMERA_OFFSET.z],
          fov: 42,
          near: 0.5,
          far: 420,
        }}
        onCreated={({ gl }) => {
          // Avoid a black clear-color flash before the water color attaches.
          gl.setClearColor(water, 1)
        }}
        onPointerMissed={() => select(null)}
      >
        <MapLoadReporter onProgress={onProgress} />
        <color attach="background" args={[water]} />
        <ambientLight intensity={ambient} />
        <hemisphereLight args={[night ? '#C9D7E8' : '#FFFFFF', MAP.land, hemi]} />
        <directionalLight
          position={[40, 70, 22]}
          intensity={sun}
          color={night ? '#B8C9E0' : '#FFFFFF'}
          castShadow={!mobile}
          shadow-mapSize={mobile ? [512, 512] : [2048, 2048]}
          shadow-camera-left={-140}
          shadow-camera-right={140}
          shadow-camera-top={140}
          shadow-camera-bottom={-140}
          shadow-bias={-0.0004}
          shadow-intensity={0.28}
        />
        <directionalLight position={[-28, 36, -18]} intensity={fill} color="#F2FBFF" />
        <WorldGround />
        <WorldRoads />
        <WorldTrees mobile={mobile} />
        <WorldZones />
        <Suspense fallback={null}>
          <WorldKenney />
        </Suspense>
        <Suspense fallback={null}>
          {state ? <PlayerAvatar locationId={state.locationId} color={state.avatarColor} appearance={state.appearance} /> : null}
        </Suspense>
        <MapControls
          makeDefault
          enableRotate
          screenSpacePanning
          minPolarAngle={MIN_PITCH}
          maxPolarAngle={MAX_PITCH}
          minDistance={60}
          maxDistance={220}
          zoomSpeed={0.7}
          rotateSpeed={0.45}
          target={[FIRST_SLAB.x, 0, FIRST_SLAB.z]}
        />
        <CameraRig focusId={selectedId} />
      </Canvas>
    </div>
  )
}
