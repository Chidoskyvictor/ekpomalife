'use client'

import { Clone, useGLTF } from '@react-three/drei'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Box3,
  BoxGeometry,
  CanvasTexture,
  Color,
  IcosahedronGeometry,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
  type Material,
  type Mesh,
} from 'three'
import { useGame } from '@/hooks/use-game'
import { drawAdPlaceholder, drawBoardAd, drawBoardImage, openAd, stampBoardNumber } from '@/lib/game/billboard-ad'
import { adForBoard, boardNumber } from '@/lib/game/billboard-ads'
import { kenneyUrl } from '@/lib/game/kenney-buildings'
import { mapPalette as MAP } from '@/lib/game/map-theme'
import { placeFor } from '@/lib/game/place-info'
import { MAP_ZONES, type MapZone, type OpenZoneKind, type ZonePart } from '@/lib/game/world-layout'
import { bakeStaticGroup, disposeBaked } from './bake-static'
import { applyGlbTextureAnisotropy } from './glb-textures'
import { Block, paint } from './materials'
import { ZoneStickerAnchor, ZoneStickerRegistry } from './world-zone-stickers'
import { useZonePlacement, ZoneExtrasProvider, useZoneExtras } from './zone-debug-context'

const ADMIN_URL = '/models/admin-block.glb'
const PARKING_URL = '/models/parkinglot.glb'
const STADIUM_URL = '/models/football-stadium.glb'
const HOSTEL_URL = '/models/hostel.glb'
const AAU_GATE_URL = '/models/aau_gate.glb'
/** Hand-made GLBs, set on the same cement pad as other buildings — zone `model` → file. */
const CUSTOM_GLB: Record<string, string> = {
  sazza: '/models/sazza.glb',
  'above-the-hills': '/models/above-the-hills.glb',
  forbes: '/models/forbes.glb',
  wise: '/models/wise.glb',
  shop: '/models/shop.glb',
}
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

/** Move model so its bounding-box centre sits on the footprint origin. */
function centerOnGround(scene: Object3D) {
  const box = new Box3().setFromObject(scene)
  const center = box.getCenter(new Vector3())
  const floor = box.min.y
  scene.position.x -= center.x
  scene.position.z -= center.z
  scene.position.y -= floor
}

function fitToPad(size: { x: number; z: number }, fw: number, fd: number, fill = 0.92) {
  return Math.max(0.2, Math.min(fw / size.x, fd / size.z) * fill)
}
const SPECIAL_MODELS = new Set([
  'admin-block',
  'hostel-block',
  'pad',
  'parking-lot',
  'football-stadium',
  'aau-gate',
  'billboard1',
  'billboard-pack',
  ...Object.keys(CUSTOM_GLB),
])
/** Zone `model` keys that are layouts, not files (second slab). */
const LAYOUT_KEYS = new Set(['cluster', 'open', 'label'])
const KENNEY_MODELS = [
  ...new Set([
    ...MAP_ZONES.filter((z) => !SPECIAL_MODELS.has(z.model) && !LAYOUT_KEYS.has(z.model)).map((z) => z.model),
    ...MAP_ZONES.flatMap((z) => z.parts ?? [])
      .map((part) => part.model)
      .filter((model) => !SPECIAL_MODELS.has(model)),
  ]),
]
KENNEY_MODELS.forEach((name) => useGLTF.preload(kenneyUrl(name)))
useGLTF.preload(ADMIN_URL, false, true)
useGLTF.preload(PARKING_URL)
useGLTF.preload(STADIUM_URL)
useGLTF.preload(HOSTEL_URL)
useGLTF.preload(AAU_GATE_URL)
Object.values(CUSTOM_GLB).forEach((url) => useGLTF.preload(url))

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

function gateMeshLabels(mesh: Mesh) {
  const labels: string[] = []
  let node: Object3D | null = mesh
  while (node) {
    if (node.name) labels.push(node.name)
    node = node.parent
  }
  return labels.join(' ').toLowerCase()
}

/**
 * Remove baked floor / trees from the AAU gate GLB (not our Pad — only meshes inside the GLB).
 * Must run before centerOnGround so the Plane does not set the floor height.
 */
