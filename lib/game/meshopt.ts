import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

export const meshoptDecoder = Promise.resolve(
  typeof MeshoptDecoder === 'function' ? MeshoptDecoder() : MeshoptDecoder,
).then((decoder) => decoder as object)
