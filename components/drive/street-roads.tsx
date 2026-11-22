'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Matrix4,
  MeshLambertMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Vector2,
  Vector3,
  MeshStandardMaterial,
  type Texture,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { BARRIER_AT, DEAD_ENDS, GANTRIES, HALF, ROAD_DIMS, SCENE_ROADS, roadById, spotAt } from '@/lib/game/drive-road'
import { buildRoadChunks, type Buf } from '@/lib/game/road-mesh'
import { mulberry32 } from '@/lib/game/world-layout'

/*
 * Road surfaces and what stands on them: concrete laid slab by slab (a generated texture, one tiny
 * canvas), kerbs, pavements and paint cut into 250 m chunks, dark steel gantries with green area
 * signs, and barriers + cones closing every unbuilt road. All of it is merged geometry: a handful
 * of draw calls near you, none far away.
 */

/** Dark concrete: 2 lanes wide × 20 m long, four slabs deep, each slab a slightly different shade. */
function slabTexture() {
  const w = 256
  const h = 1024
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const rand = mulberry32(7)
  const cols = 2
  const rows = 4
  const cw = w / cols
  const rh = h / rows
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = 46 + Math.round((rand() - 0.5) * 20) // very dark grey, each slab its own shade
      const img = ctx.createImageData(cw, rh)
      for (let i = 0; i < img.data.length; i += 4) {
        const n = v + Math.round((rand() - 0.5) * 9)
        img.data[i] = n
        img.data[i + 1] = n + 1
        img.data[i + 2] = n + 3
        img.data[i + 3] = 255
      }
      ctx.putImageData(img, c * cw, r * rh)
      // Faint tyre-polished streaks along the slab
      ctx.fillStyle = `rgba(0,0,0,${0.05 + rand() * 0.05})`
      ctx.fillRect(c * cw + cw * 0.22, r * rh, cw * 0.14, rh)
      ctx.fillRect(c * cw + cw * 0.66, r * rh, cw * 0.14, rh)
    }
  }
  // Joints: dark lines between slabs, a touch of light on the lip below each
  ctx.fillStyle = '#0b0c0d'
  for (let r = 0; r < rows; r++) ctx.fillRect(0, r * rh, w, 4)
  for (let c = 0; c < cols; c++) ctx.fillRect(c * cw, 0, 3, h)
  ctx.fillStyle = 'rgba(255,255,255,0.16)'
  for (let r = 0; r < rows; r++) ctx.fillRect(0, r * rh + 4, w, 2)
  const tex = new CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 4
  return tex
}


type SlabMaps = { color: CanvasTexture; normal: CanvasTexture; rough: CanvasTexture }

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

/**
 * Real scanned concrete (ambientCG Concrete034, CC0: public/textures/CREDITS.md), cut into slabs:
 * every slab takes its own random patch of the photo and its own dark tint, joints are drawn between
 * them, and the lanes get oil stains and darker tyre lines. Colour, normal and roughness are cut the
 * same way. Null (the code-drawn slabs are used) if the photos do not load.
 */