function stripGateExtras(root: Object3D) {
  const remove: Object3D[] = []
  const rootBox = new Box3().setFromObject(root)
  const floorBand = rootBox.min.y + 0.35

  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    const labels = gateMeshLabels(mesh)
    const leaf = (mesh.name || '').trim()

    if (/plane|ground|floor|pavement|asphalt/.test(labels)) {
      remove.push(mesh)
      return
    }

    if (/^icosphere(\.\d+)?$/i.test(leaf) || /icosphere/.test(labels)) {
      remove.push(mesh)
      return
    }

    if (/^cylinder(\.\d+)?$/i.test(leaf)) {
      const verts = mesh.geometry?.attributes?.position?.count ?? 0
      if (verts >= 60) remove.push(mesh)
      return
    }

    const box = new Box3().setFromObject(mesh)
    const size = box.getSize(new Vector3())
    const thinPad = size.y < 0.3 && size.x > 1.5 && size.z > 1.5
    if (thinPad && box.max.y <= floorBand) remove.push(mesh)
  })

  for (const node of remove) node.parent?.remove(node)
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

/** Static GLB merged into a few meshes (one draw per shading group instead of one per piece). */
function useBaked(source: Object3D) {
  const baked = useMemo(() => bakeStaticGroup(source), [source])
  useEffect(() => () => disposeBaked(baked), [baked])
  return baked
}

function Pad({ w, d }: { w: number; d: number }) {
  // Slightly smaller than the footprint — cement, not a bright white slab.
  const pw = Math.max(2.4, w * 0.78)
  const pd = Math.max(2.4, d * 0.78)
  return (
    <group>
      <Block position={[0, 0.04, 0]} size={[pw + 0.22, 0.07, pd + 0.22]} color={MAP.kenneyPadEdge} shadow={false} />
      <Block position={[0, 0.085, 0]} size={[pw, 0.08, pd]} color={MAP.kenneyPad} shadow={false} />
    </group>
  )
}

/**
 * Sticker height at the roof line. Uses the mesh's height span (not its absolute bounds) so an
 * origin offset in the GLB does not float labels in the sky.
 */
function roofStickerY(mesh: Object3D, scale: number, baseY = 0.14) {
  const box = new Box3().setFromObject(mesh)
  // Roof line: the pill's bottom edge rests here (see ZoneStickerOverlay), so it sits on the building
  const span = Math.max(0.5, box.max.y - box.min.y)
  return baseY + span * scale
}

function KenneyZone({ zone }: { zone: MapZone }) {
  const { modelY, scaleMul } = useZoneExtras()
  const gl = useThree((state) => state.gl)
  const { scene } = useGLTF(kenneyUrl(zone.model))
  useLayoutEffect(() => {
    applyGlbTextureAnisotropy(scene, gl)
  }, [scene, gl])
  // Clone from source each memo pass; drei <Clone> attaches a *second* live instance safely
  const prepared = useMemo(() => tintedClone(scene, zone.tint), [scene, zone.tint])
  const [fw, fd] = zone.footprint
  const scale = (zone.scale ?? 3.2) * scaleMul
  const labelH = useMemo(() => roofStickerY(prepared, scale), [prepared, scale])
  return (
    <group position={[zone.position[0], 0, zone.position[1]]} rotation={[0, zone.rotation, 0]}>
      <Pad w={fw} d={fd} />
      {/* no `deep` — drei deep-clones materials and crashes on multi-material arrays */}
      <Clone object={prepared} position={[0, 0.14 + modelY, 0]} scale={scale} castShadow receiveShadow />
      <ZoneStickerAnchor zoneId={zone.id} label={zone.label} height={labelH} />
    </group>
  )
}

