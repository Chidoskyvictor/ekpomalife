'use client'

import { Clone, Html, useGLTF } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useState } from 'react'
import {
  Box3,
  Color,
  MeshStandardMaterial,
  Vector3,
  type Material,
  type Mesh,
  type Object3D,
} from 'three'
import { kenneyUrl } from '@/lib/game/kenney-buildings'
import { MAP } from '@/lib/game/map-theme'
import { isGameplayPlace } from '@/lib/game/places'
import { MAP_ZONES, type MapZone } from '@/lib/game/world-layout'
import { useGame } from '@/hooks/use-game'
import { Block } from './materials'
import type { ThreeEvent } from '@react-three/fiber'

const ADMIN_URL = '/models/admin-block.glb'
const PARKING_URL = '/models/parkinglot.glb'
const STADIUM_URL = '/models/football-stadium.glb'
/** From `public/models/hostelbuildings.zip` → extracted under /models/hostel/ */
const HOSTEL_URL = '/models/hostel/source/residential_complex_modern_apartment_building.glb'
/** Parking Lot by Alex Safayan [CC-BY] via Poly Pizza — ~4.1 × 3.9 */
const PARKING_SIZE = { w: 4.1, d: 3.9 }
/** Football stadium by Poly by Google [CC-BY] via Poly Pizza */
const STADIUM_SIZE = { w: 214.22, d: 171.97 }

function saneSize(scene: Object3D) {
  const size = sizeSafe(scene)
  const okAxis = (n: number) => Number.isFinite(n) && n > 0.05 && n < 400
  return {
    x: okAxis(size.x) ? size.x : 10,
    y: okAxis(size.y) ? size.y : 6,
    z: okAxis(size.z) ? size.z : 10,
  }
}

function fitToPad(size: { x: number; z: number }, fw: number, fd: number, fill = 0.92) {
  return Math.max(0.2, Math.min(fw / size.x, fd / size.z) * fill)
}
const SPECIAL_MODELS = new Set(['admin-block', 'hostel-block', 'pad', 'parking-lot', 'football-stadium'])
const KENNEY_MODELS = [...new Set(MAP_ZONES.filter((z) => !SPECIAL_MODELS.has(z.model)).map((z) => z.model))]
KENNEY_MODELS.forEach((name) => useGLTF.preload(kenneyUrl(name)))
useGLTF.preload(ADMIN_URL, false, true)
useGLTF.preload(PARKING_URL)
useGLTF.preload(STADIUM_URL)
useGLTF.preload(HOSTEL_URL)

const adminPaint = (color: string, roughness: number) =>
  new MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.12,
    roughness,
    flatShading: true,
    toneMapped: false,
  })

const ADMIN_PARTS: Record<string, MeshStandardMaterial> = {
  glass: adminPaint('#1a1a1a', 0.3),
  frame: adminPaint('#b3261e', 0.6),
  roof: adminPaint('#141414', 0.7),
  wall: adminPaint(MAP.earthWall, 0.85),
}

function sizeSafe(scene: Object3D) {
  return new Box3().setFromObject(scene).getSize(new Vector3())
}

function shadeMeshes(root: Object3D) {
  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
  })
}

function cloneMaterial(mat: Material, tint?: Color) {
  if (!mat || typeof (mat as Material).clone !== 'function') return mat
  const next = mat.clone() as Material & { color?: Color }
  if (tint && next.color) next.color.multiply(tint)
  return next
}

/** Fresh scene clone with optional earth tint. Keeps single materials as single (not arrays). */
function tintedClone(source: Object3D, tint?: string) {
  const root = source.clone(true)
  const multiply = tint ? new Color(tint) : undefined
  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh || !mesh.material) return
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((mat) => cloneMaterial(mat, multiply))
    } else if (multiply) {
      mesh.material = cloneMaterial(mesh.material, multiply)
    }
  })
  shadeMeshes(root)
  return root
}

function paintAdmin(source: Object3D) {
  const root = source.clone(true)
  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    const name = ((mesh.material as MeshStandardMaterial)?.name ?? '').toLowerCase()
    mesh.material = ADMIN_PARTS[name] ?? ADMIN_PARTS.wall!
  })
  shadeMeshes(root)
  return root
}

function ZoneLabel({ label, height }: { label: string; height: number }) {
  return (
    <Html position={[0, height, 0]} center distanceFactor={48} zIndexRange={[12, 4]} style={{ pointerEvents: 'none' }}>
      <div
        style={{
          padding: '3px 8px',
          borderRadius: 999,
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
          color: '#111',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
          fontFamily: 'var(--font-jakarta), Plus Jakarta Sans, system-ui, sans-serif',
        }}
      >
        {label}
      </div>
    </Html>
  )
}

