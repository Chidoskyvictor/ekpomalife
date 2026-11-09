import {
  BufferAttribute,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PMREMGenerator,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
  type Texture,
  type WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/**
 * One place that turns the flat Kenney colours into realistic materials, by material name:
 * wood gets grain, carpet/fabric gets a woven look with sheen, metal gets reflections from a studio
 * environment. Used by the 3D room (components/room/placed-furniture.tsx) and by the catalogue
 * thumbnail renderer (scripts/thumbs/studio.html), so a placed piece matches its picture.
 * It never touches scene lights. Models that are already textured (pro/, other folders) are left alone.
 * Finishes still tint: the original colour stays on the material and the grain only darkens it.
 */

type Kind = 'wood' | 'fabric' | 'metal' | 'glass'

const KIND: Record<string, Kind> = {
  wood: 'wood',
  woodDark: 'wood',
  carpet: 'fabric',
  carpetWhite: 'fabric',
  carpetBlue: 'fabric',
  fabric: 'fabric',
  metal: 'metal',
  metalLight: 'metal',
  metalMedium: 'metal',
  metalDark: 'metal',
  glass: 'glass',
}

const TEXTURE_URL: Partial<Record<Kind, string>> = { wood: '/textures/furniture/wood.jpg', fabric: '/textures/furniture/fabric.jpg' }
/** Metres of the furniture that one texture repeat covers. */
const REPEAT_METRES: Record<string, number> = { wood: 0.45, fabric: 0.3 }

const textures = new Map<string, Texture>()
function texture(kind: Kind): Texture | null {
  const url = TEXTURE_URL[kind]
  if (!url || typeof document === 'undefined') return null
  let t = textures.get(url)
  if (!t) {
    t = new TextureLoader().load(url)
    t.wrapS = t.wrapT = RepeatWrapping
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 4
    textures.set(url, t)
  }
  return t
}

const envs = new WeakMap<WebGLRenderer, Texture>()
/** A soft studio environment for reflections (made once per renderer). Pass it to upgradeFurnitureMaterials. */
export function furnitureEnvironment(gl: WebGLRenderer): Texture {
  let env = envs.get(gl)
  if (!env) {
    const pmrem = new PMREMGenerator(gl)
    env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    envs.set(gl, env)
  }
  return env
}

const upgraded = new WeakMap<Material, Material>()

/** Box-project UVs (metres / repeat) so the texture grain has an even size on every face. */
function boxUv(geometry: BufferGeometry, metresPerRepeat: number, scale: number) {
  const pos = geometry.getAttribute('position')
  const nor = geometry.getAttribute('normal')
  if (!pos || !nor) return
  const uv = new Float32Array(pos.count * 2)
  const p = new Vector3()
  const n = new Vector3()
  const k = scale / metresPerRepeat
  for (let i = 0; i < pos.count; i += 1) {
    p.fromBufferAttribute(pos, i)
    n.fromBufferAttribute(nor, i)
    const ax = Math.abs(n.x)
    const ay = Math.abs(n.y)
    const az = Math.abs(n.z)
    if (ay >= ax && ay >= az) uv.set([p.x * k, p.z * k], i * 2)
    else if (ax >= az) uv.set([p.z * k, p.y * k], i * 2)
    else uv.set([p.x * k, p.y * k], i * 2)
  }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2))
}

function upgrade(src: Material, kind: Kind, env: Texture | null): Material {
  const cached = upgraded.get(src)
  if (cached) return cached
  const base = src as MeshStandardMaterial
  let m: MeshStandardMaterial
  if (kind === 'fabric') {
    const p = new MeshPhysicalMaterial({ color: base.color, roughness: 0.95, metalness: 0 })
    p.sheen = 0.7
    p.sheenRoughness = 0.55
    p.sheenColor.set('#ffffff')
    m = p
  } else if (kind === 'wood') {
    m = new MeshStandardMaterial({ color: base.color, roughness: 0.55, metalness: 0 })
  } else if (kind === 'metal') {
    m = new MeshStandardMaterial({ color: base.color, roughness: 0.28, metalness: 0.9 })
  } else {
    m = new MeshStandardMaterial({ color: base.color, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.55 })
  }
  const tex = texture(kind)
  if (tex) {
    // map repeat is baked into the UVs (boxUv), so the texture itself repeats 1:1
    m.map = tex
  }
  if (env && (kind === 'metal' || kind === 'glass')) {
    m.envMap = env
    m.envMapIntensity = kind === 'metal' ? 0.9 : 0.6
  }
  m.name = base.name
  m.userData = { ...base.userData, upgraded: true }
  upgraded.set(src, m)
  return m
}

/**
 * Swap the flat Kenney materials in a loaded model for realistic ones. Safe to call again on the
 * same (or a cloned) model. `scale` = how much the game scales the model (metres per model unit),
 * so the grain stays a real-world size.
 */
export function upgradeFurnitureMaterials(root: Object3D, opts: { scale?: number; env?: Texture | null } = {}) {
  const scale = opts.scale ?? 1
  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh || Array.isArray(mesh.material)) return
    const kind = KIND[mesh.material.name]
    if (!kind) return
    if (!mesh.material.userData?.upgraded) mesh.material = upgrade(mesh.material, kind, opts.env ?? null)
    const geo = mesh.geometry
    const key = kind === 'wood' ? 'wood' : kind === 'fabric' ? 'fabric' : null
    if (key && geo.userData.boxUv !== scale) {
      // Geometry is shared by every copy of the model: project once per scale
      boxUv(geo, REPEAT_METRES[key], scale)
      geo.userData.boxUv = scale
    }
  })
}
