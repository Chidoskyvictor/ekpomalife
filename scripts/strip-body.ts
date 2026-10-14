import { mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { NodeIO, type Document, type Primitive } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { prune } from '@gltf-transform/functions'
import { MeshoptDecoder } from 'meshoptimizer'

const BODY_RE =
  /skin|head|face|eye|hand|hair|teeth|tooth|tongue|afro|eyebrow|eyelash|pele|cabelo|flesh|body|businessman|scalp|lip|mouth|ear|nose|neck/i
const CLOTHES_RE =
  /shirt|suit|jacket|trouser|skirt|shoe|tie|pant|blusa|calca|sapato|elegant|accessor|cloth|dress|coat|boot|sock|belt|collar|sleeve/i

type FileRule = { keepAll?: boolean; keepMaterial?: string[]; keepMesh?: string[] }

const FILE_RULES: Record<string, FileRule> = {
  'man-office.glb': { keepMaterial: ['male_elegantsuit01'] },
  'man-coprate.glb': { keepAll: true },
  'woman-office.glb': { keepMaterial: ['Material.001'] },
  'woman-coprate.glb': { keepAll: true },
}

function labelOf(prim: Primitive) {
  const mesh = prim.getName()
  const material = prim.getMaterial()?.getName() ?? ''
  return `${mesh} ${material}`.trim()
}

function classifyLabel(label: string): 'body' | 'clothes' | 'unknown' {
  const body = BODY_RE.test(label)
  const clothes = CLOTHES_RE.test(label)
  if (body && !clothes) return 'body'
  if (clothes && !body) return 'clothes'
  if (body && clothes) return 'unknown'
  return 'unknown'
}

function shouldKeep(fileName: string, prim: Primitive, meshName: string): boolean {
  const rule = FILE_RULES[fileName]
  const material = prim.getMaterial()?.getName() ?? ''
  if (rule?.keepAll) return true
  if (rule?.keepMaterial?.some((name) => material === name || material.includes(name))) return true
  if (rule?.keepMesh?.some((name) => meshName.includes(name))) return true
  if (rule) return false
  return classifyLabel(`${meshName} ${labelOf(prim)}`) !== 'body'
}

function isUnsplittable(document: Document) {
  const meshes = document.getRoot().listMeshes()
  const prims = meshes.flatMap((mesh) => mesh.listPrimitives())
  if (prims.length !== 1) return false
  const meshName = meshes[0]?.getName() ?? ''
  const kind = classifyLabel(`${meshName} ${labelOf(prims[0]!)}`)
  return kind === 'unknown'
}

async function strip(file: string, outFile: string) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
  })
  const document = await io.read(file)
  const fileName = basename(file)

  if (isUnsplittable(document)) {
    console.log(`SKIP ${fileName}: body and clothes are one primitive/material — cannot split by code`)
    return { skipped: true }
  }

  const kept: string[] = []
  const dropped: string[] = []

  for (const mesh of document.getRoot().listMeshes()) {
    const meshName = mesh.getName() || '(unnamed)'
    for (const prim of [...mesh.listPrimitives()]) {
      const label = `${meshName} / ${prim.getMaterial()?.getName() || '(none)'}`
      if (shouldKeep(fileName, prim, meshName)) {
        kept.push(label)
      } else {
        prim.detach()
        dropped.push(label)
      }
    }
    if (mesh.listPrimitives().length === 0) {
      for (const node of document.getRoot().listNodes()) {
        if (node.getMesh() === mesh) node.setMesh(null)
      }
    }
  }

  if (kept.length === 0) {
    console.log(`SKIP ${fileName}: no clothing primitives left after classify`)
    return { skipped: true }
  }

  await document.transform(
    prune({
      keepAttributes: true,
      keepLeaves: false,
    }),
  )

  const skins = document.getRoot().listSkins()
  console.log(`\n${fileName}`)
  console.log(`  keep: ${kept.join('; ')}`)
  console.log(`  drop: ${dropped.join('; ') || '(none)'}`)
  console.log(`  skins kept: ${skins.length}`)

  await io.write(outFile, document)
  console.log(`  wrote ${outFile}`)
  return { skipped: false }
}

async function main() {
  const inputs = process.argv.slice(2)
  if (inputs.length === 0) {
    console.error('Usage: npx tsx scripts/strip-body.ts <file.glb> [...]')
    process.exit(1)
  }
  const outDir = join('public/models/outfits/clean')
  mkdirSync(outDir, { recursive: true })
  for (const file of inputs) {
    const outFile = join(outDir, basename(file))
    await strip(file, outFile)
  }
}

void main()