function Pad({ w, d }: { w: number; d: number }) {
  // Slightly smaller than the footprint — cement, not a bright white slab.
  const pw = Math.max(2.4, w * 0.78)
  const pd = Math.max(2.4, d * 0.78)
  return (
    <group>
      <Block position={[0, 0.04, 0]} size={[pw + 0.22, 0.07, pd + 0.22]} color={MAP.kenneyPadEdge} shadow={false} />
      <Block position={[0, 0.085, 0]} size={[pw, 0.08, pd]} color={MAP.kenneyPad} />
    </group>
  )
}

function labelOnBuilding(mesh: Object3D, scale: number, lift = 0.14) {
  const size = sizeSafe(mesh)
  // Sit on the roof of the scaled mesh, not on the white pad
  return lift + Math.max(1.2, size.y) * scale + 0.55
}

function KenneyZone({ zone }: { zone: MapZone }) {
  const { scene } = useGLTF(kenneyUrl(zone.model))
  // Clone from source each memo pass; drei <Clone> attaches a *second* live instance safely
  const prepared = useMemo(() => tintedClone(scene, zone.tint), [scene, zone.tint])
  const [fw, fd] = zone.footprint
  const scale = zone.scale ?? 3.2
  const labelH = useMemo(() => labelOnBuilding(prepared, scale), [prepared, scale])
  return (
    <group position={[zone.position[0], 0, zone.position[1]]} rotation={[0, zone.rotation, 0]}>
      <Pad w={fw} d={fd} />
      {/* no `deep` — drei deep-clones materials and crashes on multi-material arrays */}
      <Clone object={prepared} position={[0, 0.14, 0]} scale={scale} castShadow receiveShadow />
      <ZoneLabel label={zone.label} height={labelH} />
    </group>
  )
}

function AdminZone({ zone }: { zone: MapZone }) {
  const gltf = useGLTF(ADMIN_URL, false, true)
  const fallback = useGLTF(kenneyUrl('building-skyscraper-c'))
  const parking = useGLTF(PARKING_URL)
  const [fw, fd] = zone.footprint
  const [ok, setOk] = useState(false)

  useEffect(() => {
    const size = new Box3().setFromObject(gltf.scene).getSize(new Vector3())
    setOk(Number.isFinite(size.x) && size.x > 0.05 && size.x < 400 && size.y > 0.05 && size.z > 0.05)
  }, [gltf.scene])

  const prepared = useMemo(() => {
    if (ok) return paintAdmin(gltf.scene)
    return tintedClone(fallback.scene, MAP.earthWall)
  }, [ok, gltf.scene, fallback.scene])

  const meshSize = useMemo(() => saneSize(prepared), [prepared])
  // Pad matches the full building footprint (same idea as other white slabs)
  const scale = fitToPad(meshSize, fw, fd, 0.9)
  const padW = Math.max(fw, meshSize.x * scale * 1.08)
  const padD = Math.max(fd, meshSize.z * scale * 1.08)
  // Tag sits on the roof, not on the pad
  const labelH = 0.14 + meshSize.y * scale + 0.85

  // Courtyard = open hollow inside the L — stretch one lot + asphalt to fill it
  const courtW = padW * 0.88
  const courtD = padD * 0.82
  const parkSx = courtW / PARKING_SIZE.w
  const parkSz = courtD / PARKING_SIZE.d
  const parkSy = (parkSx + parkSz) / 2

  return (
    <group position={[zone.position[0], 0, zone.position[1]]} rotation={[0, zone.rotation, 0]}>
      <Pad w={padW} d={padD} />
      {/* Asphalt bed so the courtyard reads as road even under the lot mesh */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.115, 0]} receiveShadow>
        <planeGeometry args={[courtW, courtD]} />
        <meshStandardMaterial color="#2c2c2c" roughness={0.94} />
      </mesh>
      <Clone
        object={parking.scene}
        position={[0, 0.12, 0]}
        scale={[parkSx, parkSy, parkSz]}
        castShadow
        receiveShadow
      />
      <Clone object={prepared} position={[0, 0.14, 0]} scale={scale} castShadow receiveShadow />
      <ZoneLabel label={zone.label} height={labelH} />
    </group>
  )
}

function PadZone({ zone }: { zone: MapZone }) {
  const [fw, fd] = zone.footprint
  return (
    <group position={[zone.position[0], 0, zone.position[1]]} rotation={[0, zone.rotation, 0]}>
      <Pad w={fw} d={fd} />
      <Block position={[0, 0.2, 0]} size={[fw * 0.7, 0.08, fd * 0.55]} color={MAP.road} shadow={false} />
      <ZoneLabel label={zone.label} height={2.6} />
    </group>
  )
}

