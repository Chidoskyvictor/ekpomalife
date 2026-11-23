import { BufferGeometry, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute, SphereGeometry } from 'three'
import lampData from './streetlight-data.json'
import { BLOCK_SIGNS, KIOSK_SIGNS, SHOP_SIGNS, signRect } from './town-signs'

/*
 * The Ekpoma building kit: shops with zinc or striped awnings and a coloured signboard across the
 * front, plastered two and three storey blocks with burglar-proof windows, churches, mosques,
 * filling stations, kiosks, fenced bungalows and street lamps. Each is a procedural mesh made of
 * boxes, merged into one geometry. Front is +z, centred on its footprint, standing on the ground.
 *
 * Surfaces carry a material code (aMat): painted plaster that takes the building's own wall
 * colour, zinc sheet, a signboard painted from the sign atlas, plain colour, and trim plaster that
 * keeps its own colour. Windows and signs carry a glow value that lights up at night.
 */

export const MAT = { wall: 0, zinc: 1, sign: 2, flat: 3, trim: 4 } as const
type V3 = [number, number, number]
type Rect = [number, number, number, number]
type Face = 'f' | 'b' | 'l' | 'r' | 't' | 'u'
type Opt = { c?: string; m?: number; g?: number; rect?: Rect }
type BoxOpt = Opt & { skip?: string; rotX?: number; faces?: Partial<Record<Face, Opt>> }

/** One texture repeat is this many metres on a wall. */
const TILE_M = 2.6

const colorCache = new Map<string, Color>()
const color = (hex: string) => {
  let c = colorCache.get(hex)
  if (!c) colorCache.set(hex, (c = new Color(hex)))
  return c
}

class Mesher {
  pos: number[] = []
  nor: number[] = []
  uv: number[] = []
  col: number[] = []
  mat: number[] = []
  glow: number[] = []

  private tri(a: V3, b: V3, c: V3, n: V3, ua: [number, number], ub: [number, number], uc: [number, number], o: Opt) {
    const col = color(o.c ?? '#ffffff')
    for (const [p, u] of [[a, ua], [b, ub], [c, uc]] as [V3, [number, number]][]) {
      this.pos.push(...p)
      this.nor.push(...n)
      this.uv.push(u[0], u[1])
      this.col.push(col.r, col.g, col.b)
      this.mat.push(o.m ?? MAT.wall)
      this.glow.push(o.g ?? 0)
    }
  }

