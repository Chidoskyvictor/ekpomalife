'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Material,
} from 'three'
import { driveTelemetry } from '@/lib/game/drive'
import { BUILDING_TILES } from '@/lib/game/drive-road'
import * as kit from './town-kit'
import { LANDMARKS, TILE_SIZE, WALLS, fillerLots, lampLots, landmarkLots, lotsFromFootprints, type Lot } from './town-lots'
import { makeSignAtlas } from './town-signs'

/*
 * The town, streamed: a ring of 250 m tiles around the car. A tile's buildings come from the real
 * OpenStreetMap footprints (fetched when the car gets near) plus filler where the map is empty, and
 * its street lamps. Everything is drawn as shared copies of a few dozen kit shapes whose copies are
 * rewritten as the car moves, so the whole town is a few dozen draw calls. Near buildings get the
 * full kit (awnings, signboards, barred windows, lit windows at night); far ones are plain blocks
 * that sink into the fog; new ones fade in with a dither instead of popping.
 */

const RADIUS = 340
const SHOP_VARIANTS = 12
const FADE_S = 1.4
/** Rewrite the copies once the car has moved this far from the last pass. */
const REBUILD_M = 18

type Level = 'day' | 'dusk' | 'night'

const loader = new TextureLoader()
function loadTex(url: string, repeat: boolean) {
  const t = loader.load(url)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  if (repeat) {
    t.wrapS = RepeatWrapping
    t.wrapT = RepeatWrapping
  }
  return t
}

/** One material for the whole town: plaster, zinc and signboards chosen per surface by a code in the mesh. */
function makeMaterial(uniforms: Record<string, { value: unknown }>) {
  const mat = new MeshLambertMaterial({ vertexColors: true })
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec2 aUv; attribute float aMat; attribute float aGlow; attribute vec3 aTint; attribute float aBorn;
uniform float uTime;
varying vec2 vUv2; varying float vMat; varying float vGlow; varying vec3 vTint; varying float vFade;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vUv2 = aUv; vMat = aMat; vGlow = aGlow; vTint = aTint; vFade = clamp((uTime - aBorn) / ${FADE_S.toFixed(1)}, 0.0, 1.0);`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uPlaster; uniform sampler2D uZinc; uniform sampler2D uSigns; uniform float uNight;
varying vec2 vUv2; varying float vMat; varying float vGlow; varying vec3 vTint; varying float vFade;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
if (vFade < 1.0 && vFade < fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;
if (vMat < 0.5) diffuseColor.rgb = vColor.rgb * vTint * texture2D(uPlaster, vUv2).rgb;
else if (vMat < 1.5) diffuseColor.rgb = vColor.rgb * texture2D(uZinc, vUv2).rgb;
else if (vMat < 2.5) diffuseColor.rgb = texture2D(uSigns, vUv2).rgb;
else if (vMat < 3.5) diffuseColor.rgb = vColor.rgb;
else diffuseColor.rgb = vColor.rgb * texture2D(uPlaster, vUv2).rgb;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  vec3 glowCol = (vMat > 1.5 && vMat < 2.5) ? diffuseColor.rgb * 1.15 : vec3(1.0, 0.78, 0.42);
  totalEmissiveRadiance += glowCol * vGlow * uNight;
  if (vMat < 0.5 || vMat > 3.5) totalEmissiveRadiance += diffuseColor.rgb * 0.16 * uNight;
}`,
      )
  }
  return mat
}

/** A soft round spot: white at the centre fading out. */
function glowTexture() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.4)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const t = new CanvasTexture(canvas)
  t.colorSpace = SRGBColorSpace
  return t
}

type Variant = { shape: kit.Shape; cap: number }

/** Every shape the town can draw, with how many copies of it may show at once. */
function buildVariants() {
  const v = new Map<string, Variant>()
  const add = (key: string, shape: kit.Shape, cap: number) => v.set(key, { shape, cap })
  for (let i = 0; i < SHOP_VARIANTS; i++) for (const f of [1, 2]) add(`shop:${i}:${f}`, kit.shop(i, f), 60)
  for (let i = 0; i < 4; i++) for (const f of [2, 3]) add(`block:${i}:${f}`, kit.block(i, f), 40)
  for (let i = 0; i < 3; i++) add(`kiosk:${i}`, kit.kiosk(i), 40)
  for (let i = 0; i < 4; i++) add(`bungalow:${i}`, kit.bungalow(i), 60)
  add('church', kit.church(), 12)
  add('mosque', kit.mosque(), 12)
  add('station', kit.station(), 12)
  add('lamp', kit.lamp(), 220)
  add('lamp2', kit.lampDouble(), 220)
  add('far', kit.farBlock(), 900)
  for (const l of LANDMARKS) {
    const shape =
      l.kind === 'church'
        ? kit.church(l.label)
        : l.kind === 'club'
          ? kit.club(l.label)
          : l.kind === 'academic'
            ? kit.academic(l.label)
            : l.kind === 'gateway'
              ? kit.gateway(l.label, '#1d6b45')
              : l.kind === 'station'
                ? kit.station(l.label, '#8c2f2f')
                : l.kind === 'block'
                  ? kit.block(0, 3)
                  : kit.shop(Math.abs(hashStr(l.id)) % SHOP_VARIANTS, 2)
    add(l.v, shape, 1)
  }
  return v
}