function AdminZone({ zone }: { zone: MapZone }) {
  const { modelY, scaleMul } = useZoneExtras()
  const gl = useThree((state) => state.gl)
  const gltf = useGLTF(ADMIN_URL, false, true)
  const fallback = useGLTF(kenneyUrl('building-skyscraper-c'))
  const parking = useGLTF(PARKING_URL)
  useLayoutEffect(() => {
    applyGlbTextureAnisotropy(gltf.scene, gl)
    applyGlbTextureAnisotropy(fallback.scene, gl)
    applyGlbTextureAnisotropy(parking.scene, gl)
  }, [gltf.scene, fallback.scene, parking.scene, gl])
  const [fw, fd] = zone.footprint
  const [ok, setOk] = useState(false)

  useLayoutEffect(() => {
    const size = new Box3().setFromObject(gltf.scene).getSize(new Vector3())
    setOk(Number.isFinite(size.x) && size.x > 0.05 && size.x < 400 && size.y > 0.05 && size.z > 0.05)
  }, [gltf.scene])

  const prepared = useMemo(() => {
    if (ok) return paintAdmin(gltf.scene)
    return tintedClone(fallback.scene, MAP.earthWall)
  }, [ok, gltf.scene, fallback.scene])

  const bakedParking = useBaked(parking.scene)
  const meshSize = useMemo(() => saneSize(prepared), [prepared])
  // Pad matches the full building footprint (same idea as other white slabs)
  const scale = fitToPad(meshSize, fw, fd, 0.9) * scaleMul
  const padW = Math.max(fw, meshSize.x * scale * 1.08)
  const padD = Math.max(fd, meshSize.z * scale * 1.08)
  // Tag sits on the roof, not on the pad
  const labelH = roofStickerY(prepared, scale)

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
      <primitive object={bakedParking} position={[0, 0.12, 0]} scale={[parkSx, parkSy, parkSz]} />
      {/* Not baked: only 4 meshes (one per glow colour) and 124k quantized triangles */}
      <Clone object={prepared} position={[0, 0.14 + modelY, 0]} scale={scale} castShadow receiveShadow />
      <ZoneStickerAnchor zoneId={zone.id} label={zone.label} height={labelH} />
    </group>
  )
}

function PadZone({ zone }: { zone: MapZone }) {
  const [fw, fd] = zone.footprint
  return (
    <group position={[zone.position[0], 0, zone.position[1]]} rotation={[0, zone.rotation, 0]}>
      <Pad w={fw} d={fd} />
      <Block position={[0, 0.2, 0]} size={[fw * 0.7, 0.08, fd * 0.55]} color={MAP.road} shadow={false} />
      <ZoneStickerAnchor zoneId={zone.id} label={zone.label} height={0.35} />
    </group>
  )
}

function ParkingZone({ zone }: { zone: MapZone }) {
  const { modelY, scaleMul } = useZoneExtras()
  const gl = useThree((state) => state.gl)
  const { scene } = useGLTF(PARKING_URL)
  useLayoutEffect(() => {
    applyGlbTextureAnisotropy(scene, gl)
  }, [scene, gl])
  const [fw, fd] = zone.footprint
  // Single mesh, no white pad — asphalt is part of the model
  const scale = Math.min(fw / PARKING_SIZE.w, fd / PARKING_SIZE.d) * scaleMul
  const labelH = useMemo(() => roofStickerY(scene, scale, 0.08), [scene, scale])
  const baked = useBaked(scene)
  return (
    <group position={[zone.position[0], 0, zone.position[1]]} rotation={[0, zone.rotation, 0]}>
      <primitive object={baked} position={[0, 0.08 + modelY, 0]} scale={scale} />
      <ZoneStickerAnchor zoneId={zone.id} label={zone.label} height={labelH} />
    </group>
  )
}

function StadiumZone({ zone }: { zone: MapZone }) {
  const { modelY, scaleMul } = useZoneExtras()
  const gl = useThree((state) => state.gl)
  const { scene } = useGLTF(STADIUM_URL)
  useLayoutEffect(() => {
    applyGlbTextureAnisotropy(scene, gl)
  }, [scene, gl])
  const [fw, fd] = zone.footprint
  const scale = Math.min(fw / STADIUM_SIZE.w, fd / STADIUM_SIZE.d) * scaleMul
  const labelH = useMemo(() => roofStickerY(scene, scale, 0.06), [scene, scale])
  const baked = useBaked(scene)
  return (
    <group position={[zone.position[0], 0, zone.position[1]]} rotation={[0, zone.rotation, 0]}>
      <primitive object={baked} position={[0, 0.06 + modelY, 0]} scale={scale} />
      <ZoneStickerAnchor zoneId={zone.id} label={zone.label} height={labelH} />
    </group>
  )
}