  /** A quad a-b-c-d, counter-clockwise seen from outside. */
  quad(p: [V3, V3, V3, V3], o: Opt) {
    const [a, b, c, d] = p
    const e1: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const e2: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const n: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
    const len = Math.hypot(...n) || 1
    n[0] /= len
    n[1] /= len
    n[2] /= len
    let uvs: [number, number][]
    if (o.m === MAT.sign && o.rect) {
      const [u0, v0, u1, v1] = o.rect
      uvs = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]]
    } else {
      const ax = Math.abs(n[0])
      const ay = Math.abs(n[1])
      const az = Math.abs(n[2])
      const proj = (v: V3): [number, number] => (ay >= ax && ay >= az ? [v[0] / TILE_M, v[2] / TILE_M] : ax >= az ? [v[2] / TILE_M, v[1] / TILE_M] : [v[0] / TILE_M, v[1] / TILE_M])
      uvs = [proj(a), proj(b), proj(c), proj(d)]
    }
    this.tri(a, b, c, n, uvs[0]!, uvs[1]!, uvs[2]!, o)
    this.tri(a, c, d, n, uvs[0]!, uvs[2]!, uvs[3]!, o)
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number, o: BoxOpt = {}) {
    const hx = w / 2
    const hy = h / 2
    const hz = d / 2
    const rot = o.rotX ?? 0
    const cs = Math.cos(rot)
    const sn = Math.sin(rot)
    const P = (px: number, py: number, pz: number): V3 => [x + px, y + py * cs - pz * sn, z + py * sn + pz * cs]
    const faces: Record<Face, [V3, V3, V3, V3]> = {
      f: [P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz)],
      b: [P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz)],
      l: [P(-hx, -hy, -hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz)],
      r: [P(hx, -hy, hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz)],
      t: [P(-hx, hy, hz), P(hx, hy, hz), P(hx, hy, -hz), P(-hx, hy, -hz)],
      u: [P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz)],
    }
    for (const f of Object.keys(faces) as Face[]) {
      if (o.skip?.includes(f)) continue
      this.quad(faces[f], { ...o, ...(o.faces?.[f] ?? {}) })
    }
  }

  /** A gable-roofed block: ridge along z, walls at the ends, two roof slopes. */
  gable(w: number, h: number, d: number, x: number, y: number, z: number, wall: Opt, roof: Opt) {
    const hw = w / 2
    const hd = d / 2
    this.tri([x - hw, y, z + hd], [x + hw, y, z + hd], [x, y + h, z + hd], [0, 0, 1], [0, 0], [w / TILE_M, 0], [w / 2 / TILE_M, h / TILE_M], wall)
    this.tri([x + hw, y, z - hd], [x - hw, y, z - hd], [x, y + h, z - hd], [0, 0, -1], [0, 0], [w / TILE_M, 0], [w / 2 / TILE_M, h / TILE_M], wall)
    const k = h / hw
    const nl = Math.hypot(k, 1)
    const slope = (sx: number) => {
      const a: V3 = [x + sx * hw, y, z + hd]
      const b: V3 = [x + sx * hw, y, z - hd]
      const c: V3 = [x, y + h, z - hd]
      const dd: V3 = [x, y + h, z + hd]
      const n: V3 = [(sx * k) / nl, 1 / nl, 0]
      const u = (v: V3): [number, number] => [v[2] / TILE_M, (Math.hypot(v[0] - x, v[1] - y) / TILE_M) * 1.2]
      if (sx < 0) {
        this.tri(b, a, dd, n, u(b), u(a), u(dd), roof)
        this.tri(b, dd, c, n, u(b), u(dd), u(c), roof)
      } else {
        this.tri(a, b, c, n, u(a), u(b), u(c), roof)
        this.tri(a, c, dd, n, u(a), u(c), u(dd), roof)
      }
    }
    slope(-1)
    slope(1)
  }

  /** Any three.js shape (cone, cylinder, dome), flat-shaded. */
  shape(g: BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, o: Opt) {
    const index = g.index
    const p = g.getAttribute('position')
    const n = index ? index.count : p.count
    const at = (i: number): V3 => {
      const k = index ? index.getX(i) : i
      return [x + p.getX(k) * sx, y + p.getY(k) * sy, z + p.getZ(k) * sz]
    }
    for (let i = 0; i < n; i += 3) {
      const a = at(i)
      const b = at(i + 1)
      const c = at(i + 2)
      const e1: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
      const e2: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
      const nn: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
      const len = Math.hypot(...nn) || 1
      const u = (v: V3): [number, number] => [(v[0] + v[2]) / TILE_M, v[1] / TILE_M]
      this.tri(a, b, c, [nn[0] / len, nn[1] / len, nn[2] / len], u(a), u(b), u(c), o)
    }
    g.dispose()
  }

  /** Triangles from a real model (indexed arrays), scaled, optionally turned half way round, flat-shaded. */
  raw(pos: number[], idx: number[], sx: number, sy: number, sz: number, turn: boolean, o: Opt) {
    const at = (i: number): V3 => {
      const x = pos[i * 3]! * sx
      const z = pos[i * 3 + 2]! * sz
      return [turn ? -x : x, pos[i * 3 + 1]! * sy, turn ? -z : z]
    }
    for (let i = 0; i < idx.length; i += 3) {
      const a = at(idx[i]!)
      const b = at(idx[i + 1]!)
      const c = at(idx[i + 2]!)
      const e1: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
      const e2: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
      const n: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
      const len = Math.hypot(...n) || 1
      this.tri(a, b, c, [n[0] / len, n[1] / len, n[2] / len], [0, 0], [0, 0], [0, 0], o)
    }
  }

  build(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3))
    g.setAttribute('aUv', new Float32BufferAttribute(this.uv, 2))
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3))
    g.setAttribute('aMat', new Float32BufferAttribute(this.mat, 1))
    g.setAttribute('aGlow', new Float32BufferAttribute(this.glow, 1))
    g.computeBoundingSphere()
    return g
  }
}

