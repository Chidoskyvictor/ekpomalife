// Prints size, triangle count, materials and textures of source models. node scripts/models/inspect-src.mjs <file.gltf|glb>...
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { getBounds } from '@gltf-transform/functions'
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f)
  const root = doc.getRoot()
  const b = getBounds(doc.getRoot().getDefaultScene() ?? root.listScenes()[0])
  const sz = b.max.map((v, i) => +(v - b.min[i]).toFixed(2))
  let tris = 0
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3
  console.log(f.split(/[\/]/).pop(), 'size', sz.join('x'), 'min', b.min.map((v) => +v.toFixed(2)).join(','), 'tris', tris,
    'mats', root.listMaterials().map((m) => m.getName() + (m.getBaseColorTexture() ? '[T]' : '')).join(','))
}
