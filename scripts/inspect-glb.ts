import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'

async function inspect(file: string) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
  })
  const document = await io.read(file)
  const root = document.getRoot()

  console.log(`\n=== ${file} ===`)
  console.log(`nodes=${root.listNodes().length} meshes=${root.listMeshes().length} skins=${root.listSkins().length} materials=${root.listMaterials().length}`)

  for (const skin of root.listSkins()) {
    const joints = skin.listJoints().map((joint) => joint.getName() || '(unnamed)')
    console.log(`skin "${skin.getName() || '(unnamed)'}" joints=${joints.length}`)
    console.log(`  bones: ${joints.join(', ')}`)
  }

  function walk(node: ReturnType<typeof root.listNodes>[number], indent: string) {
    const mesh = node.getMesh()
    const skin = node.getSkin()
    const label = node.getName() || '(unnamed)'
    if (!mesh) {
      console.log(`${indent}node "${label}"${skin ? ' [has skin]' : ''}`)
    } else {
      console.log(`${indent}node "${label}" mesh="${mesh.getName() || '(unnamed)'}"${skin ? ' skinned-node' : ''}`)
      mesh.listPrimitives().forEach((prim, index) => {
        const material = prim.getMaterial()
        const position = prim.getAttribute('POSITION')
        const joints = prim.getAttribute('JOINTS_0')
        const weights = prim.getAttribute('WEIGHTS_0')
        const verts = position?.getCount() ?? 0
        const skinned = Boolean(joints || weights || skin)
        const min = position?.getMin(Array(3).fill(0) as number[])
        const max = position?.getMax(Array(3).fill(0) as number[])
        const bbox =
          min && max
            ? ` bbox=[${min.map((n) => n.toFixed(2)).join(',')}]..[${max.map((n) => n.toFixed(2)).join(',')}]`
            : ''
        const textures: string[] = []
        if (material) {
          for (const tex of [
            material.getBaseColorTexture(),
            material.getNormalTexture(),
            material.getMetallicRoughnessTexture(),
            material.getOcclusionTexture(),
            material.getEmissiveTexture(),
          ]) {
            const image = tex?.getImage()
            const name = tex?.getName() || tex?.getURI() || (image ? `image${image.byteLength}` : '')
            if (name) textures.push(name)
          }
          const color = material.getBaseColorFactor()
          textures.push(`baseColor=${color.map((n) => n.toFixed(2)).join(',')}`)
        }
        console.log(
          `${indent}  prim[${index}] verts=${verts} skinned=${skinned} material="${material?.getName() || '(none)'}"${bbox} tex=[${textures.join('; ')}]`,
        )
      })
    }
    for (const child of node.listChildren()) walk(child, `${indent}  `)
  }

  const children = new Set(root.listNodes().flatMap((node) => node.listChildren()))
  for (const node of root.listNodes()) {
    if (!children.has(node)) walk(node, '')
  }

  console.log('materials:')
  for (const material of root.listMaterials()) {
    console.log(`  - ${material.getName() || '(unnamed)'}`)
  }
  console.log('textures:')
  for (const texture of root.listTextures()) {
    const image = texture.getImage()
    console.log(
      `  - name="${texture.getName() || '(unnamed)'}" uri="${texture.getURI() || ''}" mime=${texture.getMimeType() || '?'} bytes=${image?.byteLength ?? 0}`,
    )
  }
}

async function main() {
  const files = process.argv.slice(2)
  if (files.length === 0) {
    console.error('Usage: npx tsx scripts/inspect-glb.ts <file.glb> [...]')
    process.exit(1)
  }
  for (const file of files) {
    await inspect(file)
  }
}

void main()