export type Shape = { geo: BufferGeometry; w: number; d: number; h: number }

const GLASS = '#2c3944'
const BARS = '#1b2025'
const TRIM = '#d8d3c6'
const STEEL = '#69727c'

/** Counts windows so two in three are lit, never a solid block of light. */
let windows = 0
const lit = () => (windows++ % 3 !== 1 ? 1 : 0)

/** A window with burglar-proof bars: a dark pane, a sill, three uprights and two cross bars. */
function barredWindow(m: Mesher, x: number, y: number, z: number, w: number, h: number) {
  m.box(w, h, 0.08, x, y, z, { c: GLASS, m: MAT.flat, g: lit(), skip: 'bltu' })
  m.box(w + 0.3, 0.1, 0.22, x, y - h / 2 - 0.05, z + 0.08, { c: TRIM, m: MAT.trim, skip: 'bu' })
  for (let i = 0; i < 3; i++) m.box(0.045, h, 0.045, x - w / 2 + (w * (i + 0.5)) / 3, y, z + 0.1, { c: BARS, m: MAT.flat, skip: 'bltu' })
  for (const k of [0.34, 0.68]) m.box(w, 0.04, 0.045, x, y - h / 2 + h * k, z + 0.1, { c: BARS, m: MAT.flat, skip: 'bltu' })
}

function tank(m: Mesher, x: number, y: number, z: number) {
  m.box(1.3, 0.5, 1.3, x, y + 0.25, z, { c: STEEL, m: MAT.flat, skip: 'u' })
  m.shape(new CylinderGeometry(0.62, 0.62, 1.15, 8), x, y + 1.05, z, 1, 1, 1, { c: '#20272d', m: MAT.flat })
}

/** A shop: plastered body (one or two storeys), glass front, awning, coloured fascia signboard. */
export function shop(i: number, floors: number): Shape {
  const m = new Mesher()
  const board = SHOP_SIGNS[i % SHOP_SIGNS.length]!
  const rect = signRect(board.text, board.bg, board.ink)
  const striped = i % 3 === 1
  const H = 4.3 + (floors - 1) * 3.1
  m.box(9, H, 7.5, 0, H / 2, -0.25, { skip: 'u' })
  m.box(9.3, 0.25, 7.8, 0, H + 0.12, -0.25, { c: '#8a8f94', m: MAT.flat, skip: 'u' })
  // Shopfront: glass, a roller door, pillars
  m.box(7.4, 2.2, 0.06, 0.4, 1.35, 3.53, { c: GLASS, m: MAT.flat, g: 1, skip: 'bltu' })
  m.box(1.5, 2.35, 0.08, -3.3, 1.25, 3.55, { c: '#59636d', m: MAT.flat, skip: 'bltu' })
  for (const x of [-4.3, -2.35, 4.3]) m.box(0.4, 2.7, 0.3, x, 1.35, 3.6, { c: TRIM, m: MAT.trim, skip: 'bu' })
  // Awning: zinc sheets, or a striped canvas, sloping down over the pavement
  if (striped) {
    for (let s = 0; s < 10; s++) m.box(0.92, 0.07, 2.2, -4.14 + s * 0.92, 3.3, 4.55, { c: s % 2 ? '#f4f1e6' : '#c8332b', m: MAT.flat, rotX: 0.2, skip: 'u' })
    m.box(9.2, 0.34, 0.05, 0, 3.0, 5.62, { c: '#c8332b', m: MAT.flat, skip: 'bu' })
  } else {
    m.box(9.4, 0.08, 2.3, 0, 3.3, 4.6, { c: '#9aa1a8', m: MAT.zinc, rotX: 0.18, faces: { u: { c: '#3a3f44', m: MAT.flat }, f: { c: '#7b8289', m: MAT.flat }, l: { c: '#7b8289', m: MAT.flat }, r: { c: '#7b8289', m: MAT.flat } } })
  }
  for (const x of [-4.4, 4.4]) m.box(0.1, 3.0, 0.1, x, 1.5, 5.6, { c: STEEL, m: MAT.flat, skip: 'u' })
  // Fascia signboard across the front, above the awning
  m.box(9.0, 1.1, 0.18, 0, 4.0, 3.62, { c: '#2b2f33', m: MAT.flat, g: 0, faces: { f: { m: MAT.sign, rect, g: 0.85 } }, skip: 'bu' })
  if (floors > 1) {
    for (const x of [-2.9, 0, 2.9]) barredWindow(m, x, 5.9, 3.51, 1.3, 1.5)
    m.box(9.2, 0.18, 1.2, 0, 4.9, 4.1, { c: TRIM, m: MAT.trim, skip: 'u' })
    tank(m, 2.8, H + 0.25, -2)
  }
  return { geo: m.build(), w: 9, d: 8, h: H }
}

