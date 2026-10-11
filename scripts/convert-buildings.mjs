import fs from 'node:fs'
import { Buffer } from 'node:buffer'
import { pathToFileURL } from 'node:url'
import { Box3, Vector3 } from 'three'
import { USDLoader } from 'three/examples/jsm/loaders/USDLoader.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const NativeBlob = globalThis.Blob
globalThis.Blob = class Blob extends NativeBlob {
  constructor(parts = [], options) {
    super(parts, options)
    this._parts = parts
  }
}
URL.createObjectURL = (blob) => {
  const part = blob?._parts?.[0] ?? new Uint8Array()
  return `data:image/jpeg;base64,${Buffer.from(part).toString('base64')}`
}
URL.revokeObjectURL = () => {}
globalThis.Image = class Image {
  set src(value) {
    this._src = value
    queueMicrotask(() => {
      this.width = 64
      this.height = 64
      this.onload?.()
    })
  }
  get src() {
    return this._src
  }
}

const { Document, NodeIO } = await import(
  pathToFileURL('C:/Users/USER/AppData/Local/Temp/school-tool/node_modules/@gltf-transform/core/dist/index.js').href
)

const PICK = {
  house01: 'house01_42',
  house02: 'house02_30',
  duplex: 'sr_house_2_floors_01_001_19',
  hostel: 'sr_house_5_floors_01_15',
  tower: 'sr_house_9_floors_03_7',
  shop: 'sr_shop1_48',
  kiosk: 'sr_kiosk1_0',
  budka: 'budka_t2_11',
  market: 'rynok_40',
  mall: 'mall_22',
  office: 'office01_23',
  theatre: 'theatre01_21',
  bar: 'house1605am12_01_27',
}

const [input, output] = process.argv.slice(2)
const file = fs.readFileSync(input)
const loader = new USDLoader()
const group = await new Promise((resolve, reject) => {
  loader.parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '', resolve, reject)
})
group.updateMatrixWorld(true)

const roots = new Map()
group.traverse((object) => {
  if (object.parent?.name === 'GLTF_SceneRootNode') roots.set(object.name, object)
})

function imageBytes(map) {
  const src = map?.image?.src
  if (typeof src === 'string' && src.includes(',')) return Buffer.from(src.split(',')[1], 'base64')
  return null
}

const doc = new Document()
const buffer = doc.createBuffer()
const scene = doc.createScene()
const textures = new Map()

function textureOf(bytes) {
  const key = `${bytes.length}:${bytes.subarray(0, 24).toString('hex')}`
  let tex = textures.get(key)
  if (!tex) {
    tex = doc.createTexture().setMimeType('image/jpeg').setImage(bytes)
    textures.set(key, tex)
  }
  return tex
}

for (const [id, nodeName] of Object.entries(PICK)) {
  const root = roots.get(nodeName)
  if (!root) {
    console.log('missing', id, nodeName)
    continue
  }
  const box = new Box3().setFromObject(root)
  const size = box.getSize(new Vector3())
  const center = box.getCenter(new Vector3())
  const parent = doc.createNode(id)
  let meshes = 0
  root.traverse((object) => {
    if (!object.isMesh) return
    let geometry = (object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone()).clone()
    geometry.applyMatrix4(object.matrixWorld)
    geometry.translate(-center.x, -box.min.y, -center.z)
    geometry = mergeVertices(geometry, 1e-5)
    geometry.computeVertexNormals()
    const pos = new Float32Array(geometry.attributes.position.array)
    const prim = doc
      .createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buffer))
    if (geometry.index) {
      prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(geometry.index.array)).setBuffer(buffer))
    }
    if (geometry.attributes.uv) {
      prim.setAttribute(
        'TEXCOORD_0',
        doc.createAccessor().setType('VEC2').setArray(new Float32Array(geometry.attributes.uv.array)).setBuffer(buffer),
      )
    }
    if (geometry.attributes.normal) {
      prim.setAttribute(
        'NORMAL',
        doc.createAccessor().setType('VEC3').setArray(new Float32Array(geometry.attributes.normal.array)).setBuffer(buffer),
      )
    }
    const srcMat = [object.material].flat()[0]
    const bytes = imageBytes(srcMat?.map)
    const material = doc.createMaterial(`${id}_${meshes}`).setRoughnessFactor(0.85).setMetallicFactor(0.05)
    if (bytes && geometry.attributes.uv) material.setBaseColorTexture(textureOf(bytes))
    prim.setMaterial(material)
    parent.addChild(doc.createNode(`${id}_${meshes}`).setMesh(doc.createMesh(`${id}_${meshes}`).addPrimitive(prim)))
    meshes++
  })
  scene.addChild(parent)
  console.log(id, nodeName, 'meshes', meshes, 'size', size.toArray().map((n) => n.toFixed(2)).join('x'))
}

await new NodeIO().write(output, doc)
console.log('wrote', output, (fs.statSync(output).size / 1024).toFixed(0), 'KB')
