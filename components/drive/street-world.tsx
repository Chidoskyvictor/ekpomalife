'use client'

import { useGLTF } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useMemo, type MutableRefObject } from 'react'
import { ACESFilmicToneMapping, CanvasTexture, SRGBColorSpace } from 'three'
import { ContextRestore } from '@/components/three/context-restore'
import { GATE_URL } from '@/components/travel/drive-scene'
import { rideLookAt, rideMinute } from '@/components/travel/ride-environment'
import type { Peer, PeerState } from '@/lib/game/club-live'
import type { DriveStart } from '@/lib/game/drive'
import { HALF, SCENE_ROADS, ROAD_PLACES, ROAD_SIGNS, surfaceAt, pointAt, roadById, spotAt } from '@/lib/game/drive-road'
import { GFX, useGfxTier } from '@/lib/game/gfx-quality'
import { CarLightsContext } from '@/components/cars/car-model'
import { DriveCar, PeerCars, type DriveWorld } from './map-drive'
import { Roadside } from './street-buildings'
import { EntranceCrowd } from './street-crowd'
import { StreetSky } from './street-sky'
import { Barriers, Gantries, Roads } from './street-roads'
import { RaceWorld } from './race-world'
import { FinishBeam, RouteArrows, Traffic, Walkers, trafficBlocks } from './street-life'

/*
 * The street-level world you drive in. Its roads are real Ekpoma road lines (lib/game/drive-road.ts,
 * from OpenStreetMap). Only the Benin-Auchi expressway is the ride's dual carriageway (highway.glb,
 * laid piece by piece along the line, with its own cement slabs and a grass verge); the Ihumudumu
 * road and the cross streets are grey asphalt drawn here: white edge lines, a dashed centre line,
 * laterite shoulders. Shops, flats and trees line them all, our places stand at their real spots,
 * and green signs name the junctions. Everything that repeats is drawn as shared copies, so the
 * whole town is a few dozen draw calls.
 */

// Kerbs, the divider and the ends of the roads stop the car; so do the other cars
const STREET_WORLD: DriveWorld = { unit: 2.5, carScale: 1, blocked: (x, z) => surfaceAt(x, z) === 'wall' || trafficBlocks(x, z), surface: surfaceAt }

const boardCache = new Map<string, CanvasTexture>()
/** White words on a coloured board, with an optional small line under them. */
function boardTexture(text: string, color: string, small?: string) {
  const key = `${text}|${color}|${small ?? ''}`
  let hit = boardCache.get(key)
  if (!hit) {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 160
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 512, 160)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 6
    ctx.strokeRect(9, 9, 494, 142)
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    let size = 64
    do {
      ctx.font = `700 ${size}px system-ui, sans-serif`
      size -= 4
    } while (ctx.measureText(text).width > 460 && size > 24)
    ctx.fillText(text, 256, small ? 66 : 82)
    if (small) {
      ctx.font = '600 30px system-ui, sans-serif'
      ctx.fillText(small, 256, 122)
    }
    hit = new CanvasTexture(canvas)
    hit.colorSpace = SRGBColorSpace
    hit.anisotropy = 4
    boardCache.set(key, hit)
  }
  return hit
}

/** A board on two posts at the kerb, facing the traffic that comes along its side of the road. */
function Board({ road, s, side, text, color, small, back = 0 }: { road: string; s: number; side: number; text: string; color: string; small?: string; back?: number }) {
  const spot = spotAt(road, s, side * (HALF[spotAt(road, s, 0).road.kind] + 1.4 + back))
  // Cars on this side travel along (dx, dz) * side: the board looks back at them
  const yaw = Math.atan2(-spot.dx * side, -spot.dz * side)
  const map = boardTexture(text, color, small)
  return (
    <group position={[spot.x, 0, spot.z]} rotation={[0, yaw, 0]}>
      {[-1.9, 1.9].map((x) => (
        <mesh key={x} position={[x, 1.7, 0]}>
          <boxGeometry args={[0.14, 3.4, 0.14]} />
          <meshLambertMaterial color="#7a7f85" />
        </mesh>
      ))}
      <mesh position={[0, 3.6, 0.09]}>
        <planeGeometry args={[4.6, 1.44]} />
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
      <mesh position={[0, 3.6, 0]}>
        <boxGeometry args={[4.7, 1.54, 0.12]} />
        <meshLambertMaterial color="#0e3b22" />
      </mesh>
    </group>
  )
}