/** A plastered 2 or 3 storey block: shopfronts below, balcony, rows of barred windows, stair tower, tanks. */
export function block(i: number, floors: number): Shape {
  const m = new Mesher()
  const board = BLOCK_SIGNS[i % BLOCK_SIGNS.length]!
  const rect = signRect(board.text, board.bg, board.ink)
  const H = 3.9 + (floors - 1) * 3.2
  m.box(12, H, 8, 0, H / 2, -0.5, { skip: 'u' })
  m.box(12.3, 0.28, 8.3, 0, H + 0.14, -0.5, { c: '#80858a', m: MAT.flat, skip: 'u' })
  // Ground floor: three units behind roller shutters and glass
  const units = ['#4a6a8a', '#7a2f2a', '#3b6a47']
  for (let u = 0; u < 3; u++) {
    const x = -3.9 + u * 3.9
    m.box(3.0, 2.3, 0.07, x, 1.3, 3.53, { c: GLASS, m: MAT.flat, g: u === 1 ? 0.2 : 1, skip: 'bltu' })
    m.box(3.1, 0.7, 0.1, x, 2.25, 3.56, { c: units[u]!, m: MAT.flat, skip: 'bltu' })
  }
  m.box(7.6, 0.7, 0.14, -0.7, 3.35, 3.62, { c: '#2b2f33', m: MAT.flat, faces: { f: { m: MAT.sign, rect, g: 0.85 } }, skip: 'bu' })
  // Balcony and upper floors: barred windows, columns
  for (let f = 1; f < floors; f++) {
    const y = 3.9 + (f - 1) * 3.2
    m.box(12.2, 0.2, 1.4, 0, y, 4.15, { c: TRIM, m: MAT.trim, skip: 'u' })
    m.box(12.2, 0.07, 0.07, 0, y + 1.05, 4.8, { c: STEEL, m: MAT.flat, skip: 'u' })
    for (let b = 0; b < 17; b++) m.box(0.05, 1.0, 0.05, -5.9 + b * 0.74, y + 0.55, 4.8, { c: STEEL, m: MAT.flat, skip: 'bltu' })
    for (let k = 0; k < 4; k++) barredWindow(m, -4.3 + k * 2.9, y + 1.45, 3.51, 1.4, 1.5)
  }
  for (const x of [-6, -2.2, 1.6, 5.2]) m.box(0.3, H, 0.3, x, H / 2, 3.65, { c: TRIM, m: MAT.trim, skip: 'u' })
  // Stair tower with slit windows, water tanks on the roof
  m.box(2.2, H + 1.2, 2.2, 4.6, (H + 1.2) / 2, -2.6, { skip: 'u' })
  m.box(0.35, H * 0.65, 0.06, 4.6, H * 0.5, -1.47, { c: GLASS, m: MAT.flat, g: 0.7, skip: 'bltu' })
  tank(m, -3, H + 0.28, -1)
  tank(m, -0.8, H + 0.28, -1)
  return { geo: m.build(), w: 12, d: 9, h: H }
}