async function loadSlabMaps(): Promise<SlabMaps | null> {
  try {
    const [c, n, r] = await Promise.all(['color', 'normal', 'rough'].map((k) => loadImage(`/textures/road/concrete-${k}.webp`)))
    const W = 512
    const H = 2048
    const cols = 2
    const rows = 4
    const cw = W / cols
    const rh = H / rows
    const make = () => {
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      return canvas
    }
    const [cc, nc, rc] = [make(), make(), make()]
    const [cx, nx, rx] = [cc.getContext('2d')!, nc.getContext('2d')!, rc.getContext('2d')!]
    const rand = mulberry32(11)
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // The same random patch (and flip) of the photo for all three maps
        const size = 512
        const sx = Math.floor(rand() * (1024 - size))
        const sy = Math.floor(rand() * (1024 - size))
        for (const [ctx, img] of [[cx, c], [nx, n], [rx, r]] as const) ctx.drawImage(img, sx, sy, size, size, col * cw, row * rh, cw, rh)
        // Each slab its own very dark grey
        // Flatten the photo's big blotches toward one mid-grey, so slabs differ only a little
        cx.fillStyle = 'rgba(96,96,98,0.86)'
        cx.fillRect(col * cw, row * rh, cw, rh)
        const v = 116 + Math.round(rand() * 14)
        cx.globalCompositeOperation = 'multiply'
        cx.fillStyle = `rgb(${v},${v + 1},${v + 3})`
        cx.fillRect(col * cw, row * rh, cw, rh)
        cx.globalCompositeOperation = 'source-over'
      }
    }
    // Each patch of the scan leans a little: level the normals so slabs do not light differently
    nx.fillStyle = 'rgba(128,128,255,0.6)'
    nx.fillRect(0, 0, W, H)
    // Dry concrete is rough: pull every slab's roughness toward one high value so none shines
    rx.fillStyle = 'rgba(225,225,225,0.7)'
    rx.fillRect(0, 0, W, H)
    // Wear on the colour map: a darker tyre line each side of every lane's centre, and oil stains
    const lane = W / 2
    for (let l = 0; l < 2; l++) {
      for (const t of [-0.24, 0.24]) {
        const g = cx.createLinearGradient((l + 0.5 + t - 0.05) * lane, 0, (l + 0.5 + t + 0.05) * lane, 0)
        g.addColorStop(0, 'rgba(0,0,0,0)')
        g.addColorStop(0.5, 'rgba(0,0,0,0.30)')
        g.addColorStop(1, 'rgba(0,0,0,0)')
        cx.fillStyle = g
        cx.fillRect((l + 0.5 + t - 0.05) * lane, 0, 0.1 * lane, H)
      }
    }
    for (let i = 0; i < 14; i++) {
      const x = (Math.floor(rand() * 2) + 0.5 + (rand() - 0.5) * 0.3) * lane
      const y = rand() * H
      const rad = 14 + rand() * 26
      const g = cx.createRadialGradient(x, y, 0, x, y, rad)
      g.addColorStop(0, 'rgba(0,0,0,0.5)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      cx.fillStyle = g
      cx.beginPath()
      cx.ellipse(x, y, rad * 0.8, rad * 1.5, 0, 0, Math.PI * 2)
      cx.fill()
    }
    // Joints (colour darker; the roughness map keeps them rough)
    cx.fillStyle = '#060606'
    for (let row = 0; row < rows; row++) cx.fillRect(0, row * rh, W, 5)
    for (let col = 0; col < cols; col++) cx.fillRect(col * cw, 0, 4, H)
    cx.fillStyle = 'rgba(255,255,255,0.12)'
    for (let row = 0; row < rows; row++) cx.fillRect(0, row * rh + 5, W, 2)
    const tex = (canvas: HTMLCanvasElement, srgb: boolean) => {
      const t = new CanvasTexture(canvas)
      t.wrapS = t.wrapT = RepeatWrapping
      t.anisotropy = 4
      if (srgb) t.colorSpace = SRGBColorSpace
      return t
    }
    return { color: tex(cc, true), normal: tex(nc, false), rough: tex(rc, false) }
  } catch {
    return null
  }
}

function geometryOf(b: Buf, withUv: boolean) {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(b.pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(b.nor, 3))
  g.setAttribute('color', new Float32BufferAttribute(b.col, 3))
  if (withUv) g.setAttribute('uv', new Float32BufferAttribute(b.uv, 2))
  g.setIndex(b.idx)
  g.computeBoundingSphere()
  return g
}

