import { GANTRIES, JUNCTIONS, ROADS, ROAD_PLACES, roadById, type Gantry } from './drive-road'

/*
 * Every overhead sign on the drive, so a viewer knows at once it is Ekpoma. The baked gantries
 * (drive-roads.json: the six villages the OSM dump has as place nodes, and the AAU gate) are kept;
 * on top of them:
 *   - quarters named after real OSM roads that meet the expressway or the Ihumudumu road (Uke,
 *     Ujemen-Ozalla, Ikhirolo, Uhiele, Opoji, Ikhido, Egbede, Ihumudumu), a sign before the junction
 *     in each direction
 *   - landmark signs: AMBROSE ALLI UNIVERSITY, WELCOME TO EKPOMA, EKPOMA MARKET, BENIN-AUCHI ROAD
 *   - one just ahead of every place you can start a drive from on those roads
 *   - fill so that, in each direction, no more than about 600 m passes without one
 * `sub` is the small second line. `dir` +1 faces traffic travelling up s.
 * On the expressway up s is toward Auchi; on the Ihumudumu road up s leads away from Ekpoma toward Iruekpen.
 */

export type SignGantry = Gantry & { sub?: string }

const LONG = ['expressway', 'ihumudumu-road']
/** Road names (as OSM spells them) that are really a quarter's name, and the sign they get. */
const QUARTERS: [match: RegExp, text: string][] = [
  [/^Uke Road/i, 'UKE'],
  [/^Ujemen-Ozalla/i, 'UJEMEN OZALLA'],
  [/^Ikhirolo/i, 'IKHIROLO'],
  [/^Uhiele/i, 'UHIELE'],
  [/^Opoji/i, 'OPOJI'],
  [/^Ikhido/i, 'IKHIDO'],
  [/^Egbede/i, 'EGBEDE'],
  [/^Aloja/i, 'ALOJA'],
  // Well-known roads a viewer will recognise, shown by their own name
  [/^G1 Road/i, 'G1 ROAD'],
  [/^G2 Road/i, 'G2 ROAD'],
  [/^GT Road/i, 'GT ROAD'],
  [/^Poultry Road/i, 'POULTRY ROAD'],
  [/^University Road/i, 'UNIVERSITY ROAD'],
  [/^Market Road/i, 'MARKET ROAD'],
  [/^Oriafor Road/i, 'ORIAFOR ROAD'],
  [/^Efe Block Road/i, 'EFE BLOCK ROAD'],
  [/^Edeoghon Street/i, 'EDEOGHON STREET'],
  [/^Saint Nicolas Street/i, 'SAINT NICOLAS STREET'],
  [/^Debow Road/i, 'DEBOW ROAD'],
  [/^King Jesus Road/i, 'KING JESUS ROAD'],
  [/^Mamaland Road/i, 'MAMALAND ROAD'],
  [/^Faith Baptist Road/i, 'FAITH BAPTIST ROAD'],
  [/^Grail Center Road/i, 'GRAIL CENTER ROAD'],
  [/^Beverly Hills Road/i, 'BEVERLY HILLS ROAD'],
  [/^Palmwell Street/i, 'PALMWELL STREET'],]

const ahead = (roadId: string, dir: number) => (roadId === 'expressway' ? (dir > 0 ? '↑ AUCHI' : '↑ BENIN') : dir > 0 ? '↑ IRUEKPEN' : '↑ EKPOMA')
const MAX_GAP = 600