/** A church: zinc-roofed nave, front tower with a cross, coloured windows, a name board over the door. */
export function church(label = 'Above the Hills Church', bg = '#1d4f91'): Shape {
  const m = new Mesher()
  const rect = signRect(label, bg, '#ffffff')
  m.box(9, 6, 14, 0, 3, -1.5, { skip: 'u' })
  m.gable(9.8, 3.2, 14.6, 0, 6, -1.5, {}, { c: '#8d949a', m: MAT.zinc })
  m.box(4.6, 9.5, 4.4, 0, 4.75, 6.8, { skip: 'u' })
  m.shape(new ConeGeometry(0.75, 1, 4, 1).rotateY(Math.PI / 4), 0, 9.5, 6.8, 4.6, 3.4, 4.4, { c: '#8d949a', m: MAT.zinc })
  m.box(0.22, 2.2, 0.22, 0, 14.3, 6.8, { c: '#f4f2ea', m: MAT.flat })
  m.box(1.2, 0.22, 0.22, 0, 14.7, 6.8, { c: '#f4f2ea', m: MAT.flat })
  m.box(2.1, 3.1, 0.1, 0, 1.55, 9.03, { c: '#4a3426', m: MAT.flat, skip: 'bltu' })
  m.box(4.3, 0.65, 0.12, 0, 4.9, 9.06, { c: '#222', m: MAT.flat, faces: { f: { m: MAT.sign, rect, g: 0.9 } }, skip: 'bu' })
  m.box(1.0, 1.8, 0.1, 0, 7.0, 9.03, { c: '#d84a3a', m: MAT.flat, g: 0.9, skip: 'bltu' })
  const glass = ['#2f6fd0', '#d84a3a', '#e3b52a']
  for (const side of [-1, 1]) for (let k = 0; k < 4; k++) m.box(0.08, 2.2, 0.9, side * 4.53, 3.3, -6 + k * 3.2, { c: glass[k % 3]!, m: MAT.flat, g: 0.9, skip: 'bltu' })
  m.box(5.4, 0.4, 1.4, 0, 0.2, 9.7, { c: TRIM, m: MAT.trim })
  return { geo: m.build(), w: 14, d: 18, h: 14 }
}

/** A mosque: domed prayer hall, arched windows, two minarets. */
export function mosque(label = 'Central Mosque'): Shape {
  const m = new Mesher()
  const rect = signRect(label, '#1f7a52', '#ffffff')
  m.box(10, 6, 10, 0, 3, -1, { skip: 'u' })
  m.box(10.4, 0.4, 10.4, 0, 6.2, -1, { c: TRIM, m: MAT.trim })
  m.shape(new SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), 0, 6.4, -1, 3.8, 3.2, 3.8, { c: '#2f8a64', m: MAT.flat })
  m.box(0.14, 1.6, 0.14, 0, 9.8, -1, { c: '#e9d27a', m: MAT.flat })
  for (const x of [-4.2, 4.2]) {
    m.box(1.3, 11.5, 1.3, x * 1.4, 5.75, 4.1, { skip: 'u' })
    m.box(1.9, 0.35, 1.9, x * 1.4, 9.4, 4.1, { c: TRIM, m: MAT.trim })
    m.shape(new ConeGeometry(0.75, 1, 8, 1), x * 1.4, 11.5, 4.1, 1.1, 2.6, 1.1, { c: '#2f8a64', m: MAT.flat })
    m.box(0.3, 1.0, 0.04, x * 1.4, 6.5, 4.78, { c: GLASS, m: MAT.flat, g: 0.9, skip: 'bltu' })
  }
  for (let k = 0; k < 4; k++) m.box(1.2, 2.4, 0.08, -3.6 + k * 2.4, 2.5, 4.03, { c: '#d9c36a', m: MAT.flat, g: 0.95, skip: 'bltu' })
  m.box(5, 0.7, 0.12, 0, 4.6, 4.05, { c: '#222', m: MAT.flat, faces: { f: { m: MAT.sign, rect, g: 0.9 } }, skip: 'bu' })
  return { geo: m.build(), w: 14, d: 14, h: 12 }
}

