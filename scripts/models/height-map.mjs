// Top-down height map of a GLB (max surface height per x/z cell, in cm), in the frame the game
// draws it (centred on x/z, floor at 0, Kenney models scaled to `height`). Rows run from z=-back
// (top) to z=+front (bottom). Used to find seat heights/positions on sofas and chairs.
// node scripts/models/height-map.mjs <file.glb> [kenneyHeight] [cell=0.1]
import { readFileSync } from 'node:fs'

const [file, heightArg, cellArg] = process.argv.slice(2)
const cell = Number(cellArg ?? 0.1)
const buf = readFileSync(file)
const jsonLen = buf.readUInt32LE(12)
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))
const binStart = 20 + jsonLen + 8
const bin = buf.subarray(binStart)

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
const read = (acc, i, c) => {
  const bv = gltf.bufferViews[acc.bufferView]
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type]
  const size = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[acc.componentType]
  const stride = bv.byteStride || size * n
  const o = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0) + i * stride + c * size
  const raw = { 5120: () => bin.readInt8(o), 5121: () => bin.readUInt8(o), 5122: () => bin.readInt16LE(o), 5123: () => bin.readUInt16LE(o), 5125: () => bin.readUInt32LE(o), 5126: () => bin.readFloatLE(o) }[acc.componentType]()
  if (!acc.normalized) return raw
  return { 5120: Math.max(raw / 127, -1), 5121: raw / 255, 5122: Math.max(raw / 32767, -1), 5123: raw / 65535 }[acc.componentType]
}
const tris = []
const walk = (i, parent) => {
  const n = gltf.nodes[i]
  const m = mul(parent, local(n))
  if (n.mesh !== undefined) {
    for (const prim of gltf.meshes[n.mesh].primitives) {
      const pos = gltf.accessors[prim.attributes.POSITION]
      const idx = prim.indices !== undefined ? gltf.accessors[prim.indices] : null
      const count = idx ? idx.count : pos.count
      const vert = (k) => {
        const v = idx ? read(idx, k, 0) : k
        const p = [read(pos, v, 0), read(pos, v, 1), read(pos, v, 2)]
        return [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r])
      }
      for (let k = 0; k + 2 < count; k += 3) tris.push([vert(k), vert(k + 1), vert(k + 2)])
    }
  }
  for (const c of n.children ?? []) walk(c, m)
}
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
for (const r of gltf.scenes[gltf.scene ?? 0].nodes) walk(r, I)
const all = tris.flat()
const lo = [0, 1, 2].map((r) => Math.min(...all.map((p) => p[r])))
const hi = [0, 1, 2].map((r) => Math.max(...all.map((p) => p[r])))
const k = heightArg && heightArg !== '-' ? Number(heightArg) / (hi[1] - lo[1]) : 1
const cx = ((lo[0] + hi[0]) / 2) * k
const cz = ((lo[2] + hi[2]) / 2) * k
const W = Math.ceil(((hi[0] - lo[0]) * k) / cell)
const D = Math.ceil(((hi[2] - lo[2]) * k) / cell)
const grid = Array.from({ length: D }, () => new Array(W).fill(-1))
const x0 = -((hi[0] - lo[0]) * k) / 2
const z0 = -((hi[2] - lo[2]) * k) / 2
// Rasterise: sample each triangle densely
for (const t of tris) {
  const P = t.map((p) => [p[0] * k - cx, (p[1] - lo[1]) * k, p[2] * k - cz])
  const steps = 14
  for (let a = 0; a <= steps; a++)
    for (let b = 0; b <= steps - a; b++) {
      const u = a / steps
      const v = b / steps
      const w = 1 - u - v
      const x = P[0][0] * u + P[1][0] * v + P[2][0] * w
      const y = P[0][1] * u + P[1][1] * v + P[2][1] * w
      const z = P[0][2] * u + P[1][2] * v + P[2][2] * w
      const gx = Math.max(0, Math.min(W - 1, Math.floor((x - x0) / cell)))
      const gz = Math.max(0, Math.min(D - 1, Math.floor((z - z0) / cell)))
      if (y > grid[gz][gx]) grid[gz][gx] = y
    }
}
console.log(`${file} size ${((hi[0] - lo[0]) * k).toFixed(2)} x ${((hi[1] - lo[1]) * k).toFixed(2)} x ${((hi[2] - lo[2]) * k).toFixed(2)}  cell ${cell}  x from ${x0.toFixed(2)} to ${(-x0).toFixed(2)}, z from ${z0.toFixed(2)} (back) to ${(-z0).toFixed(2)} (front)`)
for (let z = 0; z < D; z++) console.log(`z${(z0 + (z + 0.5) * cell).toFixed(2).padStart(6)} ` + grid[z].map((y) => (y < 0 ? '  .' : String(Math.round(y * 100)).padStart(3))).join(''))
