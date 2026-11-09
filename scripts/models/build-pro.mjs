/**
 * Builds the textured "pro" furniture models in public/models/furniture/pro/ from source models
 * (Poly Haven CC0 .gltf folders, or .glb files made in Blender) that live OUTSIDE the repo.
 *
 *   node scripts/models/build-pro.mjs <sourceRoot> [name...]
 *
 * <sourceRoot>/ph/<id>/<id>.gltf        Poly Haven download (1k)
 * <sourceRoot>/blender/<id>.glb         built by scripts/models/blender/*.py
 *
 * For each entry in pro-specs.json it: turns the model so its long side runs along x (= the item's
 * w tiles), scales it uniformly (real-world size, but at most to fill w x d tiles; 1 tile = 1 m),
 * stands it on the floor centred on x/z, drops the normal/roughness maps (base colour only, so the
 * file stays small and finishes tint cleanly), welds + simplifies, resizes textures to webp, and
 * writes meshopt-compressed GLB. Materials whose name ends in "_fixed" are flagged
 * extras.notint, so a colour finish leaves them (wood, metal, screens) alone.
 * It prints the resulting size so pro-specs.json heights can be copied to the migration.
 */
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..')
function findUp(rel) {
  let dir = repo
  for (;;) {
    const p = join(dir, rel)
    if (existsSync(p)) return p
    const up = dirname(dir)
    if (up === dir) throw new Error(`${rel} not found`)
    dir = up
  }
}
const req = createRequire(join(dirname(dirname(findUp('node_modules/sharp/package.json'))), 'package.json'))
const { NodeIO } = req('@gltf-transform/core')
const { ALL_EXTENSIONS, EXTMeshoptCompression } = req('@gltf-transform/extensions')
const fn = req('@gltf-transform/functions')
const { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } = req('meshoptimizer')
const sharp = req('sharp')

const [sourceRoot, ...only] = process.argv.slice(2)
if (!sourceRoot) throw new Error('usage: build-pro.mjs <sourceRoot> [name...]')
const specs = JSON.parse(readFileSync(join(here, 'pro-specs.json'), 'utf8'))
const outDir = join(repo, 'public', 'models', 'furniture', 'pro')
mkdirSync(outDir, { recursive: true })

await MeshoptEncoder.ready
await MeshoptSimplifier.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })

for (const spec of specs) {
  if (only.length && !only.includes(spec.name)) continue
  const file = spec.src.startsWith('ph:')
    ? join(sourceRoot, 'ph', spec.src.slice(3), `${spec.src.slice(3)}.gltf`)
    : join(sourceRoot, 'blender', `${spec.src.slice(3)}.glb`)
  const doc = await io.read(file)
  const root = doc.getRoot()
  const scene = root.getDefaultScene() ?? root.listScenes()[0]

  // Base colour only: no normal / roughness / occlusion maps (small files, clean tinting)
  for (const m of root.listMaterials()) {
    m.setNormalTexture(null).setOcclusionTexture(null).setMetallicRoughnessTexture(null).setEmissiveTexture(null)
    if (!m.getName().includes('_metal')) m.setMetallicFactor(0)
    m.setRoughnessFactor(spec.roughness ?? 0.82)
    if (m.getName().endsWith('_fixed')) m.setExtras({ ...m.getExtras(), notint: true })
  }

  await doc.transform(fn.flatten(), fn.dedup(), fn.prune())
  // Geometry: weld, then simplify heavy meshes down to about spec.tris triangles
  let tris = 0
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3
  await doc.transform(fn.weld())
  if (spec.tris && tris > spec.tris) {
    await doc.transform(fn.simplify({ simplifier: MeshoptSimplifier, ratio: spec.tris / tris, error: spec.error ?? 0.02, lockBorder: false }))
  }

  // Orientation + size: wrap the scene in one node (turn, scale), then stand it on the floor, centred
  const wrap = doc.createNode('fit')
  for (const child of scene.listChildren()) {
    scene.removeChild(child)
    wrap.addChild(child)
  }
  scene.addChild(wrap)
  let b = fn.getBounds(scene)
  let sx = b.max[0] - b.min[0]
  let sz = b.max[2] - b.min[2]
  const turn = spec.turn ?? ((sz > sx) !== (spec.d > spec.w) && Math.abs(sz - sx) > 0.15 * Math.max(sx, sz) ? 90 : 0)
  if (turn) {
    const h = (turn * Math.PI) / 360
    wrap.setRotation([0, Math.sin(h), 0, Math.cos(h)])
    b = fn.getBounds(scene)
    sx = b.max[0] - b.min[0]
    sz = b.max[2] - b.min[2]
  }
  const sy = b.max[1] - b.min[1]
  let s = spec.scale ?? Math.min(spec.maxScale ?? 1.15, (spec.w * 0.96) / sx, (spec.d * 0.96) / sz)
  if (spec.maxHeight) s = Math.min(s, spec.maxHeight / sy)
  wrap.setScale([s, s, s])
  b = fn.getBounds(scene)
  wrap.setTranslation([-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2])
  b = fn.getBounds(scene)
  const size = b.max.map((v, i) => +(v - b.min[i]).toFixed(2))

  // Colour grade (spec.bright / spec.sat): lighter, calmer base colours so finishes tint cleanly
  if (spec.bright || spec.sat) {
    for (const tex of root.listTextures()) {
      const img = Buffer.from(tex.getImage())
      const png = tex.getMimeType() === 'image/png'
      let p = sharp(img).modulate({ brightness: spec.bright ?? 1, saturation: spec.sat ?? 1 })
      p = png ? p.png() : p.jpeg({ quality: 92 })
      tex.setImage(new Uint8Array(await p.toBuffer()))
    }
  }
  // Textures: webp at 512 (1024 for spec.tex)
  const px = spec.tex ?? 512
  await doc.transform(
    fn.textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [px, px], quality: spec.quality ?? 78 }),
    fn.dedup(),
    fn.prune(),
    fn.meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  )
  const outFile = join(outDir, `${spec.name}.glb`)
  await io.write(outFile, doc)
  const kb = statSync(outFile).size / 1024
  console.log(`${spec.name}.glb ${kb.toFixed(0)} KB  size ${size[0]}x${size[1]}x${size[2]} (w x h x d m)  scale ${s.toFixed(2)} tris ${Math.round(tris)}${spec.tris && tris > spec.tris ? '->~' + spec.tris : ''}`)
}