/** A filling station: canopy on posts over two pumps, a shop behind, a price/name pole at the kerb. */
export function station(label = 'Ekpoma Fuel & Gas', bg = '#0f6b3a'): Shape {
  const m = new Mesher()
  const rect = signRect(label, bg, '#ffe36a')
  m.box(13, 0.5, 8, 0, 5, 2.5, { c: '#f1eee4', m: MAT.trim, faces: { u: { c: '#f6f1d6', m: MAT.flat, g: 0.85 } } })
  m.box(13.2, 0.9, 0.2, 0, 5.1, 6.5, { c: '#222', m: MAT.flat, faces: { f: { m: MAT.sign, rect, g: 0.9 } }, skip: 'bu' })
  for (const x of [-5, 5]) for (const z of [0, 5]) m.box(0.42, 4.8, 0.42, x, 2.4, z, { c: TRIM, m: MAT.trim, skip: 'u' })
  for (const x of [-2.4, 2.4]) {
    m.box(0.9, 1.7, 0.6, x, 0.9, 2.5, { c: '#c8332b', m: MAT.flat, skip: 'u' })
    m.box(0.5, 0.45, 0.05, x, 1.35, 2.82, { c: '#cfe9c0', m: MAT.flat, g: 0.9, skip: 'bltu' })
    m.box(3, 0.22, 1.5, x, 0.11, 2.5, { c: '#9a958a', m: MAT.flat })
  }
  m.box(9, 3.3, 4, 0, 1.65, -4.5, { skip: 'u' })
  m.box(9.3, 0.25, 4.3, 0, 3.4, -4.5, { c: '#80858a', m: MAT.flat, skip: 'u' })
  m.box(6.5, 1.6, 0.07, 0, 1.6, -2.47, { c: GLASS, m: MAT.flat, g: 1, skip: 'bltu' })
  m.box(0.45, 7.2, 0.45, 6.4, 3.6, 6.2, { c: STEEL, m: MAT.flat })
  m.box(3.0, 1.3, 0.2, 6.4, 7.6, 6.2, { c: '#222', m: MAT.flat, faces: { f: { m: MAT.sign, rect, g: 0.9 } }, skip: 'bu' })
  return { geo: m.build(), w: 14, d: 15, h: 8.4 }
}

/** A container kiosk with a hatch, a small zinc awning and a painted board. */
export function kiosk(i: number): Shape {
  const m = new Mesher()
  const board = KIOSK_SIGNS[i % KIOSK_SIGNS.length]!
  const rect = signRect(board.text, board.bg, board.ink)
  m.box(3.6, 2.6, 2.6, 0, 1.3, 0, { c: ['#ffffff', '#ffffff', '#ffffff'][i % 3]!, skip: 'u' })
  m.box(3.8, 0.12, 2.8, 0, 2.66, 0, { c: '#5d6066', m: MAT.flat })
  m.box(2.6, 1.0, 0.06, 0, 1.55, 1.32, { c: GLASS, m: MAT.flat, g: 1, skip: 'bltu' })
  m.box(3.9, 0.07, 1.4, 0, 2.5, 2.0, { c: '#9aa1a8', m: MAT.zinc, rotX: 0.16, faces: { u: { c: '#3a3f44', m: MAT.flat } } })
  m.box(3.5, 0.5, 0.1, 0, 2.95, 1.35, { c: '#222', m: MAT.flat, faces: { f: { m: MAT.sign, rect, g: 0.9 } }, skip: 'bu' })
  m.box(2.8, 0.1, 0.5, 0, 0.95, 1.55, { c: '#5f4a36', m: MAT.flat })
  return { geo: m.build(), w: 4, d: 4, h: 3.2 }
}