/** A hand-made GLB, centred and fitted to the zone footprint, baked into a few draws. */
function CustomGlbZone({ zone, url }: { zone: MapZone; url: string }) {
  const { modelY, scaleMul } = useZoneExtras()
  const { scene } = useGLTF(url)
  const prepared = useMemo(() => {
    const root = scene.clone(true)
    root.position.set(0, 0, 0)
    // Centre on the footprint and sit the model's lowest point on the slab
    const box = new Box3().setFromObject(root)
    const center = box.getCenter(new Vector3())
    root.children.forEach((child) => {
      child.position.x -= center.x
      child.position.y -= box.min.y
      child.position.z -= center.z
    })
    return root
  }, [scene])
  const baked = useBaked(prepared)
  const [fw, fd] = zone.footprint
  const meshSize = useMemo(() => saneSize(prepared), [prepared])
  const scale = fitToPad(meshSize, fw, fd, 1) * (zone.scale ?? 1) * scaleMul
  const padW = meshSize.x * scale * 1.06
  const padD = meshSize.z * scale * 1.06
  const labelH = roofStickerY(prepared, scale, 0.06 + modelY)
  return (
    <group position={[zone.position[0], 0, zone.position[1]]} rotation={[0, zone.rotation, 0]}>
      <Pad w={padW} d={padD} />
      <primitive object={baked} position={[0, 0.06 + modelY, 0]} scale={scale} />
      <ZoneStickerAnchor zoneId={zone.id} label={zone.label} height={labelH} />
    </group>
  )
}

function AauGateZone({ zone }: { zone: MapZone }) {
  const { modelY, scaleMul } = useZoneExtras()
  const gl = useThree((state) => state.gl)
  const { scene } = useGLTF(AAU_GATE_URL)
  useLayoutEffect(() => {
    applyGlbTextureAnisotropy(scene, gl)
  }, [scene, gl])
  const prepared = useMemo(() => {
    const root = scene.clone(true)
    stripGateExtras(root)
    centerOnGround(root)
    shadeMeshes(root)
    return root
  }, [scene])
  const [fw, fd] = zone.footprint
  const meshSize = useMemo(() => saneSize(prepared), [prepared])
  const scale = fitToPad(meshSize, fw, fd, 0.96) * (zone.scale ?? 1) * scaleMul
  const labelH = roofStickerY(prepared, scale, 0.08)
  const baked = useBaked(prepared)
  return (
    <group position={[zone.position[0], 0, zone.position[1]]} rotation={[0, zone.rotation, 0]}>
      <primitive object={baked} position={[0, 0.08 + modelY, 0]} scale={scale} />
      <ZoneStickerAnchor zoneId={zone.id} label={zone.label} height={labelH} />
    </group>
  )
}

function HostelZone({ zone }: { zone: MapZone }) {
  const { modelY, scaleMul } = useZoneExtras()
  const gl = useThree((state) => state.gl)
  const { scene } = useGLTF(HOSTEL_URL)
  useLayoutEffect(() => {
    applyGlbTextureAnisotropy(scene, gl)
  }, [scene, gl])
  const prepared = useMemo(() => {
    const root = scene.clone(true)
    centerOnGround(root)
    shadeMeshes(root)
    return root
  }, [scene])
  const [fw, fd] = zone.footprint
  const meshSize = useMemo(() => saneSize(prepared), [prepared])
  const scale = fitToPad(meshSize, fw, fd, 0.88) * scaleMul
  const padW = Math.max(fw, meshSize.x * scale * 1.06)
  const padD = Math.max(fd, meshSize.z * scale * 1.06)
  const labelH = roofStickerY(prepared, scale)
  const baked = useBaked(prepared)
  return (
    <group position={[zone.position[0], 0, zone.position[1]]} rotation={[0, zone.rotation, 0]}>
      <Pad w={padW} d={padD} />
      <primitive object={baked} position={[0, 0.14 + modelY, 0]} scale={scale} />
      <ZoneStickerAnchor zoneId={zone.id} label={zone.label} height={labelH} />
    </group>
  )
}

// —— Second slab: multi-building clusters, open plots, road labels ——

const DEFAULT_PART_SCALE = 4.9

