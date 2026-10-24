import {
  BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  type BufferGeometry,
  type Material,
  type MeshStandardMaterial,
  type Object3D,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type StaticPart = { geometry: BufferGeometry; material: Material }

const TEXTURE_KEYS = [
  'map',
  'emissiveMap',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'alphaMap',
  'lightMap',
  'bumpMap',
  'displacementMap',
] as const

/** Plain-colour, opaque standard material — its colour can move into vertex colours. */
function isFlatColour(material: Material): material is MeshStandardMaterial {
  const standard = material as MeshStandardMaterial
  if (!standard.isMeshStandardMaterial || standard.vertexColors || standard.transparent) return false
  return TEXTURE_KEYS.every((key) => !(standard as unknown as Record<string, unknown>)[key])
}

/** Everything that still differs once colour lives in the vertices. */
function shadingKey(m: MeshStandardMaterial) {
  return [
    m.type,
    m.roughness,
    m.metalness,
    m.emissive.getHexString(),
    m.emissiveIntensity,
    m.flatShading,
    m.side,
    m.toneMapped,
    m.opacity,
  ].join('|')
}

function paintVertices(geometry: BufferGeometry, material: MeshStandardMaterial) {
  const count = geometry.attributes.position!.count
  const colors = new Float32Array(count * 3)
  const { r, g, b } = material.color
  for (let i = 0; i < count; i++) {
    colors[i * 3] = r
    colors[i * 3 + 1] = g
    colors[i * 3 + 2] = b
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
}

/**
 * Quantized GLBs (KHR_mesh_quantization) store positions as normalized int16. Transforming those
 * in place clamps them to [-1, 1] and crushes the model, so expand every attribute to float first.
 */
function toFloatAttributes(geometry: BufferGeometry) {
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const source = attribute as BufferAttribute
    if (source.array instanceof Float32Array && !source.normalized && !('isInterleavedBufferAttribute' in source)) {
      continue
    }
    const { count, itemSize } = source
    const values = new Float32Array(count * itemSize)
    for (let i = 0; i < count; i++) {
      for (let c = 0; c < itemSize; c++) values[i * itemSize + c] = source.getComponent(i, c)
    }
    geometry.setAttribute(name, new BufferAttribute(values, itemSize))
  }
  return geometry
}

/**
 * Bake a static GLB scene into as few meshes as possible. Plain-colour materials that share
 * shading (roughness, emissive, …) merge into one vertex-coloured mesh; anything textured
 * merges per material. Geometry is in the root's local space — the root's own transform is
 * ignored, matching how drei `<Clone position scale>` replaces it.
 */
export function bakeStaticParts(root: Object3D): StaticPart[] {
  root.updateMatrixWorld(true)
  const toRoot = root.matrixWorld.clone().invert()
  const groups = new Map<string, { material: Material; geometries: BufferGeometry[] }>()
  const loose: StaticPart[] = []

  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh || !mesh.visible) return
    const base = toFloatAttributes(mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone())
    const geometry = base.applyMatrix4(new Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld))

    if (Array.isArray(mesh.material)) {
      loose.push({ geometry, material: mesh.material as unknown as Material })
      return
    }

    let key: string
    let material: Material = mesh.material
    if (isFlatColour(mesh.material) && !geometry.attributes.color) {
      for (const name of Object.keys(geometry.attributes)) {
        if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name)
      }
      if (!geometry.attributes.normal) geometry.computeVertexNormals()
      paintVertices(geometry, mesh.material)
      key = `flat|${shadingKey(mesh.material)}`
      if (!groups.has(key)) {
        const shared = mesh.material.clone()
        shared.color.set(0xffffff)
        shared.vertexColors = true
        shared.userData.baked = true
        material = shared
      }
    } else {
      key = `mat|${mesh.material.uuid}|${Object.keys(geometry.attributes).sort().join(',')}`
    }

    const entry = groups.get(key) ?? { material, geometries: [] }
    entry.geometries.push(geometry)
    groups.set(key, entry)
  })

  const parts = [...loose]
  for (const { material, geometries } of groups.values()) {
    const merged = geometries.length === 1 ? geometries[0]! : mergeGeometries(geometries)
    if (geometries.length > 1) geometries.forEach((g) => g.dispose())
    if (merged) parts.push({ geometry: merged, material })
  }
  return parts
}

/** Baked parts as a ready-to-mount group (use with `<primitive>`; one group per mount). */
export function bakeStaticGroup(root: Object3D, { shadows = true } = {}) {
  const group = new Group()
  for (const part of bakeStaticParts(root)) {
    const mesh = new Mesh(part.geometry, part.material)
    mesh.castShadow = shadows
    mesh.receiveShadow = shadows
    group.add(mesh)
  }
  return group
}

/** Free baked geometry (and the vertex-colour materials bake created). */
export function disposeBaked(group: Object3D) {
  group.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    mesh.geometry.dispose()
    const material = mesh.material as Material
    if (!Array.isArray(material) && material.userData.baked) material.dispose()
  })
}