/** A bungalow behind a compound wall and gate, zinc hip roof showing over the top. */
export function bungalow(i: number): Shape {
  const m = new Mesher()
  const gate = ['#2c4a3a', '#23262b', '#7a2f2a', '#1f3f6e'][i % 4]!
  const roof = ['#7a4a3a', '#8d949a', '#5f666c', '#8a6a4a'][i % 4]!
  for (const x of [-4.3, 4.3]) m.box(5.0, 2.2, 0.3, x, 1.1, 6.8, { skip: 'u' })
  m.box(3.5, 1.95, 0.1, 0, 1.0, 6.8, { c: gate, m: MAT.flat, skip: 'bltu' })
  for (const x of [-1.95, 1.95]) m.box(0.55, 2.7, 0.55, x, 1.35, 6.8, { skip: 'u' })
  for (const x of [-6.85, 6.85]) m.box(0.3, 2.2, 13.6, x, 1.1, 0, { skip: 'u' })
  m.box(13.6, 2.2, 0.3, 0, 1.1, -6.8, { skip: 'u' })
  m.box(10, 3.2, 7, 0, 1.6, -0.5, { skip: 'u' })
  m.shape(new ConeGeometry(0.75, 1, 4, 1).rotateY(Math.PI / 4), 0, 3.2, -0.5, 11.4, 2.3, 8.4, { c: roof, m: MAT.zinc })
  m.box(1.1, 2.1, 0.1, -1.4, 1.05, 3.03, { c: '#5f4a36', m: MAT.flat, skip: 'bltu' })
  barredWindow(m, 2.2, 1.8, 3.03, 1.5, 1.1)
  barredWindow(m, -3.6, 1.8, 3.03, 1.5, 1.1)
  m.box(10.4, 0.16, 2.2, 0, 2.95, 4.3, { c: '#9aa1a8', m: MAT.zinc, rotX: 0.1 })
  for (const x of [-4.8, 4.8]) m.box(0.16, 2.9, 0.16, x, 1.45, 5.3, { c: '#d8d2c2', m: MAT.flat, skip: 'u' })
  return { geo: m.build(), w: 14, d: 14, h: 5.5 }
}

/** A gateway with a name board on two pillars: parks, markets and motor parks. */
export function gateway(label: string, bg: string): Shape {
  const m = new Mesher()
  const rect = signRect(label, bg, '#ffffff')
  for (const x of [-5.5, 5.5]) m.box(0.9, 5.6, 0.9, x, 2.8, 0, { skip: 'u' })
  m.box(12.4, 1.7, 0.3, 0, 5.0, 0, { c: '#222', m: MAT.flat, faces: { f: { m: MAT.sign, rect, g: 0.95 }, b: { m: MAT.sign, rect, g: 0.5 } }, skip: 'u' })
  m.box(13.2, 0.3, 0.8, 0, 6.0, 0, { c: '#80858a', m: MAT.flat })
  m.box(12, 3, 0.2, 0, 1.5, -3, { c: '#a9a595', m: MAT.flat })
  return { geo: m.build(), w: 13, d: 8, h: 6.2 }
}

/** A campus lecture block or hall: long, three storeys, ribbon windows, columns and a name board on the parapet. */
export function academic(label: string, bg = '#1d4f91', floors = 3): Shape {
  const m = new Mesher()
  const rect = signRect(label, bg, '#ffffff')
  const H = 3.6 * floors
  m.box(22, H, 11, 0, H / 2, -1, { skip: 'u' })
  m.box(22.4, 0.3, 11.4, 0, H + 0.15, -1, { c: '#80858a', m: MAT.flat })
  for (let f = 0; f < floors; f++) {
    for (let k = 0; k < 7; k++) {
      const x = -9 + k * 3
      if (f === 0 && k === 3) continue
      m.box(2.0, 1.5, 0.07, x, f * 3.6 + 2.2, 4.53, { c: GLASS, m: MAT.flat, g: lit(), skip: 'bltu' })
      m.box(2.2, 0.1, 0.25, x, f * 3.6 + 1.4, 4.6, { c: TRIM, m: MAT.trim, skip: 'bu' })
    }
  }
  m.box(2.6, 2.7, 0.1, 0, 1.4, 4.55, { c: '#4a3426', m: MAT.flat, g: 0.5, skip: 'bltu' })
  for (const x of [-2.2, 2.2]) m.box(0.5, H, 0.5, x, H / 2, 5.2, { c: TRIM, m: MAT.trim, skip: 'u' })
  m.box(6.4, 1.0, 0.18, 0, H + 0.9, 4.4, { c: '#222', m: MAT.flat, faces: { f: { m: MAT.sign, rect, g: 0.95 } }, skip: 'bu' })
  m.box(0.1, 6, 0.1, 9.5, H + 3, 3, { c: STEEL, m: MAT.flat })
  return { geo: m.build(), w: 22, d: 14, h: H + 1.4 }
}