function ParkingZone({ zone }: { zone: MapZone }) {
  const { scene } = useGLTF(PARKING_URL)
  const [fw, fd] = zone.footprint
  // Single mesh, no white pad — asphalt is part of the model
  const scale = Math.min(fw / PARKING_SIZE.w, fd / PARKING_SIZE.d)
  const labelH = useMemo(() => labelOnBuilding(scene, scale, 0.08), [scene, scale])
  return (
    <group position={[zone.position[0], 0, zone.position[1]]} rotation={[0, zone.rotation, 0]}>
      <Clone object={scene} position={[0, 0.08, 0]} scale={scale} castShadow receiveShadow />
      <ZoneLabel label={zone.label} height={labelH} />
    </group>
  )
}

function StadiumZone({ zone }: { zone: MapZone }) {
  const { scene } = useGLTF(STADIUM_URL)
  const [fw, fd] = zone.footprint
  const scale = Math.min(fw / STADIUM_SIZE.w, fd / STADIUM_SIZE.d)
  const labelH = useMemo(() => labelOnBuilding(scene, scale, 0.06), [scene, scale])
  return (
    <group position={[zone.position[0], 0, zone.position[1]]} rotation={[0, zone.rotation, 0]}>
      <Clone object={scene} position={[0, 0.06, 0]} scale={scale} castShadow receiveShadow />
      <ZoneLabel label={zone.label} height={labelH} />
    </group>
  )
}

function HostelZone({ zone }: { zone: MapZone }) {
  const { scene } = useGLTF(HOSTEL_URL)
  // Do not tint — keep the zip textures as authored
  const prepared = useMemo(() => scene.clone(true), [scene])
  const [fw, fd] = zone.footprint
  const meshSize = useMemo(() => saneSize(prepared), [prepared])
  const scale = fitToPad(meshSize, fw, fd, 0.94)
  const padW = Math.max(fw, meshSize.x * scale * 1.06)
  const padD = Math.max(fd, meshSize.z * scale * 1.06)
  const labelH = 0.14 + meshSize.y * scale + 0.7
  return (
    <group position={[zone.position[0], 0, zone.position[1]]} rotation={[0, zone.rotation, 0]}>
      <Pad w={padW} d={padD} />
      <Clone object={prepared} position={[0, 0.14, 0]} scale={scale} castShadow receiveShadow />
      <ZoneLabel label={zone.label} height={labelH} />
    </group>
  )
}

function ZoneFallback({ zone }: { zone: MapZone }) {
  const [fw, fd] = zone.footprint
  const bare = zone.model === 'parking-lot' || zone.model === 'football-stadium'
  return (
    <group position={[zone.position[0], 0, zone.position[1]]}>
      {bare ? null : <Pad w={fw} d={fd} />}
      <ZoneLabel label={zone.label} height={3} />
    </group>
  )
}

function ZoneMesh({ zone }: { zone: MapZone }) {
  if (zone.model === 'admin-block' || zone.id === 'admin-block') return <AdminZone zone={zone} />
  if (zone.model === 'hostel-block') return <HostelZone zone={zone} />
  if (zone.model === 'parking-lot') return <ParkingZone zone={zone} />
  if (zone.model === 'football-stadium') return <StadiumZone zone={zone} />
  if (zone.model === 'pad') return <PadZone zone={zone} />
  return <KenneyZone zone={zone} />
}

function TappableZone({ zone }: { zone: MapZone }) {
  const { select } = useGame()
  const playable = isGameplayPlace(zone.id)
  const onClick = (event: ThreeEvent<MouseEvent>) => {
    if (!playable) return
    event.stopPropagation()
    select(zone.id)
  }
  return (
    <group>
      <Suspense fallback={<ZoneFallback zone={zone} />}>
        <ZoneMesh zone={zone} />
      </Suspense>
      {playable ? (
        <mesh
          position={[zone.position[0], 4, zone.position[1]]}
          visible={false}
          onClick={onClick}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <boxGeometry args={[zone.footprint[0] * 1.15, 10, zone.footprint[1] * 1.15]} />
        </mesh>
      ) : null}
    </group>
  )
}

export function WorldZones() {
  const zones = useMemo(() => MAP_ZONES, [])
  return (
    <group>
      {zones.map((zone) => (
        <TappableZone key={zone.id} zone={zone} />
      ))}
    </group>
  )
}
