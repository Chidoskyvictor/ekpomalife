/**
 * Forbes club interior = Sazza's club (public/models/club-sazza.glb) restyled so it doesn't look
 * alike: just as dark, with gold / emerald / wine neon instead of pink and cyan, a U-shaped VIP
 * lounge and 4 bar stools. The room shell stays where the game camera expects it.
 *
 *   node scripts/make-forbes-club.mjs     (needs @gltf-transform/core, extensions, functions, meshoptimizer)
 */
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { meshopt } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

const IN = 'public/models/club-sazza.glb'
const OUT = 'public/models/club-forbes.glb'

const GOLD = [0.85, 0.62, 0.18]
const EMERALD = [0.02, 0.65, 0.38]
const WINE = [0.6, 0.03, 0.12]
const AMBER = [1, 0.7, 0.2]

/**
 * name: [baseColor, emissive?]. Walls, floors and the VIP floor keep Sazza's dark tones (not
 * listed); the neon, dance floor, bar and VIP pieces change to gold / emerald / wine.
 */
const STYLE = {
  ClubTrim: [[0.32, 0.22, 0.05]],
  BarFront: [[0.4, 0.27, 0.06]],
  ClubScreen: [EMERALD, EMERALD],
  DanceBase: [[0.18, 0.13, 0.04]],
  DanceTile00: [GOLD, GOLD],
  DanceTile01: [WINE, WINE],
  DanceTile02: [EMERALD, EMERALD],
  NeonPink: [GOLD, GOLD],
  NeonCyan: [EMERALD, EMERALD],
  NeonPurple: [WINE, WINE],
  NeonYellow: [AMBER, AMBER],
  StoolSeat: [[0.32, 0.22, 0.05]],
  VipRope: [EMERALD],
  VipSofa: [[0.24, 0.15, 0.05]],
  VipTable: [[0.5, 0.36, 0.09]],
}

/*
 * Seating, different from Sazza (which has 3 sofas in a row on the right wall and 6 stools):
 *  - VIP becomes a U-shaped lounge: the middle sofa stays on the wall (the game's VIP seat), the
 *    top and bottom sofas turn to face each other across it, each with its own table.
 *  - The bar gets 4 wider-spaced stools (one stays at z 0.3, the game's bar seat).
 */
const Q_NEG90 = [0, -Math.SQRT1_2, 0, Math.SQRT1_2] // turn −90° about Y
const Q_POS90 = [0, Math.SQRT1_2, 0, Math.SQRT1_2]
/** Sofa parts by the sofa's centre z in Sazza → where its centre goes and how it turns. */
const SOFAS = [
  { from: 2.8, to: [4.6, 3.9], q: Q_NEG90, sin: -1 }, // top: back to +z, facing the middle
  { from: -2.4, to: [4.6, -3.9], q: Q_POS90, sin: 1 }, // bottom: back to −z
]
const TABLES = { 2.8: [4.6, 2.85], '-2.4': [4.6, -2.85] }
const STOOLS = { 4.2: 3.5, 2.9: 1.9, 1.6: null, 0.3: 0.3, '-1': -1.3, '-2.3': null } // null = removed

await MeshoptDecoder.ready
await MeshoptEncoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })
const doc = await io.read(IN)

let styled = 0
for (const m of doc.getRoot().listMaterials()) {
  const s = STYLE[m.getName()]
  if (!s) continue
  m.setBaseColorFactor([...s[0], 1])
  if (s[1]) m.setEmissiveFactor(s[1])
  styled++
}

const near = (a, b) => Math.abs(a - b) < 0.05
let moved = 0
for (const node of doc.getRoot().listNodes()) {
  const name = node.getName()
  const [x, y, z] = node.getTranslation()
  if (name.startsWith('VipSofa')) {
    // Parts sit within ±0.9 of their sofa's centre along z
    const sofa = SOFAS.find((f) => Math.abs(z - f.from) <= 0.95)
    if (!sofa) continue
    const dx = x - 5.48
    const dz = z - sofa.from
    // Rotate the part's offset about the sofa centre (θ = ∓90°: x' = z·sinθ, z' = −x·sinθ)
    node.setTranslation([sofa.to[0] + dz * sofa.sin, y, sofa.to[1] - dx * sofa.sin])
    node.setRotation(sofa.q)
    moved++
  } else if (name.startsWith('VipTable')) {
    const key = Object.keys(TABLES).find((k) => near(z, Number(k)))
    if (!key) continue
    node.setTranslation([TABLES[key][0], y, TABLES[key][1]])
    node.setRotation(Q_POS90)
    moved++
  } else if (/^Stool(Base|Pole|Seat)/.test(name)) {
    const key = Object.keys(STOOLS).find((k) => near(z, Number(k)))
    if (key == null) continue
    const to = STOOLS[key]
    if (to == null) node.dispose()
    else node.setTranslation([x, y, to])
    moved++
  }
}

await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
await io.write(OUT, doc)
console.log(`styled ${styled} materials, moved ${moved} seating parts, wrote ${OUT}`)