/** A night spot: two-storey, dark, with a bright neon board and a lit doorway. */
export function club(label: string, ink = '#ff4fa8'): Shape {
  const m = new Mesher()
  const rect = signRect(label, '#141418', ink)
  m.box(14, 7, 9, 0, 3.5, -0.5, { c: '#8a6a9a', m: MAT.trim, skip: 'u' })
  m.box(14.3, 0.3, 9.3, 0, 7.1, -0.5, { c: '#222', m: MAT.flat })
  m.box(3.2, 2.9, 0.1, 0, 1.45, 4.03, { c: '#ffb257', m: MAT.flat, g: 1, skip: 'bltu' })
  for (const x of [-5, -2.4, 2.4, 5]) m.box(1.4, 1.6, 0.08, x, 4.8, 4.03, { c: '#7a4cff', m: MAT.flat, g: 0.9, skip: 'bltu' })
  m.box(9.5, 1.3, 0.2, 0, 6.0, 4.15, { c: '#111', m: MAT.flat, faces: { f: { m: MAT.sign, rect, g: 1.3 } }, skip: 'bu' })
  m.box(3.6, 0.25, 1.4, 0, 3.2, 4.7, { c: '#222', m: MAT.flat })
  return { geo: m.build(), w: 14, d: 10, h: 7.4 }
}

/**
 * A street lamp from the real CC0 Quaternius "Street Light" model (public/models/streetlight.glb;
 * its triangles are in streetlight-data.json): pole, an arm reaching toward the road (+z), a lamp
 * head that lights at night. `reach` stretches the arm; `double` adds a second arm the other way,
 * for the middle of the dual carriageway.
 */
function lampOf(reach: number, double: boolean): Shape {
  const m = new Mesher()
  for (const turn of double ? [false, true] : [false]) {
    m.raw(lampData.a.pos, lampData.a.idx, 1.2, 1.4, reach, turn, { c: '#6c747c', m: MAT.flat })
    m.raw(lampData.b.pos, lampData.b.idx, 1.2, 1.4, reach, turn, { c: '#ffa826', m: MAT.flat, g: 0.85 })
  }
  return { geo: m.build(), w: 1, d: 1, h: 9.3 }
}
export const lamp = () => lampOf(1.4, false)
/** Middle-of-the-road lamp: two arms, one over each carriageway. */
export const lampDouble = () => lampOf(2.5, true)

/**
 * The far version of any building: a plain block with a few lit windows. 10 x 10 x 10 in its own
 * units; the town scales it to the real footprint and height.
 */
export function farBlock(): Shape {
  const m = new Mesher()
  m.box(10, 10, 10, 0, 5, 0, { skip: 'u' })
  for (let k = 0; k < 4; k++) m.box(1.4, 1.2, 0.06, -3.6 + k * 2.4, 6.0, 5.02, { c: GLASS, m: MAT.flat, g: k % 3 === 1 ? 0 : 1, skip: 'bltu' })
  for (let k = 0; k < 4; k++) m.box(1.4, 1.2, 0.06, -3.6 + k * 2.4, 2.4, 5.02, { c: GLASS, m: MAT.flat, g: k % 2 ? 1 : 0, skip: 'bltu' })
  return { geo: m.build(), w: 10, d: 10, h: 10 }
}