function hashStr(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return h
}

function makeMesh(shape: kit.Shape, cap: number, mat: Material) {
  const geo = shape.geo
  geo.setAttribute('aBorn', new InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(DynamicDrawUsage))
  geo.setAttribute('aTint', new InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(DynamicDrawUsage))
  const mesh = new InstancedMesh(geo, mat, cap)
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.frustumCulled = false
  mesh.count = 0
  mesh.visible = false
  return mesh
}

type TileData = { lots: Lot[] }

/** Streams the town around the car. `level` sets how lit it is (windows and signs glow at dusk and night). */
export function Town({ level }: { level: Level }) {
  const root = useMemo(() => new Object3D(), [])
  const sys = useMemo(() => {
    const uniforms = {
      uPlaster: { value: loadTex('/textures/town/plaster.jpg', true) },
      uZinc: { value: loadTex('/textures/town/zinc.jpg', true) },
      uSigns: { value: null as CanvasTexture | null },
      uNight: { value: 0 },
      uTime: { value: 0 },
    }
    const variants = buildVariants()
    uniforms.uSigns.value = makeSignAtlas()
    const mat = makeMaterial(uniforms)
    const meshes = new Map<string, InstancedMesh>()
    for (const [key, v] of variants) {
      const mesh = makeMesh(v.shape, v.cap, mat)
      meshes.set(key, mesh)
      root.add(mesh)
    }
    // Lamp glow: a halo round each lit head and a pool of light on the road under it
    const glow = glowTexture()
    const halo = new Points(
      new BufferGeometry(),
      new PointsMaterial({ map: glow, size: 7, sizeAttenuation: true, transparent: true, blending: AdditiveBlending, depthWrite: false, vertexColors: true, fog: false }),
    )
    halo.frustumCulled = false
    const poolGeo = new PlaneGeometry(16, 16)
    poolGeo.rotateX(-Math.PI / 2)
    const poolMat = new MeshBasicMaterial({ map: loader.load('/lights/lamp-pool.png'), color: '#ffb35c', transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false, fog: false })
    const pools = new InstancedMesh(poolGeo, poolMat, 220)
    pools.instanceMatrix.setUsage(DynamicDrawUsage)
    pools.instanceColor = new InstancedBufferAttribute(new Float32Array(220 * 3), 3).setUsage(DynamicDrawUsage)
    pools.frustumCulled = false
    pools.count = 0
    root.add(halo, pools)
    return { uniforms, mat, meshes, halo, pools, poolMat, glow, variants }
  }, [root])

  useEffect(
    () => () => {
      for (const m of sys.meshes.values()) {
        m.geometry.dispose()
        m.dispose()
      }
      sys.mat.dispose()
      sys.halo.geometry.dispose()
      ;(sys.halo.material as PointsMaterial).dispose()
      sys.pools.geometry.dispose()
      sys.poolMat.dispose()
      sys.glow.dispose()
      const u = sys.uniforms
      u.uPlaster.value.dispose()
      u.uZinc.value.dispose()
      u.uSigns.value?.dispose()
    },
    [sys],
  )

  useEffect(() => {
    sys.uniforms.uNight.value = level === 'night' ? 1 : level === 'dusk' ? 0.55 : 0
    sys.halo.visible = sys.pools.visible = level !== 'day'
    sys.poolMat.opacity = level === 'night' ? 0.36 : 0.18
  }, [level, sys])

  const st = useRef({
    foot: new Map<string, number[][] | 'loading' | 'none'>(),
    real: new Map<string, Lot[]>(),
    tiles: new Map<string, TileData>(),
    index: null as Record<string, number> | null,
    hash: new Map<number, Lot[]>(),
    lastX: 1e9,
    lastZ: 1e9,
    dirty: true,
    gen: 0,
    drawn: [] as Lot[],
    landmarks: landmarkLots(),
  })
  const [, bump] = useState(0)

  // Which tiles have footprints at all
  useEffect(() => {
    let dead = false
    void fetch(`${BUILDING_TILES.tiles}index.json`)
      .then((r) => r.json())
      .then((d: { tiles: Record<string, number> }) => {
        if (dead) return
        st.current.index = d.tiles
        st.current.dirty = true
        bump((n) => n + 1)
      })
      .catch(() => {
        st.current.index = {}
      })
    return () => {
      dead = true
    }
  }, [])

  const dummy = useMemo(() => new Object3D(), [])
  const tmpColor = useMemo(() => new Color(), [])

  useFrame(({ clock }) => {
    const s = st.current
    sys.uniforms.uTime.value = clock.elapsedTime
    if (!s.index) return
    const { x: px, z: pz } = driveTelemetry
    const moved = Math.hypot(px - s.lastX, pz - s.lastZ)
    if (moved < REBUILD_M && !s.dirty) return
    const ptx = Math.floor(px / TILE_SIZE)
    const ptz = Math.floor(pz / TILE_SIZE)
    const span = Math.ceil(RADIUS / TILE_SIZE)
    const key = (tx: number, tz: number) => `${tx}_${tz}`
    // Tiles by how close they are to the car; nearest first, so what you see arrives first
    const near: { tx: number; tz: number; d: number }[] = []
    for (let i = -span - 2; i <= span + 2; i++) {
      for (let j = -span - 2; j <= span + 2; j++) {
        const tx = ptx + i
        const tz = ptz + j
        const dx = Math.max(tx * TILE_SIZE - px, 0, px - (tx + 1) * TILE_SIZE)
        const dz = Math.max(tz * TILE_SIZE - pz, 0, pz - (tz + 1) * TILE_SIZE)
        near.push({ tx, tz, d: Math.hypot(dx, dz) })
      }
    }
    near.sort((a, b) => a.d - b.d)
    // Fetch footprints for the tiles around, with a margin so filler knows what is next door
    for (const { tx, tz, d } of near) {
      if (d > RADIUS + TILE_SIZE * 1.5) break
      const k = key(tx, tz)
      if (s.foot.has(k)) continue
      if (!s.index[k]) {
        s.foot.set(k, 'none')
        continue
      }
      s.foot.set(k, 'loading')
      void fetch(`${BUILDING_TILES.tiles}${k}.json`)
        .then((r) => r.json())
        .then((d2: { buildings: { ring: number[] }[] }) => {
          s.foot.set(k, d2.buildings.map((bd) => bd.ring))
          s.dirty = true
        })
        .catch(() => s.foot.set(k, 'none'))
    }
    // Make at most one tile's lots per frame
    let made = false
    for (const { tx, tz, d } of near) {
      if (made || d > RADIUS) break
      {
        const k = key(tx, tz)
        if (s.tiles.has(k)) continue
        const ready = [-1, 0, 1].every((a) => [-1, 0, 1].every((b) => s.foot.get(key(tx + a, tz + b)) !== 'loading' && s.foot.has(key(tx + a, tz + b))))
        if (!ready) continue
        // Real lots of this tile and its neighbours, for the filler to avoid
        for (const a of [-1, 0, 1]) {
          for (const b of [-1, 0, 1]) {
            const nk = key(tx + a, tz + b)
            if (s.real.has(nk)) continue
            const rings = s.foot.get(nk)
            const lots = Array.isArray(rings) ? lotsFromFootprints(rings, tx + a, tz + b) : []
            // Real buildings that would sit on one of our places make way for it
            const kept = lots.filter((l) => !s.landmarks.some((lm) => Math.hypot(lm.x - l.x, lm.z - l.z) < 24))
            s.real.set(nk, kept)
            for (const l of kept) {
              const hk = Math.floor(l.x / 30) * 100003 + Math.floor(l.z / 30)
              const arr = s.hash.get(hk)
              if (arr) arr.push(l)
              else s.hash.set(hk, [l])
            }
          }
        }
        const covered = (x: number, z: number, r: number) => {
          for (const lm of s.landmarks) if (Math.hypot(lm.x - x, lm.z - z) < r + 16) return true
          const cx = Math.floor(x / 30)
          const cz = Math.floor(z / 30)
          for (let a = -1; a <= 1; a++) {
            for (let b = -1; b <= 1; b++) {
              for (const l of s.hash.get((cx + a) * 100003 + cz + b) ?? []) if (Math.hypot(l.x - x, l.z - z) < r + Math.max(l.far[0], l.far[2]) * 0.4) return true
            }
          }
          return false
        }
        const lots = [...(s.real.get(k) ?? []), ...fillerLots(tx, tz, covered), ...lampLots(tx, tz)]
        s.tiles.set(k, { lots })
        made = true
        s.dirty = true
      }
    }
    if (!made && !s.dirty && moved < REBUILD_M) return
    s.dirty = false
    s.lastX = px
    s.lastZ = pz

    // Rewrite every shape's copies for what is within reach now
    s.gen++
    const now = clock.elapsedTime
    const counts = new Map<string, number>()
    const drawn: Lot[] = []
    const dark = level === 'day' ? 0.9 : 0.62
    const lamps: Lot[] = []
    const place = (lot: Lot, far: boolean) => {
      const key2 = far ? 'far' : lot.v
      const mesh = sys.meshes.get(key2)
      if (!mesh) return
      const n = counts.get(key2) ?? 0
      if (n >= (mesh.instanceMatrix.count ?? 0)) return
      counts.set(key2, n + 1)
      if (lot.born < 0) lot.born = now
      if (far) dummy.scale.set(lot.far[0] / 10, lot.far[1] / 10, lot.far[2] / 10)
      else dummy.scale.set(lot.sx, lot.sy, lot.sz)
      dummy.position.set(lot.x, 0, lot.z)
      dummy.rotation.set(0, lot.yaw, 0)
      dummy.updateMatrix()
      mesh.setMatrixAt(n, dummy.matrix)
      const c = WALLS[((lot.tint % WALLS.length) + WALLS.length) % WALLS.length]!
      const k = far ? dark : 1
      const tint = mesh.geometry.getAttribute('aTint') as InstancedBufferAttribute
      tint.setXYZ(n, c.r * k, c.g * k, c.b * k)
      ;(mesh.geometry.getAttribute('aBorn') as InstancedBufferAttribute).setX(n, lot.born)
      lot.gen = s.gen
      drawn.push(lot)
    }
    const R2 = RADIUS * RADIUS
    const visit = (lot: Lot) => {
      const dx = lot.x - px
      const dz = lot.z - pz
      const d2 = dx * dx + dz * dz
      if (d2 > R2) return
      if (lot.v === 'lamp' || lot.v === 'lamp2') {
        if (d2 < 220 * 220) {
          place(lot, false)
          lamps.push(lot)
        }
        return
      }
      place(lot, lot.plain === true || d2 > lot.near * lot.near)
    }
    for (let i = -span; i <= span; i++) for (let j = -span; j <= span; j++) for (const lot of s.tiles.get(key(ptx + i, ptz + j))?.lots ?? []) visit(lot)
    for (const lot of s.landmarks) visit(lot)
    for (const lot of s.drawn) if (lot.gen !== s.gen) lot.born = -1
    s.drawn = drawn
    for (const [key2, mesh] of sys.meshes) {
      const n = counts.get(key2) ?? 0
      mesh.count = n
      mesh.visible = n > 0
      mesh.instanceMatrix.needsUpdate = true
      ;(mesh.geometry.getAttribute('aTint') as InstancedBufferAttribute).needsUpdate = true
      ;(mesh.geometry.getAttribute('aBorn') as InstancedBufferAttribute).needsUpdate = true
    }

    // Lamp halos and pools
    if (level !== 'day') {
      const pos: number[] = []
      const col: number[] = []
      let np = 0
      for (const l of lamps) {
        // Heads: the single lamp's arm reaches 3.4 m; the middle lamp has an arm each way, 6 m out
        const heads = l.v === 'lamp2' ? [6, -6] : [3.4]
        for (const reach of heads) {
          const hx = l.x + Math.sin(l.yaw) * reach
          const hz = l.z + Math.cos(l.yaw) * reach
          const d = Math.hypot(hx - px, hz - pz)
          const fade = Math.max(0, Math.min(1, 1 - (d - 110) / 90))
          if (fade <= 0 || np >= 220) continue
          pos.push(hx, 8.6, hz)
          tmpColor.setRGB(1, 0.7, 0.36).multiplyScalar(fade * (level === 'night' ? 1 : 0.55))
          col.push(tmpColor.r, tmpColor.g, tmpColor.b)
          dummy.position.set(hx, 0.07, hz)
          dummy.rotation.set(0, 0, 0)
          dummy.scale.set(1, 1, 1)
          dummy.updateMatrix()
          sys.pools.setMatrixAt(np, dummy.matrix)
          sys.pools.setColorAt(np, tmpColor.setRGB(fade, fade, fade))
          np++
        }
      }
      sys.halo.geometry.setAttribute('position', new Float32BufferAttribute(pos, 3))
      sys.halo.geometry.setAttribute('color', new Float32BufferAttribute(col, 3))
      sys.pools.count = np
      sys.pools.instanceMatrix.needsUpdate = true
      if (sys.pools.instanceColor) sys.pools.instanceColor.needsUpdate = true
    }
  })

  return <primitive object={root} />
}
