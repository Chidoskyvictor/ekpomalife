'use client'

import { useLayoutEffect, useMemo } from 'react'
import {
  Box3,
  CanvasTexture,
  Color,
  DoubleSide,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  Vector2,
  Vector4,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  type Texture,
} from 'three'
import { floorColours, type HomeDecor } from '@/lib/game/home-decor'
import type { GfxSettings } from '@/lib/game/gfx-quality'
import type { RoomLayout } from '@/lib/game/room-layouts'

/*
 * Surfaces for the home GLBs (which are flat-colour, untextured): small generated tileable
 * textures (wood planks, tiles, grass, brick speckle), mapped in WORLD space so they run
 * continuously across the many separate floor-tile meshes whatever their UVs. No downloads.
 * Each material is a shared, reference-counted clone; the GLB's own materials are never edited.
 */

type Kind = 'wood' | 'tile' | 'grass' | 'brick'

const rand = (seed: number) => {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Draw a tileable pattern; everything stays inside the canvas so repeats are seamless. */
function draw(kind: Kind, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  const r = rand(kind.length * 977 + size)
  if (kind === 'wood') {
    // 1m x 1m: four planks (running along x), staggered end joints, faint grain
    const rows = 4
    const h = size / rows
    for (let i = 0; i < rows; i++) {
      const v = 0.9 + r() * 0.1
      g.fillStyle = `rgb(${v * 255 | 0},${v * 255 | 0},${v * 255 | 0})`
      g.fillRect(0, i * h, size, h)
      for (let k = 0; k < size / 5; k++) {
        g.fillStyle = `rgba(90,60,30,${0.03 + r() * 0.06})`
        g.fillRect(r() * size, i * h + 2 + r() * (h - 4), size * (0.15 + r() * 0.4), Math.max(1, size / 128))
      }
      const joint = r() * size
      g.fillStyle = 'rgba(60,36,16,0.30)'
      g.fillRect(joint, i * h, Math.max(1, size / 96), h)
      g.fillStyle = 'rgba(60,36,16,0.22)'
      g.fillRect(0, i * h, size, Math.max(1, size / 96))
    }
  } else if (kind === 'tile') {
    // One 0.5m tile with grout on its edges (the texture repeats every half metre)
    g.fillStyle = '#fff'
    g.fillRect(0, 0, size, size)
    for (let k = 0; k < size * 3; k++) {
      g.fillStyle = `rgba(0,0,0,${r() * 0.045})`
      g.fillRect(r() * size, r() * size, 2, 2)
    }
    const e = Math.max(2, size / 40)
    g.fillStyle = 'rgba(70,64,56,0.55)'
    g.fillRect(0, 0, size, e)
    g.fillRect(0, 0, e, size)
    g.fillStyle = 'rgba(255,255,255,0.35)'
    g.fillRect(e, e, size - e, 1)
  } else if (kind === 'grass') {
    g.fillStyle = '#d8d8d8'
    g.fillRect(0, 0, size, size)
    for (let k = 0; k < size * 2; k++) {
      const v = 150 + r() * 105
      g.fillStyle = `rgba(${v},${v},${v},0.45)`
      const x = r() * size
      const y = r() * size
      g.fillRect(x, y, 1 + r() * 2, 2 + r() * 4)
    }
  } else {
    g.fillStyle = '#ececec'
    g.fillRect(0, 0, size, size)
    for (let k = 0; k < size * 2; k++) {
      const v = 150 + r() * 100
      g.fillStyle = `rgba(${v},${v},${v},0.5)`
      g.fillRect(r() * size, r() * size, 1 + r() * 2, 1 + r() * 2)
    }
  }
  return canvas
}

const textures = new Map<string, Texture>()
function textureFor(kind: Kind, size: number, anisotropy: number): Texture {
  const key = `${kind}:${size}:${anisotropy}`
  let t = textures.get(key)
  if (!t) {
    t = new CanvasTexture(draw(kind, size))
    t.wrapS = t.wrapT = RepeatWrapping
    t.colorSpace = SRGBColorSpace
    t.minFilter = LinearMipmapLinearFilter
    t.anisotropy = anisotropy
    textures.set(key, t)
  }
  return t
}

/** Texture repeats per metre, roughness. */
const KIND: Record<Kind, { scale: number; roughness: number }> = {
  wood: { scale: 1, roughness: 0.62 },
  tile: { scale: 2, roughness: 0.38 },
  grass: { scale: 0.45, roughness: 0.95 },
  brick: { scale: 3, roughness: 0.88 },
}

type Entry = { material: MeshStandardMaterial; users: number }
const cache = new Map<string, Entry>()
const keyOf = new WeakMap<Material, string>()

function surface(source: Material, kind: Kind, colour: string, gfx: GfxSettings): MeshStandardMaterial {
  const key = `${source.uuid}:${kind}:${colour}:${gfx.textureSize}`
  let entry = cache.get(key)
  if (!entry) {
    const material = (source as MeshStandardMaterial).clone()
    const { scale, roughness } = KIND[kind]
    material.map = textureFor(kind, gfx.textureSize, gfx.anisotropy)
    material.color = new Color(colour)
    material.roughness = roughness
    material.metalness = 0
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTexScale = { value: scale }
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec2 vWorldXZ;\nvoid main() {')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldXZ = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;')
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'varying vec2 vWorldXZ;\nuniform float uTexScale;\nvoid main() {')
        .replace('#include <map_fragment>', '#ifdef USE_MAP\n diffuseColor *= texture2D( map, vWorldXZ * uTexScale );\n#endif')
    }
    material.customProgramCacheKey = () => `surface-${kind}`
    entry = { material, users: 0 }
    cache.set(key, entry)
    keyOf.set(material, key)
  }
  entry.users++
  return entry.material
}