/** Kenney part inside a cluster; carries the zone sticker when `withLabel`. */
function KenneyPart({ zone, part, withLabel }: { zone: MapZone; part: ZonePart; withLabel: boolean }) {
  const gl = useThree((state) => state.gl)
  const { scene } = useGLTF(kenneyUrl(part.model))
  useLayoutEffect(() => {
    applyGlbTextureAnisotropy(scene, gl)
  }, [scene, gl])
  const prepared = useMemo(() => tintedClone(scene, part.tint), [scene, part.tint])
  const scale = part.scale ?? DEFAULT_PART_SCALE
  const size = useMemo(() => saneSize(prepared), [prepared])
  const baseY = part.noPad ? 0.02 : 0.14
  const roof = useMemo(() => roofStickerY(prepared, scale, baseY), [prepared, scale, baseY])
  // Pad shrinks its input by 0.78 — pass a size that lands ~8% outside the building
  const padW = (size.x * scale * 1.08) / 0.78
  const padD = (size.z * scale * 1.08) / 0.78
  return (
    <group position={[part.dx, 0, part.dz]} rotation={[0, part.rotation ?? 0, 0]}>
      {part.noPad ? null : <Pad w={padW} d={padD} />}
      <Clone object={prepared} position={[0, baseY, 0]} scale={scale} castShadow receiveShadow />
      {part.cross ? (
        <group position={[0, roof, 0]}>
          <Block position={[0, 1.1, 0]} size={[0.32, 2.2, 0.32]} color="#f4f1e8" />
          <Block position={[0, 1.5, 0]} size={[1.3, 0.32, 0.32]} color="#f4f1e8" />
        </group>
      ) : null}
      {withLabel ? <ZoneStickerAnchor zoneId={zone.id} label={zone.label} height={roof} /> : null}
    </group>
  )
}

/** Parking-lot model as a prop (it ships with cars) — e.g. a mechanic's yard. */
function ParkingPart({ part }: { part: ZonePart }) {
  const { scene } = useGLTF(PARKING_URL)
  const baked = useBaked(scene)
  const [w, d] = part.size ?? [6, 6]
  const sx = w / PARKING_SIZE.w
  const sz = d / PARKING_SIZE.d
  return (
    <group position={[part.dx, 0, part.dz]} rotation={[0, part.rotation ?? 0, 0]}>
      <primitive object={baked} position={[0, 0.06, 0]} scale={[sx, (sx + sz) / 2, sz]} />
    </group>
  )
}

/** Several buildings (and props) under one zone id and one sticker. */
function ClusterZone({ zone }: { zone: MapZone }) {
  const { modelY, scaleMul } = useZoneExtras()
  const parts = zone.parts ?? []
  // Sticker rides on the biggest padded building
  const labelIndex = parts.reduce(
    (best, part, i) =>
      !part.noPad && part.model !== 'parking-lot' && (part.scale ?? DEFAULT_PART_SCALE) > (parts[best]?.scale ?? 0)
        ? i
        : best,
    0,
  )
  return (
    <group
      position={[zone.position[0], modelY, zone.position[1]]}
      rotation={[0, zone.rotation, 0]}
      scale={scaleMul}
    >
      {parts.map((part, i) =>
        part.model === 'parking-lot' ? (
          <ParkingPart key={i} part={part} />
        ) : (
          <KenneyPart key={i} zone={zone} part={part} withLabel={i === labelIndex} />
        ),
      )}
    </group>
  )
}

const OPEN_GROUND: Record<OpenZoneKind, { fill: string; edge: string }> = {
  park: { fill: '#86b866', edge: '#6f9a52' },
  plot: { fill: MAP.earthDust, edge: MAP.earthMud },
  plaza: { fill: MAP.kenneyPad, edge: MAP.kenneyPadEdge },
}

type PropSpot = { x: number; z: number; rot: number }

/** Bench + bush positions per open-zone kind, in zone-local units. */
function openZoneProps(kind: OpenZoneKind, w: number, d: number) {
  const benches: PropSpot[] = []
  const bushes: PropSpot[] = []
  const edge = (fx: number, fz: number) => ({ x: fx * w, z: fz * d, rot: 0 })
  if (kind === 'park') {
    // Benches facing a small central lawn; shrubs fill between the trees
    benches.push({ x: 0, z: -d * 0.12, rot: 0 }, { x: 0, z: d * 0.12, rot: Math.PI })
    benches.push({ x: -w * 0.18, z: 0, rot: Math.PI / 2 }, { x: w * 0.18, z: 0, rot: -Math.PI / 2 })
    bushes.push(edge(-0.42, 0), edge(0.42, 0), edge(0, 0.42), edge(-0.2, 0.44), edge(0.2, -0.44))
  } else if (kind === 'plaza') {
    // Paved square: two rows of benches, planters at the corners
    for (const fx of [-0.3, -0.1, 0.1, 0.3]) {
      benches.push({ x: fx * w, z: -d * 0.2, rot: 0 }, { x: fx * w, z: d * 0.2, rot: Math.PI })
    }
    bushes.push(edge(-0.44, -0.4), edge(0.44, -0.4), edge(-0.44, 0.4), edge(0.44, 0.4), edge(0, 0))
  } else {
    // Bare plot: a bench by the front and scrub along the edges
    benches.push({ x: 0, z: d * 0.32, rot: Math.PI })
    bushes.push(edge(-0.42, -0.38), edge(0.4, -0.4), edge(-0.44, 0.3), edge(0.43, 0.34), edge(0.1, -0.42))
  }
  return { benches, bushes }
}

