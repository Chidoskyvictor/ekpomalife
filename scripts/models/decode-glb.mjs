// Writes an uncompressed copy of a (meshopt-compressed) GLB so the bounds/height-map scripts can read it.
// node scripts/models/decode-glb.mjs in.glb out.glb
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import { dequantize } from '@gltf-transform/functions'

const [input, output] = process.argv.slice(2)
await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read(input)
await doc.transform(dequantize())
for (const ext of doc.getRoot().listExtensionsUsed()) if (ext.extensionName === 'EXT_meshopt_compression') ext.dispose()
await io.write(output, doc)
