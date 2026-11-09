// Prints each mesh's world bounding box for a GLB, in the same frame the game draws it
// (centred on x/z, standing on y=0, Kenney models scaled to `height`). Used to derive seat data.
// node scripts/models/dump-bounds.mjs public/models/furniture/pro/sofa-two.glb [height-for-kenney]
import { readFileSync } from 'node:fs'

const [file, heightArg] = process.argv.slice(2)
const buf = readFileSync(file)
const jsonLen = buf.readUInt32LE(12)
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))

const mul = (a, b) => {
  const o = new Array(16).fill(0)
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]
  return o
}
const local = (n) => {
  if (n.matrix) return n.matrix
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = n.scale ?? [1, 1, 1]
  const [tx, ty, tz] = n.translation ?? [0, 0, 0]
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ]
}
const meshes = []
const walk = (i, parent) => {
  const n = gltf.nodes[i]
  const m = mul(parent, local(n))
  if (n.mesh !== undefined) {
    for (const prim of gltf.meshes[n.mesh].primitives) {
      const acc = gltf.accessors[prim.attributes.POSITION]
      const nz = acc.normalized ? { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[acc.componentType] ?? 1 : 1
      const [a, b] = [acc.min.map((v) => v / nz), acc.max.map((v) => v / nz)]
      const pts = []
      for (const x of [a[0], b[0]]) for (const y of [a[1], b[1]]) for (const z of [a[2], b[2]])
        pts.push([0, 1, 2].map((r) => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]))
      const lo = [0, 1, 2].map((r) => Math.min(...pts.map((p) => p[r])))
      const hi = [0, 1, 2].map((r) => Math.max(...pts.map((p) => p[r])))
      meshes.push({ name: `${n.name ?? ''}/${gltf.meshes[n.mesh].name ?? ''}`, lo, hi })
    }
  }
  for (const c of n.children ?? []) walk(c, m)
}
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
for (const r of gltf.scenes[gltf.scene ?? 0].nodes) walk(r, I)

const lo = [0, 1, 2].map((r) => Math.min(...meshes.map((x) => x.lo[r])))
const hi = [0, 1, 2].map((r) => Math.max(...meshes.map((x) => x.hi[r])))
const k = heightArg ? Number(heightArg) / (hi[1] - lo[1]) : 1
const cx = ((lo[0] + hi[0]) / 2) * k
const cz = ((lo[2] + hi[2]) / 2) * k
const f = (v) => v.toFixed(2).padStart(6)
console.log(`${file}  scale=${k.toFixed(3)}  size=${f((hi[0] - lo[0]) * k)} ${f((hi[1] - lo[1]) * k)} ${f((hi[2] - lo[2]) * k)}  (x,y,z)`)
for (const x of meshes)
  console.log(
    `  ${x.name.padEnd(34)} x ${f(x.lo[0] * k - cx)}..${f(x.hi[0] * k - cx)}  y ${f((x.lo[1] - lo[1]) * k)}..${f((x.hi[1] - lo[1]) * k)}  z ${f(x.lo[2] * k - cz)}..${f(x.hi[2] * k - cz)}`,
  )