const benchGeometry = new BoxGeometry(1.7, 0.42, 0.55)
const bushGeometry = new IcosahedronGeometry(0.6, 0)

function PropInstances({
  spots,
  geometry,
  color,
  y,
  scale = [1, 1, 1],
}: {
  spots: PropSpot[]
  geometry: BufferGeometry
  color: string
  y: number
  scale?: [number, number, number]
}) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new Object3D()
    spots.forEach((spot, i) => {
      dummy.position.set(spot.x, y, spot.z)
      dummy.rotation.set(0, spot.rot, 0)
      dummy.scale.set(...scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [spots, y, scale])
  if (spots.length === 0) return null
  return (
    <instancedMesh ref={ref} args={[geometry, paint(color), spots.length]} receiveShadow frustumCulled={false} />
  )
}

const BUSH_SCALE: [number, number, number] = [1.15, 0.75, 1]

/** Open zone (no building): a ground plot with props — benches + shrubs as two instanced draws. */
function OpenZone({ zone }: { zone: MapZone }) {
  const kind = zone.open ?? 'plot'
  const [w, d] = zone.footprint
  const ground = OPEN_GROUND[kind]
  const { benches, bushes } = useMemo(() => openZoneProps(kind, w, d), [kind, w, d])
  return (
    <group position={[zone.position[0], 0, zone.position[1]]} rotation={[0, zone.rotation, 0]}>
      <Block position={[0, 0.03, 0]} size={[w + 0.4, 0.05, d + 0.4]} color={ground.edge} shadow={false} />
      <Block position={[0, 0.06, 0]} size={[w, 0.05, d]} color={ground.fill} shadow={false} />
      <PropInstances spots={benches} geometry={benchGeometry} color="#8a6a48" y={0.3} />
      <PropInstances spots={bushes} geometry={bushGeometry} color="#5a9a4a" y={0.4} scale={BUSH_SCALE} />
      <ZoneStickerAnchor zoneId={zone.id} label={zone.label} height={0.5} />
    </group>
  )
}

/** World units per text cap-height; the plane width follows the text. */
const GROUND_TEXT_HEIGHT = 4.2

/**
 * Bold italic caps drawn on a canvas — no font download. Returns the texture and its aspect.
 * Letters are white; the material's opacity lets the ground show through.
 */
function groundTextTexture(text: string) {
  const fontPx = 160
  const tracking = fontPx * 0.06
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const font = `italic 900 ${fontPx}px "Arial Black", "Segoe UI Black", "Helvetica Neue", Arial, sans-serif`
  ctx.font = font
  const letters = [...text.toUpperCase()]
  const widths = letters.map((ch) => ctx.measureText(ch).width)
  const textW = widths.reduce((sum, w) => sum + w, 0) + tracking * (letters.length - 1)
  const pad = fontPx * 0.3
  canvas.width = Math.ceil(textW + pad * 2)
  canvas.height = Math.ceil(fontPx * 1.4)
  ctx.font = font
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'middle'
  let x = pad
  letters.forEach((ch, i) => {
    ctx.fillText(ch, x, canvas.height / 2)
    x += widths[i]! + tracking
  })
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return { texture, aspect: canvas.width / canvas.height }
}

/** Landmark name painted flat on the slab (e.g. "POULTRY ROAD"), readable from the default camera. */
function LabelZone({ zone }: { zone: MapZone }) {
  const { texture, aspect } = useMemo(() => groundTextTexture(zone.label), [zone.label])
  useEffect(() => () => texture.dispose(), [texture])
  const h = GROUND_TEXT_HEIGHT * 1.4
  return (
    <mesh
      position={[zone.position[0], 0.03, zone.position[1]]}
      rotation={[-Math.PI / 2, 0, zone.rotation]}
      renderOrder={1}
    >
      <planeGeometry args={[h * aspect, h]} />
      <meshBasicMaterial
        map={texture}
        color={zone.labelColor ?? '#ffffff'}
        transparent
        opacity={zone.labelColor ? 0.9 : 0.55}
        depthWrite={false}
        toneMapped={false}
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  )
}

// —— Billboards ——

type AdFace = { center: [number, number, number]; width: number; height: number; yaw: number }

/** Per model: native height, the yaw that turns the ad face to the default camera, and its ad faces. */
const BILLBOARDS: Record<string, { url: string; nativeHeight: number; groundY: number; turn: number; faces: AdFace[] }> = {
  // Pole at the origin, board faces −X; its back (x ≈ 5.9) gets the ad too so it reads from any angle
  billboard1: {
    url: '/models/billboard1.glb',
    nativeHeight: 39,
    groundY: 1,
    turn: Math.PI / 2,
    faces: [
      { center: [1.15, 30.25, 0], width: 32.2, height: 13.5, yaw: -Math.PI / 2 },
      { center: [6.0, 30.25, 0], width: 32.2, height: 13.5, yaw: Math.PI / 2 },
    ],
  },
  // One billboard split out of low-poly_billboard_pack.glb; double-faced board angled ~57°
  'billboard-pack': {
    url: '/models/billboard-pack.glb',
    nativeHeight: 685,
    groundY: 0,
    turn: 1.0,
    faces: [
      { center: [-18.5, 518.6, 11.9], width: 597, height: 333, yaw: Math.atan2(-0.8417, 0.5399) },
      { center: [18.5, 518.6, -11.9], width: 597, height: 333, yaw: Math.atan2(0.8417, -0.5399) },
    ],
  },
}
Object.values(BILLBOARDS).forEach((b) => useGLTF.preload(b.url))

/** World height of a billboard before the zone's scaleMul. */
const BILLBOARD_HEIGHT = 9

const boardTextures = new globalThis.Map<string, CanvasTexture>()
const adImages = new globalThis.Map<string, Promise<ImageBitmap>>()

/** fetch + createImageBitmap: decodes even when the tab is in the background. */
function loadAdImage(src: string) {
  let image = adImages.get(src)
  if (!image) {
    image = fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error(`ad image ${res.status}`)
        return res.blob()
      })
      .then((blob) => createImageBitmap(blob))
    image.catch(() => adImages.delete(src))
    adImages.set(src, image)
  }
  return image
}