export const ALL_GANTRIES: SignGantry[] = (() => {
  const out: SignGantry[] = GANTRIES.map((g) => ({ ...g, sub: g.text === 'AAU MAIN GATE' ? 'AMBROSE ALLI UNIVERSITY' : ahead(g.road, g.dir) }))
  const has = (road: string, dir: number, s: number, within: number) => out.some((g) => g.road === road && g.dir === dir && Math.abs(g.s - s) < within)
  const add = (road: string, s: number, dir: number, text: string, sub?: string, within = 150) => {
    const r = roadById(road)
    if (s < 40 || s > r.length - 40 || has(road, dir, s, within)) return
    out.push({ text, road, s: Math.round(s), dir, sub: sub ?? ahead(road, dir) })
  }
  const nameOf = (id: string) => ROADS.find((r) => r.id === id)?.name ?? ''

  // Quarters, where a road of that name meets one of the long roads: a sign before the junction both ways
  for (const j of JUNCTIONS) {
    if (!LONG.includes(j.road) || j.end === 'mid') continue
    const q = QUARTERS.find(([re]) => re.test(nameOf(j.street)))
    if (!q) continue
    add(j.road, j.s - 140, 1, q[1], undefined, 120)
    add(j.road, j.s + 140, -1, q[1], undefined, 120)
  }
  add('ihumudumu-road', 120, 1, 'IHUMUDUMU')
  add('ihumudumu-road', 2200, -1, 'IHUMUDUMU')

  // Landmarks
  add('expressway', 700, 1, 'WELCOME TO EKPOMA', 'ESAN WEST · EDO STATE', 200)
  add('expressway', 11800, -1, 'WELCOME TO EKPOMA', 'ESAN WEST · EDO STATE', 200)
  add('expressway', 3650, 1, 'AMBROSE ALLI UNIVERSITY', '↑ MAIN GATE', 200)
  add('expressway', 4400, -1, 'AMBROSE ALLI UNIVERSITY', '↑ MAIN GATE', 200)
  add('expressway', 7200, 1, 'EKPOMA MARKET', '↑ MARKET SQUARE', 200)
  add('expressway', 7700, -1, 'EKPOMA MARKET', '↑ MARKET SQUARE', 200)
  add('expressway', 1900, 1, 'BENIN–AUCHI ROAD', '↑ AUCHI', 200)
  add('expressway', 6500, -1, 'BENIN–AUCHI ROAD', '↑ BENIN', 200)
  add('ihumudumu-road', 1500, 1, 'IHUMUDUMU ROAD', '↑ IRUEKPEN', 200)

  // One just ahead of every place you can set off from on the long roads
  for (const p of ROAD_PLACES) {
    if (!LONG.includes(p.road)) continue
    const dir = p.side
    const text = nearest(p.road, p.s)
    add(p.road, p.s + dir * 130, dir, text, `↑ ${p.label.toUpperCase()}`, 110)
  }

  // Fill: at most MAX_GAP between signs in each direction
  for (const id of LONG) {
    const L = roadById(id).length
    for (const dir of [1, -1]) {
      for (let guard = 0; guard < 400; guard++) {
        const list = out.filter((g) => g.road === id && g.dir === dir).map((g) => g.s).sort((a, b) => a - b)
        const pts = [0, ...list, L]
        let hole = -1
        for (let i = 1; i < pts.length; i++) if (pts[i]! - pts[i - 1]! > MAX_GAP * 1.15) { hole = i; break }
        if (hole < 0) break
        const mid = (pts[hole]! + pts[hole - 1]!) / 2
        out.push({ text: nearest(id, mid), road: id, s: Math.round(mid), dir, sub: ahead(id, dir) })
      }
    }
  }
  return out
})()

/** The quarter or village name closest along a long road, for a sign with nothing special to say. */
function nearest(roadId: string, s: number): string {
  let best = 'EKPOMA'
  let gap = Infinity
  for (const g of GANTRIES) {
    if (g.road !== roadId || g.text === 'AAU MAIN GATE') continue
    if (Math.abs(g.s - s) + 500 < gap) {
      gap = Math.abs(g.s - s) + 500
      best = g.text
    }
  }
  for (const j of JUNCTIONS) {
    if (j.road !== roadId || j.end === 'mid') continue
    const q = QUARTERS.find(([re]) => re.test(ROADS.find((r) => r.id === j.street)?.name ?? ''))
    if (q && Math.abs(j.s - s) < gap) {
      gap = Math.abs(j.s - s)
      best = q[1]
    }
  }
  return best
}