/** Every road's surface, in chunks. `level` brightens the paint a little at night. */
export function Roads({ level }: { level: 'day' | 'dusk' | 'night' }) {
  const [kit, setKit] = useState<ReturnType<typeof makeRoads> | null>(null)
  // Built a moment after the scene appears, so the drive does not freeze while the roads are laid
  useEffect(() => {
    let dead = false
    void loadSlabMaps().then((maps) => {
      if (!dead) window.setTimeout(() => !dead && setKit(makeRoads(maps)), 40)
    })
    return () => {
      dead = true
    }
  }, [])
  useEffect(() => {
    kit?.lineMat.emissive.set(level === 'night' ? '#5a584a' : level === 'dusk' ? '#3a3930' : '#2a2a22')
  }, [kit, level])
  useEffect(
    () => () => {
      if (!kit) return
      for (const p of kit.parts) {
        p.slab.dispose()
        p.solid.dispose()
        p.line.dispose()
      }
      kit.slabTex.dispose()
      kit.maps?.normal.dispose()
      kit.maps?.rough.dispose()
      kit.slabMat.dispose()
      kit.solidMat.dispose()
      kit.lineMat.dispose()
    },
    [kit],
  )
  if (!kit) return null
  return (
    <>
      {kit.parts.map((p, i) => (
        <group key={i}>
          {p.slab.attributes.position!.count ? <mesh geometry={p.slab} material={kit.slabMat} /> : null}
          {p.solid.attributes.position!.count ? <mesh geometry={p.solid} material={kit.solidMat} /> : null}
          {p.line.attributes.position!.count ? <mesh geometry={p.line} material={kit.lineMat} /> : null}
        </group>
      ))}
    </>
  )
}

function makeRoads(maps: SlabMaps | null) {
  const slabTex = maps?.color ?? slabTexture()
  const parts = [...buildRoadChunks(SCENE_ROADS).values()].map((c) => ({
    slab: geometryOf(c.slab, true),
    solid: geometryOf(c.solid, false),
    line: geometryOf(c.line, false),
  }))
  return {
    parts,
    slabTex,
    maps,
    slabMat: new MeshStandardMaterial({ map: slabTex, normalMap: maps?.normal, normalScale: new Vector2(0.7, 0.7), roughnessMap: maps?.rough, roughness: 1, metalness: 0, side: DoubleSide }),
    solidMat: new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }),
    lineMat: new MeshLambertMaterial({ vertexColors: true, side: DoubleSide, emissive: '#2a2a22', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  }
}

/* —— small helpers to merge boxes into one geometry —— */

function paint(g: BufferGeometry, color: string) {
  const c = new Vector3(parseInt(color.slice(1, 3), 16) / 255, parseInt(color.slice(3, 5), 16) / 255, parseInt(color.slice(5, 7), 16) / 255)
  const n = g.attributes.position!.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    arr[i * 3] = Math.pow(c.x, 2.2)
    arr[i * 3 + 1] = Math.pow(c.y, 2.2)
    arr[i * 3 + 2] = Math.pow(c.z, 2.2)
  }
  g.setAttribute('color', new Float32BufferAttribute(arr, 3))
  return g
}

/** A box in world space: size, centre, and yaw. */
function box(w: number, h: number, d: number, x: number, y: number, z: number, yaw: number, color: string, tilt = 0) {
  const g = new BoxGeometry(w, h, d)
  g.applyMatrix4(new Matrix4().makeRotationZ(tilt))
  g.applyMatrix4(new Matrix4().makeRotationY(yaw))
  g.translate(x, y, z)
  return paint(g.toNonIndexed(), color)
}

function merge(list: BufferGeometry[]) {
  const g = mergeGeometries(list, false)!
  g.computeBoundingSphere()
  return g
}

/* —— area signs on dark steel gantries —— */

const signCache = new Map<string, CanvasTexture>()
/** White bold capitals on highway green. */
function signTexture(text: string): Texture {
  let hit = signCache.get(text)
  if (!hit) {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 320
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#0a6b3d'
    ctx.fillRect(0, 0, 1024, 320)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 10
    ctx.strokeRect(16, 16, 992, 288)
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    let size = 150
    do {
      ctx.font = `800 ${size}px Arial, Helvetica, sans-serif`
      size -= 6
    } while (ctx.measureText(text).width > 900 && size > 40)
    ctx.fillText(text, 512, 164)
    hit = new CanvasTexture(canvas)
    hit.colorSpace = SRGBColorSpace
    hit.anisotropy = 4
    signCache.set(text, hit)
  }
  return hit
}