function release(material: Material) {
  const key = keyOf.get(material)
  const entry = key ? cache.get(key) : undefined
  if (!entry || --entry.users > 0) return
  cache.delete(key!)
  keyOf.delete(material)
  entry.material.dispose()
}

/** Default looks when the player hasn't bought a floor: warm oak for rooms, cream tile for kitchen & bath. */
const DEFAULT_FLOOR: [string, string] = ['#dcb077', '#d4a66e']
const DEFAULT_TILES: [string, string] = ['#f7f1e6', '#ece3d3']

/** Floor and kitchen & bath tile materials in the home GLBs; each pair alternates as a checker. */
export const FLOOR_MATS: Record<string, { zone: 'floor' | 'tiles'; step: number }> = {
  RoomTile0: { zone: 'floor', step: 0 },
  RoomTile1: { zone: 'floor', step: 1 },
  ParlourTile0: { zone: 'floor', step: 0 },
  ParlourTile1: { zone: 'floor', step: 1 },
  BedTile0: { zone: 'floor', step: 0 },
  BedTile1: { zone: 'floor', step: 1 },
  KitchenTile0: { zone: 'tiles', step: 0 },
  KitchenTile1: { zone: 'tiles', step: 1 },
  BathTile0: { zone: 'tiles', step: 0 },
  BathTile1: { zone: 'tiles', step: 1 },
  // The single room's wooden floor: five planks, blended from one colour to the other
  Plank: { zone: 'floor', step: 0 },
  'Plank.001': { zone: 'floor', step: 0.25 },
  'Plank.002': { zone: 'floor', step: 0.5 },
  'Plank.003': { zone: 'floor', step: 0.75 },
  'Plank.004': { zone: 'floor', step: 1 },
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (s: number) => Math.round(((pa >> s) & 0xff) * (1 - t) + ((pb >> s) & 0xff) * t).toString(16).padStart(2, '0')
  return `#${ch(16)}${ch(8)}${ch(0)}`
}

const GRASS: Record<string, string> = { Grass: '#a4c777', GrassInner: '#b7d98c' }

/**
 * Textured floors (wood planks / tiles, tinted by the home's design), richer grass and speckled
 * pavers. Undone (and the shared copies released) on cleanup.
 */