function toTexture(canvas: HTMLCanvasElement) {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

const BOARD_PX = 512

/** Each numbered board's ad (from billboard-ads.ts), with its number plate. "Your ad here" until it loads. */
function useBoardTexture(zoneId: string, aspect: number) {
  const n = boardNumber(zoneId)
  const key = `${n}:${aspect.toFixed(2)}`
  const [texture, setTexture] = useState(() => {
    const ready = boardTextures.get(key)
    if (ready) return ready
    const placeholderKey = `placeholder:${key}`
    let placeholder = boardTextures.get(placeholderKey)
    if (!placeholder) {
      placeholder = toTexture(stampBoardNumber(drawAdPlaceholder(Math.round(BOARD_PX * aspect), BOARD_PX), n))
      boardTextures.set(placeholderKey, placeholder)
    }
    return placeholder
  })
  useEffect(() => {
    const ad = adForBoard(n)
    if (!ad) return
    const ready = boardTextures.get(key)
    if (ready) {
      setTexture(ready)
      return
    }
    let cancelled = false
    const w = Math.round(BOARD_PX * aspect)
    // A ready-made wide design wins; otherwise build one from the pop-up artwork
    loadAdImage(ad.boardImage ?? ad.image)
      .then((img) => {
        const art = ad.boardImage ? drawBoardImage(w, BOARD_PX, img, n) : drawBoardAd(w, BOARD_PX, ad.board, img, n)
        const done = boardTextures.get(key) ?? toTexture(art)
        boardTextures.set(key, done)
        if (!cancelled) setTexture(done)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [key, n, aspect])
  return texture
}

function AdFace({ zoneId, face }: { zoneId: string; face: AdFace }) {
  const texture = useBoardTexture(zoneId, face.width / face.height)
  return (
    <mesh position={face.center} rotation={[0, face.yaw, 0]}>
      <planeGeometry args={[face.width, face.height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}

function BillboardZone({ zone }: { zone: MapZone }) {
  const { modelY, scaleMul } = useZoneExtras()
  const config = BILLBOARDS[zone.model]!
  const gl = useThree((state) => state.gl)
  const { scene } = useGLTF(config.url)
  useLayoutEffect(() => {
    applyGlbTextureAnisotropy(scene, gl)
  }, [scene, gl])
  const prepared = useMemo(() => {
    const root = scene.clone(true)
    shadeMeshes(root)
    return root
  }, [scene])
  const scale = (BILLBOARD_HEIGHT / config.nativeHeight) * scaleMul
  const [w, d] = zone.footprint
  return (
    <group position={[zone.position[0], modelY, zone.position[1]]} rotation={[0, zone.rotation, 0]}>
      <group rotation={[0, config.turn, 0]} scale={scale} position={[0, config.groundY * scale, 0]}>
        <primitive object={prepared} />
        {config.faces.map((face, i) => (
          <AdFace key={i} zoneId={zone.id} face={face} />
        ))}
      </group>
      {/* Tap anywhere on the billboard to see the ad */}
      <mesh
        position={[0, BILLBOARD_HEIGHT * scaleMul * 0.5, 0]}
        visible={false}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation()
          openAd(zone.id)
        }}
      >
        <boxGeometry args={[w, BILLBOARD_HEIGHT * scaleMul, Math.max(d, 2)]} />
      </mesh>
    </group>
  )
}

/** Invisible hit box over a second-slab zone — tapping selects it (the camera glides over). */
function ZoneTapTarget({ zone }: { zone: MapZone }) {
  const { select } = useGame()
  const [w, d] = zone.footprint
  return (
    <mesh
      position={[zone.position[0], 4, zone.position[1]]}
      rotation={[0, zone.rotation, 0]}
      visible={false}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation()
        select(zone.id)
      }}
    >
      <boxGeometry args={[w * 1.1, 8, d * 1.1]} />
    </mesh>
  )
}

/** Suspense fallback only — no drei `<Html>` (unmount during load causes React root races). */
function ZoneFallback({ zone }: { zone: MapZone }) {
  const [fw, fd] = zone.footprint
  const bare =
    zone.model === 'parking-lot' ||
    zone.model === 'football-stadium' ||
    zone.model === 'aau-gate' ||
    zone.model === 'label' ||
    zone.model.startsWith('billboard') ||
    zone.model === 'cluster' ||
    Boolean(zone.open)
  return (
    <group position={[zone.position[0], 0, zone.position[1]]}>
      {bare ? null : <Pad w={fw} d={fd} />}
    </group>
  )
}

function ZoneMesh({ zone }: { zone: MapZone }) {
  if (zone.open) return <OpenZone zone={zone} />
  if (BILLBOARDS[zone.model]) return <BillboardZone zone={zone} />
  if (zone.model === 'label') return <LabelZone zone={zone} />
  if (zone.parts) return <ClusterZone zone={zone} />
  if (zone.model === 'aau-gate' || zone.id === 'aau-gate') return <AauGateZone zone={zone} />
  const customUrl = CUSTOM_GLB[zone.model]
  if (customUrl) return <CustomGlbZone zone={zone} url={customUrl} />
  if (zone.model === 'admin-block' || zone.id === 'admin-block') return <AdminZone zone={zone} />
  if (zone.model === 'hostel-block') return <HostelZone zone={zone} />
  if (zone.model === 'parking-lot') return <ParkingZone zone={zone} />
  if (zone.model === 'football-stadium') return <StadiumZone zone={zone} />
  if (zone.model === 'pad') return <PadZone zone={zone} />
  return <KenneyZone zone={zone} />
}

function ZoneRoot({ zone }: { zone: MapZone }) {
  const p = useZonePlacement(zone.id, zone)
  const effective = useMemo(
    () => ({
      ...zone,
      position: [p.x, p.z] as [number, number],
      rotation: p.rotation,
    }),
    [zone, p.x, p.z, p.rotation],
  )
  return (
    <ZoneExtrasProvider modelY={p.modelY} scaleMul={p.scaleMul}>
      <Suspense fallback={<ZoneFallback zone={effective} />}>
        <ZoneMesh zone={effective} />
      </Suspense>
      {(effective.slab === 'south' || placeFor(effective.id)) && effective.model !== 'label' && !effective.model.startsWith('billboard') ? (
        <ZoneTapTarget zone={effective} />
      ) : null}
    </ZoneExtrasProvider>
  )
}

export function WorldZones() {
  const zones = useMemo(() => MAP_ZONES, [])
  return (
    <ZoneStickerRegistry>
      <group>
        {zones.map((zone) => (
          <ZoneRoot key={zone.id} zone={zone} />
        ))}
      </group>
    </ZoneStickerRegistry>
  )
}