const STEEL = '#2b3036'

/** An overhead gantry across the road with a green sign facing the traffic that comes along `dir`. */
export function Gantries() {
  const kit = useMemo(() => {
    const steel: BufferGeometry[] = []
    const faces = new Map<string, BufferGeometry[]>()
    const scene = new Set(SCENE_ROADS.map((r) => r.id))
    for (const g of GANTRIES) {
      if (!scene.has(g.road)) continue
      const road = roadById(g.road)
      const d = ROAD_DIMS[road.kind]
      const here = spotAt(g.road, g.s, 0)
      const yaw = Math.atan2(here.dx, here.dz)
      const half = HALF[road.kind] + d.kerb + d.pave * 0.55
      // Local frame: +z along the road (up s), +x to the left of travel; world = rotate by yaw, then move
      const at = (lx: number, y: number, lz: number): [number, number, number] => [here.x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, y, here.z - Math.sin(yaw) * lx + Math.cos(yaw) * lz]
      const put = (w: number, h: number, dd: number, lx: number, y: number, lz: number, color = STEEL, tilt = 0) => {
        const p = at(lx, y, lz)
        steel.push(box(w, h, dd, p[0], p[1], p[2], yaw, color, tilt))
      }
      // Posts either side, two chords across, struts and diagonals between them
      for (const sx of [-half, half]) put(0.55, 7.2, 0.55, sx, 3.6, 0, STEEL)
      put(half * 2 + 1, 0.22, 0.5, 0, 6.15, 0)
      put(half * 2 + 1, 0.22, 0.5, 0, 5.15, 0)
      const bays = Math.max(6, Math.round(half / 1.4))
      for (let i = 0; i <= bays * 2; i++) {
        const lx = -half + (half * 2 * i) / (bays * 2)
        put(0.12, 1.0, 0.12, lx, 5.65, 0)
      }
      // Sign: over the lanes of the traffic it faces, standing proud of the truss on the side they approach from
      const lanes = d.lane * d.lanes
      const centre = (d.inner + lanes / 2) * g.dir
      const width = Math.min(9.5, lanes * 0.92)
      const faceZ = -g.dir * 0.34
      put(width + 0.3, 2.9, 0.12, -centre, 6.7, faceZ * 0.9, '#1d2227')
      const plane = new PlaneGeometry(width, 2.6)
      // The plane faces +z by default; turn it to look back at the oncoming traffic
      plane.applyMatrix4(new Matrix4().makeRotationY(g.dir > 0 ? Math.PI : 0))
      plane.applyMatrix4(new Matrix4().makeRotationY(yaw))
      const p = at(-centre, 6.7, faceZ * 1.35)
      plane.translate(p[0], p[1], p[2])
      if (!faces.has(g.text)) faces.set(g.text, [])
      faces.get(g.text)!.push(plane)
      // Little brackets from the truss to the sign
      for (const k of [-0.32, 0.32]) put(0.14, 1.9, 0.5, -centre + width * k, 6.2, faceZ * 0.5)
    }
    return {
      steel: steel.length ? merge(steel) : null,
      steelMat: new MeshLambertMaterial({ vertexColors: true }),
      signs: [...faces].map(([text, list]) => ({ text, geo: merge(list.map((g) => g.toNonIndexed())) })),
    }
  }, [])
  const textures = useMemo(() => kit.signs.map((s) => signTexture(s.text)), [kit])
  useEffect(
    () => () => {
      kit.steel?.dispose()
      kit.steelMat.dispose()
      kit.signs.forEach((s) => s.geo.dispose())
    },
    [kit],
  )
  return (
    <>
      {kit.steel ? <mesh geometry={kit.steel} material={kit.steelMat} /> : null}
      {kit.signs.map((s, i) => (
        <mesh key={s.text} geometry={s.geo}>
          <meshBasicMaterial map={textures[i]} toneMapped={false} side={DoubleSide} />
        </mesh>
      ))}
    </>
  )
}

