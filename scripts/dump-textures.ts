import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'

async function dump(file: string, outDir: string) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
  })
  const document = await io.read(file)
  const root = document.getRoot()
  mkdirSync(outDir, { recursive: true })
  const used = new Map<string, string[]>()
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const material = prim.getMaterial()
      if (!material) continue
      const tex = material.getBaseColorTexture()
      if (!tex) continue
      const image = tex.getImage()
      if (!image) continue
      const mime = tex.getMimeType() || 'image/png'
      const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'png'
      const key = `${material.getName() || 'mat'}-${image.byteLength}.${ext}`
      const path = join(outDir, key)
      writeFileSync(path, image)
      const list = used.get(key) ?? []
      list.push(`${mesh.getName() || '(mesh)'} / ${material.getName()}`)
      used.set(key, list)
    }
  }
  console.log(`\n=== ${file} -> ${outDir} ===`)
  for (const [key, meshes] of used) {
    console.log(`  ${key}: ${meshes.join(', ')}`)
  }
}

async function main() {
  const files = process.argv.slice(2)
  for (const file of files) {
    await dump(file, join('tmp/outfit-tex', basename(file, '.glb')))
  }
}

void main()
