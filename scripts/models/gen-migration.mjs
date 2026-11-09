// Prints the SQL that points catalogue rows at the pro models (heights measured from the built GLBs).
//   node scripts/models/gen-migration.mjs > backend/sql/060_pro_furniture_models.sql
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..')
let dir = repo
while (!existsSync(join(dir, 'node_modules', '@gltf-transform'))) dir = dirname(dir)
const req = createRequire(join(dir, 'package.json'))
const { NodeIO } = req('@gltf-transform/core')
const { ALL_EXTENSIONS } = req('@gltf-transform/extensions')
const { getBounds } = req('@gltf-transform/functions')
const { MeshoptDecoder } = req('meshoptimizer')
await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })

const FINISHES = {
  fabric: [['Stone grey', '#a9afb8'], ['Navy', '#4a6a9c'], ['Teal', '#3f9a94'], ['Wine', '#9a4656'], ['Sand', '#e0cfa9'], ['Forest', '#4f8a5f']],
  wood: [['Honey', '#f0c48e'], ['Walnut', '#b58862'], ['Ash', '#ece3d3'], ['Cherry', '#d98a70']],
}
const specs = JSON.parse(readFileSync(join(here, 'pro-specs.json'), 'utf8'))
const out = []
out.push(`-- Textured low-poly upgrades for the most-seen Buy-mode pieces (sources and licences: THIRD_PARTY_NOTICES.md).
-- Additive and idempotent: only model / height (and the colour finishes, where the old list was for the flat Kenney
-- colours) of existing rows change. ids, prices, footprints (w x d) and what players own or have placed stay as they are.
-- Models live in public/models/furniture/pro/ in real-world metres, floor-centred, +Y up, and fit the row's w x d tiles.
-- Colour finishes multiply onto every material not flagged notint in the GLB (wood, metal, screens stay as they are).
`)
for (const s of specs) {
  const doc = await io.read(join(repo, 'public', 'models', 'furniture', 'pro', `${s.name}.glb`))
  const b = getBounds(doc.getRoot().listScenes()[0])
  const h = Math.round((b.max[1] - b.min[1]) * 100) / 100
  const fin = s.fin === 'keep' ? '' : `, finishes = '${JSON.stringify(FINISHES[s.fin].map(([n, c]) => ({ n, c })))}'::jsonb`
  out.push(`UPDATE home_furniture SET model = '/models/furniture/pro/${s.name}.glb', height = ${h}${fin} WHERE id = '${s.item}';`)
}
console.log(out.join('\n'))