/* —— closed roads: barriers and cones —— */

const RED = '#d9322b'
const WHITE = '#f2f0e8'

/** Barriers across every unbuilt road end, with cones in front: nothing invisible, nothing to fall into. */
export function Barriers() {
  const kit = useMemo(() => {
    const parts: BufferGeometry[] = []
    const scene = new Set(SCENE_ROADS.map((r) => r.id))
    const rand = mulberry32(31)
    for (const e of DEAD_ENDS) {
      if (!scene.has(e.road)) continue
      const kind = e.kind
      const reach = HALF[kind] + ROAD_DIMS[kind].kerb
      // Inward along the road is (dx, dz); across is its right-hand side
      const rx = -e.dz
      const rz = e.dx
      const yaw = Math.atan2(e.dx, e.dz)
      const centre = { x: e.x + e.dx * BARRIER_AT, z: e.z + e.dz * BARRIER_AT }
      const unit = 2.2
      const n = Math.ceil((reach * 2) / unit)
      const span = n * unit
      for (let i = 0; i < n; i++) {
        const o = -span / 2 + unit * (i + 0.5)
        const cx = centre.x + rx * o
        const cz = centre.z + rz * o
        // Two striped boards on two A-frame legs
        for (const [y, flip] of [[1.0, 0], [0.62, 1]] as const) {
          for (let k = 0; k < 6; k++) {
            const lo = -unit / 2 + (unit / 6) * (k + 0.5)
            parts.push(box(unit / 6, 0.2, 0.06, cx + rx * lo, y, cz + rz * lo, yaw, (k + flip) % 2 ? WHITE : RED))
          }
        }
        for (const lo of [-unit / 2 + 0.2, unit / 2 - 0.2]) {
          parts.push(box(0.07, 1.1, 0.07, cx + rx * lo, 0.55, cz + rz * lo, yaw, '#e9e7df'))
          parts.push(box(0.07, 0.07, 0.7, cx + rx * lo, 0.04, cz + rz * lo, yaw, '#e9e7df'))
        }
      }
      // An amber lamp on each end
      for (const sgn of [-1, 1]) parts.push(box(0.2, 0.2, 0.2, centre.x + rx * sgn * (span / 2 - 0.1), 1.25, centre.z + rz * sgn * (span / 2 - 0.1), yaw, '#ffb300'))
      // Cones staggered up the road toward the traffic
      const cones = Math.max(4, Math.round(reach))
      for (let i = 0; i < cones; i++) {
        const along = BARRIER_AT + 1.6 + (i % 3) * 2.2 + rand() * 0.4
        const across = -reach + ((i + 0.5) / cones) * reach * 2
        const g = new ConeGeometry(0.16, 0.7, 8)
        g.translate(0, 0.35, 0)
        const collar = new CylinderGeometry(0.115, 0.14, 0.12, 8)
        collar.translate(0, 0.38, 0)
        const base = new BoxGeometry(0.42, 0.04, 0.42)
        base.translate(0, 0.02, 0)
        const m = new Matrix4().makeTranslation(e.x + e.dx * along + rx * across, 0, e.z + e.dz * along + rz * across)
        for (const [geo, col] of [[g, '#ff6a13'], [collar, WHITE], [base, '#2a2a2a']] as const) {
          const ng = geo.toNonIndexed()
          ng.applyMatrix4(m)
          parts.push(paint(ng, col))
        }
      }
    }
    return { geo: parts.length ? merge(parts.map((p) => (p.index ? p.toNonIndexed() : p))) : null, mat: new MeshLambertMaterial({ vertexColors: true }) }
  }, [])
  useEffect(
    () => () => {
      kit.geo?.dispose()
      kit.mat.dispose()
    },
    [kit],
  )
  return kit.geo ? <mesh geometry={kit.geo} material={kit.mat} /> : null
}
