'use client'

import { MapControls, PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { NoToneMapping, Vector3 } from 'three'
import { getPlace, getPlaceByZone } from '@/lib/game/places'
import { mapPalette as MAP } from '@/lib/game/map-theme'
import { FIRST_SLAB, LAND_CENTER, MAP_ZONES, WORLD } from '@/lib/game/world-layout'
import { useGame } from '@/hooks/use-game'
import { MapLoadOverlay, useMapLoadProgress } from './map-load-overlay'
import { MapLoadReporter } from './map-load-reporter'
import { PlayerAvatar } from './player-avatar'
import { WorldGround } from './world-ground'
import { WorldRoads } from './world-roads'
import { WorldScenery } from './world-scenery'
import { WorldBase } from './world-base'
import { WorldTrees } from './world-trees'
import { ExtSlabHostels } from './ext-slab-hostels'
import { WorldZones } from './world-zones'
import { WorldZoneDebugPanel } from './world-zone-debug-panel'
import { BillboardDebugPanel } from './billboard-debug-panel'
import { ZoneStickerOverlay, ZoneStickerProjector, ZoneStickerProvider } from './world-zone-stickers'
import { ZoneDebugProvider } from './zone-debug-context'
import { useWatClock } from '@/lib/game/wat-clock'
import { markSceneReady } from '@/lib/game/trip'

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

/** Light rig per game period — afternoon is the original tuned daylight. */
const SKY: Record<string, {
  ambient: number
  hemi: number
  hemiSky: string
  sun: number
  sunColor: string
  sunPos: [number, number, number]
  fill: number
  ground: string
}> = {
  morning: {
    ambient: 0.5,
    hemi: 0.95,
    hemiSky: '#E4EEFF',
    sun: 1.1,
    sunColor: '#FFEBCC',
    sunPos: [-60, 55, 30],
    fill: 0.26,
    ground: 'rgb(98, 172, 204)',
  },
  afternoon: {
    ambient: 0.55,
    hemi: 1,
    hemiSky: '#FFFFFF',
    sun: 1.2,
    sunColor: '#FFFFFF',
    sunPos: [40, 70, 22],
    fill: 0.28,
    ground: MAP.ground,
  },
  evening: {
    ambient: 0.34,
    hemi: 0.62,
    hemiSky: '#FFD2B0',
    sun: 0.95,
    sunColor: '#FFB070',
    sunPos: [75, 28, 18],
    fill: 0.14,
    ground: 'rgb(72, 128, 168)',
  },
  night: {
    ambient: 0.18,
    hemi: 0.34,
    hemiSky: '#C9D7E8',
    sun: 0.3,
    sunColor: '#B8C9E0',
    sunPos: [40, 70, 22],
    fill: 0.08,
    ground: '#2a4f66',
  },
}

function mobileDprCap() {
  return Math.min(2, window.devicePixelRatio || 1)
}

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

function MobileDprMonitor({
  onDecline,
  onIncline,
}: {
  onDecline: () => void
  onIncline: () => void
}) {
  return <PerformanceMonitor onDecline={onDecline} onIncline={onIncline} />
}

export function WorldCanvas() {
  const { state, selectedId, select } = useGame()
  // Real WAT time of day for everyone (dev: ?time=21:30 previews another hour)
  const { period } = useWatClock()
  const night = period === 'evening' || period === 'night'
  const { targetPercent, assetsDone, onProgress } = useMapLoadProgress()
  // A trip to a campus place waits for the map to finish loading
  useEffect(() => {
    if (!assetsDone) return
    markSceneReady('map')
    return () => markSceneReady('map', false)
  }, [assetsDone])
  const [mobile, setMobile] = useState(
    () => window.matchMedia('(max-width: 767px), (pointer: coarse)').matches,
  )
  const [mobileDpr, setMobileDpr] = useState(() =>
    typeof window !== 'undefined' ? mobileDprCap() : 2,
  )

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px), (pointer: coarse)')
    const sync = () => setMobile(query.matches)
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (mobile) setMobileDpr(mobileDprCap())
  }, [mobile])

  const onMobileDprDecline = useCallback(() => {
    setMobileDpr((current) => (current > 1.5 ? 1.5 : 1.25))
  }, [])

  const onMobileDprIncline = useCallback(() => {
    setMobileDpr((current) => {
      const cap = mobileDprCap()
      if (current < 1.5) return 1.5
      if (current < cap) return cap
      return current
    })
  }, [])

  const sky = SKY[period] ?? SKY.afternoon
  const ambient = sky.ambient
  const hemi = sky.hemi * (mobile ? 1.15 : 1)
  const sun = sky.sun * (mobile ? 1.12 : 1)
  const fill = sky.fill
  const ground = sky.ground

  return (
    <ZoneDebugProvider>
    <ZoneStickerProvider>
    <div
      className="absolute inset-0 isolate z-0"
      style={{ background: ground }}
      aria-label="Interactive map of Ekpoma"
      role="application"
    >
      <WorldZoneDebugPanel />
      <BillboardDebugPanel />
      <MapLoadOverlay targetPercent={targetPercent} assetsDone={assetsDone} />
      <Canvas
        shadows={!mobile}
        dpr={mobile ? mobileDpr : [1, 1.75]}
        gl={{
          antialias: true,
          ...(mobile ? {} : { powerPreference: 'high-performance' as const }),
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
          // Avoid a black clear-color flash before the ground color attaches.
          gl.setClearColor(ground, 1)
        }}
        onPointerMissed={() => select(null)}
      >
        {mobile ? (
          <MobileDprMonitor onDecline={onMobileDprDecline} onIncline={onMobileDprIncline} />
        ) : null}
        <MapLoadReporter onProgress={onProgress} />
        <color attach="background" args={[ground]} />
        <fog attach="fog" args={[ground, 230, 420]} />
        <ambientLight intensity={ambient} />
        <hemisphereLight args={[sky.hemiSky, MAP.land, hemi]} />
        <directionalLight
          position={sky.sunPos}
          intensity={sun}
          color={sky.sunColor}
          castShadow={!mobile}
          shadow-mapSize={mobile ? [512, 512] : [1024, 1024]}
          shadow-camera-left={-140}
          shadow-camera-right={140}
          shadow-camera-top={140}
          shadow-camera-bottom={-140}
          shadow-bias={-0.0004}
          shadow-intensity={0.28}
        />
        <directionalLight position={[-28, 36, -18]} intensity={fill} color="#F2FBFF" />
        <WorldBase color={ground} />
        <WorldGround />
        <WorldRoads />
        <WorldTrees mobile={mobile} />
        <WorldScenery mobile={mobile} night={night} />
        <WorldZones />
        <Suspense fallback={null}>
          <ExtSlabHostels />
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
        <ZoneStickerProjector />
      </Canvas>
      <ZoneStickerOverlay />
    </div>
    </ZoneStickerProvider>
    </ZoneDebugProvider>
  )
}