/** The AAU gate, set back on its side of the road and turned to face it. */
function Gate({ road, s, side }: { road: string; s: number; side: number }) {
  const { scene } = useGLTF(GATE_URL)
  const model = useMemo(() => scene.clone(true), [scene])
  const kind = spotAt(road, s, 0).road.kind
  const spot = spotAt(road, s, side * (HALF[kind] + 12))
  // Native model: 52 wide, front facing +z. Face the road, about 28 m along it.
  return <primitive object={model} position={[spot.x, 0, spot.z]} rotation={[0, Math.atan2(spot.dz * side, -spot.dx * side), 0]} scale={0.55} />
}

/** Our places at their real spots: a blue name board and a marked bay at the kerb to park in. */
function Places() {
  return (
    <>
      {ROAD_PLACES.filter((p) => !p.inside).map((p) => {
        const kind = spotAt(p.road, p.s, 0).road.kind
        const bay = spotAt(p.road, p.s, p.side * (HALF[kind] - 1.6))
        return (
          <group key={p.id}>
            <Board road={p.road} s={p.s - p.side * 9} side={p.side} text={p.label} color="#1d4ed8" small="P  Park here" back={0.6} />
            <mesh position={[bay.x, 0.2, bay.z]} rotation={[-Math.PI / 2, 0, Math.atan2(bay.dx, bay.dz)]}>
              <planeGeometry args={[2.6, 12]} />
              <meshBasicMaterial color="#2f7cf6" transparent opacity={0.45} depthWrite={false} />
            </mesh>
            {p.id === 'aau-gate' ? (
              <Suspense fallback={null}>
                <Gate road={p.road} s={p.s} side={p.side} />
              </Suspense>
            ) : null}
          </group>
        )
      })}
      {ROAD_SIGNS.map((sign, i) => (
        <Board key={`${sign.road}-${sign.s}-${i}`} road={sign.road} s={sign.s - sign.side * 26} side={sign.side} text={sign.text} color="#136b3a" />
      ))}
    </>
  )
}

export type StreetProps = {
  car: { model: string; color: string }
  /** Your character's look, shown at the wheel. */
  look?: unknown
  start: DriveStart
  send: (state: PeerState) => void
  peers: MutableRefObject<Map<string, Peer>>
  roster: number
}

function Scene({ car, look: driverLook, start, send, peers, roster }: StreetProps) {
  // Light for the hour on the game clock, fixed for the drive
  const look = useMemo(() => rideLookAt(rideMinute()), [])
  const mid = useMemo(() => pointAt(roadById("expressway"), roadById("expressway").length / 2), [])
  return (
    <CarLightsContext.Provider value={look.level !== 'day'}>
      <StreetSky look={look} />
      <hemisphereLight args={[look.hemiSky, look.hemiGround, look.hemiInt]} />
      <ambientLight intensity={look.ambient} />
      <directionalLight position={[look.lightDir.x * 120, look.lightDir.y * 120, look.lightDir.z * 120]} color={look.sunColor} intensity={look.sunInt} />
      <fog attach="fog" args={[look.horizon, look.level === 'day' ? 130 : look.level === 'dusk' ? 90 : 70, look.level === 'day' ? 440 : look.level === 'dusk' ? 400 : 360]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[mid.x, -0.05, mid.z]}>
        <planeGeometry args={[4200, 3000]} />
        <meshLambertMaterial color="#8f9a66" />
      </mesh>
      <Roads level={look.level} />
      <Gantries />
      <Barriers />
      <Roadside level={look.level} />
      <Places />
      <Suspense fallback={null}>
        <EntranceCrowd />
      </Suspense>
      <RouteArrows />
      <FinishBeam />
      <RaceWorld />
      <Traffic />
      <Suspense fallback={null}>
        <Walkers />
      </Suspense>
      <PeerCars peers={peers} roster={roster} scale={1} />
      <DriveCar car={car} driverLook={driverLook} start={start} send={send} world={STREET_WORLD} />
    </CarLightsContext.Provider>
  )
}

/** The driving view's own canvas (quality follows the graphics tier, like the ride). */
export function StreetCanvas(props: StreetProps) {
  const tier = useGfxTier()
  const gfx = GFX[tier]
  return (
    <Canvas
      key={tier}
      dpr={gfx.dpr}
      gl={{ antialias: gfx.antialias, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false }}
      camera={{ position: [props.start.x, 4, props.start.z], fov: 58, near: 0.5, far: 460 }}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping
        gl.toneMappingExposure = 1
        gl.outputColorSpace = SRGBColorSpace
      }}
    >
      <ContextRestore />
      <Scene {...props} />
    </Canvas>
  )
}

useGLTF.preload(GATE_URL)