export function useHomeSurfaces(root: Object3D, decor: HomeDecor | undefined, gfx: GfxSettings) {
  const floor = decor?.floor
  const tiles = decor?.tiles
  useLayoutEffect(() => {
    const picked = { floor: floorColours(floor) ?? DEFAULT_FLOOR, tiles: floorColours(tiles) ?? DEFAULT_TILES }
    // Wood-look unless a non-wood floor was bought for the main rooms
    const floorKind: Kind = !floor || floor === 'wood-parquet' ? 'wood' : 'tile'
    const swapped: [Mesh, Material][] = []
    root.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh || Array.isArray(mesh.material)) return
      const name = mesh.material.name
      let next: Material | undefined
      const slot = FLOOR_MATS[name]
      if (slot) {
        const pair = picked[slot.zone]
        next = surface(mesh.material, slot.zone === 'floor' ? floorKind : 'tile', mix(pair[0], pair[1], slot.step), gfx)
      } else if (GRASS[name]) {
        next = surface(mesh.material, 'grass', GRASS[name], gfx)
      } else if (name.startsWith('Paver')) {
        const base = '#' + (mesh.material as MeshStandardMaterial).color.getHexString()
        next = surface(mesh.material, 'brick', mix(base, '#c08f6e', 0.3), gfx)
      }
      if (!next) return
      swapped.push([mesh, mesh.material])
      mesh.material = next
    })
    return () => {
      for (const [mesh, original] of swapped) {
        release(mesh.material as Material)
        mesh.material = original
      }
    }
  }, [root, floor, tiles, gfx])
}

/** Top of the GLB's floor meshes (so the AO sheet sits just above it). */
function floorTop(root: Object3D): number {
  let top = 0
  const box = new Box3()
  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh || Array.isArray(mesh.material) || !FLOOR_MATS[mesh.material.name]) return
    top = Math.max(top, box.setFromObject(mesh).max.y)
  })
  return top - root.position.y
}

const AO_VERTEX = /* glsl */ `
uniform vec2 uCenter;
varying vec2 vXZ;
void main() {
  // The sheet lies flat (rotated -90deg about x): local y runs along -z in the home's own coordinates
  vXZ = vec2(uCenter.x + position.x, uCenter.y - position.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const AO_FRAGMENT = /* glsl */ `
uniform vec4 uRects[8];
uniform int uCount;
uniform float uReach;
uniform float uStrength;
varying vec2 vXZ;
void main() {
  float best = -1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uCount) break;
    vec4 r = uRects[i];
    float d = min(min(vXZ.x - r.x, r.z - vXZ.x), min(vXZ.y - r.y, r.w - vXZ.y));
    best = max(best, d);
  }
  if (best < 0.0) discard;
  float a = (1.0 - smoothstep(0.0, uReach, best)) * uStrength;
  gl_FragColor = vec4(0.07, 0.04, 0.02, a);
}`

/**
 * Soft darkening where the floor meets the walls: a baked-look ambient-occlusion sheet,
 * one quad and one cheap shader per home (no render passes), so it runs on every tier.
 */
export function FloorAO({ layout, root, strength = 0.42 }: { layout: RoomLayout; root: Object3D; strength?: number }) {
  const y = useMemo(() => floorTop(root) + 0.012, [root])
  // The walkable rects stop short of the walls; grow them back to the wall faces
  const pad = 0.34
  const { rects, box } = useMemo(() => {
    const list = layout.floors.slice(0, 8).map(([x0, z0, x1, z1]) => new Vector4(x0 - pad, z0 - pad, x1 + pad, z1 + pad))
    const x0 = Math.min(...list.map((r) => r.x))
    const z0 = Math.min(...list.map((r) => r.y))
    const x1 = Math.max(...list.map((r) => r.z))
    const z1 = Math.max(...list.map((r) => r.w))
    return { rects: list, box: [x0, z0, x1, z1] as const }
  }, [layout])
  const uniforms = useMemo(
    () => ({
      uCenter: { value: new Vector2((box[0] + box[2]) / 2, (box[1] + box[3]) / 2) },
      uRects: { value: [...rects, ...Array.from({ length: 8 - rects.length }, () => new Vector4())] },
      uCount: { value: rects.length },
      uReach: { value: 0.95 },
      uStrength: { value: strength },
    }),
    [rects, box, strength],
  )
  return (
    <mesh position={[(box[0] + box[2]) / 2, y, (box[1] + box[3]) / 2]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2} raycast={() => null}>
      <planeGeometry args={[box[2] - box[0], box[3] - box[1]]} />
      <shaderMaterial
        vertexShader={AO_VERTEX}
        fragmentShader={AO_FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={DoubleSide}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </mesh>
  )
}
