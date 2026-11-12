import data from './drive-roads.json'

/*
 * The street-level driving world: real Ekpoma road lines from OpenStreetMap, baked into
 * drive-roads.json by scripts/osm/build-drive-roads.py (nothing is fetched at run time).
 * Metres, x east, z south. It is a ladder: the Benin-Auchi expressway ("highway": dual
 * carriageway with a divider) and the Ihumudumu road ("road": black asphalt, one lane each way)
 * side by side, joined by cross streets ("street": narrower asphalt). We drive on the right:
 * `off` is how far right of a road's centre line a point is, so travelling along +s you keep off > 0.
 */

export type RoadKind = 'highway' | 'road' | 'street'
type RawRoad = { id: string; name: string; kind: string; pts: number[][] }

export type Road = {
  id: string
  name: string
  kind: RoadKind
  pts: [number, number][]
  /** Distance along the road at each point. */
  at: number[]
  length: number
}

/** Where a cross street meets a long road. */
export type Junction = { name: string; road: string; s: number; side: number; street: string; end: 'start' | 'end' }
/** `inside`: no kerb of its own; you park at that place (the school gate, say) and walk in. */
export type RoadPlace = { id: string; label: string; road: string; s: number; side: number; inside?: string }
export type RoadSign = { text: string; road: string; s: number; side: number }

export const ROADS: Road[] = (data.roads as RawRoad[]).map((r) => {
  const pts = r.pts.map((p) => [p[0]!, p[1]!] as [number, number])
  const at = [0]
  for (let i = 1; i < pts.length; i++) at.push(at[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]))
  return { id: r.id, name: r.name, kind: (r.kind === 'highway' || r.kind === 'road' ? r.kind : 'street') as RoadKind, pts, at, length: at[at.length - 1]! }
})
export const JUNCTIONS = data.junctions as Junction[]
export const ROAD_PLACES = data.places as RoadPlace[]
export const ROAD_SIGNS = data.signs as RoadSign[]
export const OSM_CREDIT = data.attribution as string
/** Game metres per real metre (drives are shortened). */
export const ROAD_SCALE = data.scale as number

const BY_ID = new Map(ROADS.map((r) => [r.id, r]))
export const roadById = (id: string) => BY_ID.get(id) ?? ROADS[0]!

/** Highway: the divider (wall + verge) reaches this far each side of the centre line. */
export const MEDIAN = 2.9
/** How far from the centre line a car may go: onto the highway's sidewalk edge, or an asphalt road's shoulder. */
export const HALF: Record<RoadKind, number> = { highway: 12.3, road: 5.4, street: 4.1 }
/** Lane centres, right of the centre line: where cars spawn and park. */
export const LANE: Record<RoadKind, number> = { highway: 8.7, road: 2.3, street: 1.8 }
/** One piece of highway.glb is 60 long; pieces are laid a little closer so bends leave no gaps. */
export const TILE = 60
export const TILE_STEP = 58

/** Where a point a distance `s` along a road is, and which way the road runs there. */
export function pointAt(road: Road, s: number) {
  const d = Math.max(0, Math.min(road.length, s))
  let i = 1
  while (i < road.at.length - 1 && road.at[i]! < d) i++
  const a = road.pts[i - 1]!
  const b = road.pts[i]!
  const seg = road.at[i]! - road.at[i - 1]! || 1
  const t = (d - road.at[i - 1]!) / seg
  const dx = (b[0] - a[0]) / seg
  const dz = (b[1] - a[1]) / seg
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx, dz }
}

/** A spot beside (or on) a road: `off` metres right of the centre line at `s`. */
export function spotAt(roadId: string, s: number, off: number) {
  const road = roadById(roadId)
  const p = pointAt(road, s)
  // right of travel (dx, dz) is (-dz, dx)
  return { x: p.x - p.dz * off, z: p.z + p.dx * off, dx: p.dx, dz: p.dz, road }
}

/** Nearest point on one road: distance along it, and the offset right of its centre line. */
export function locateOn(road: Road, x: number, z: number) {
  let best = { s: 0, off: 0, gap: Infinity }
  for (let i = 1; i < road.pts.length; i++) {
    const a = road.pts[i - 1]!
    const b = road.pts[i]!
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const len2 = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / len2))
    const qx = a[0] + dx * t
    const qz = a[1] + dz * t
    const gap = Math.hypot(x - qx, z - qz)
    if (gap < best.gap) {
      const side = (x - qx) * -dz + (z - qz) * dx
      best = { s: road.at[i - 1]! + Math.sqrt(len2) * t, off: side >= 0 ? gap : -gap, gap }
    }
  }
  return best
}

/** Half-length of the gap in the highway's divider at a junction (so you can cross or turn). */
export const OPENING = 13

/** Is the highway's divider open at `s`? At every junction, and at both ends of the road (to turn round). */
export function dividerOpen(road: Road, s: number) {
  if (s < 26 || s > road.length - 26) return true
  for (const j of JUNCTIONS) if (j.road === road.id && Math.abs(j.s - s) < OPENING) return true
  return false
}

/** Can a car's centre be here? On a road's tarmac, and not in a highway's divider. */
export function drivable(x: number, z: number): boolean {
  for (const road of ROADS) {
    const p = locateOn(road, x, z)
    if (p.gap > HALF[road.kind]) continue
    // Past the last point of a road is off the map
    if ((p.s <= 0.01 || p.s >= road.length - 0.01) && p.gap > 0.5) continue
    if (road.kind === 'highway' && Math.abs(p.off) < MEDIAN && !dividerOpen(road, p.s)) continue
    return true
  }
  return false
}

export const blockedOnRoad = (x: number, z: number) => !drivable(x, z)

/** The road you are on (the nearest one), with where you are along it. */
export function roadUnder(x: number, z: number): { road: Road; s: number; off: number } | null {
  let best: { road: Road; s: number; off: number; gap: number } | null = null
  for (const road of ROADS) {
    const p = locateOn(road, x, z)
    // Inside a road's own width it wins outright; a street beats the long road it meets
    // (so the end of a side street, which lies on the long road's centre line, does not claim the long road's lanes)
    const gap = p.gap <= HALF[road.kind] ? (road.kind === 'street' ? -2 : -1) : p.gap
    if (!best || gap < best.gap) best = { road, s: p.s, off: p.off, gap }
  }
  return best && best.gap < 40 ? best : null
}

/**
 * The road the car is driving along: like roadUnder, but where two roads overlap (a junction) the
 * one that lines up with the car's heading wins, so a car going straight past a side street is
 * still on its own road.
 */
function roadAlong(x: number, z: number, h: number): { road: Road; s: number; off: number } | null {
  const base = roadUnder(x, z)
  if (!base) return null
  let best: { road: Road; s: number; off: number; fit: number } | null = null
  for (const road of ROADS) {
    const p = locateOn(road, x, z)
    if (p.gap > HALF[road.kind]) continue
    const t = pointAt(road, p.s)
    const fit = Math.abs(Math.sin(h) * t.dx + Math.cos(h) * t.dz)
    if (!best || fit > best.fit + 0.05) best = { road, s: p.s, off: p.off, fit }
  }
  return best && best.fit > 0.6 ? best : base
}

/** A place's parking spot at the kerb, on its side of its road. */
export function placeSpot(placeId: string) {
  const place = ROAD_PLACES.find((p) => p.id === placeId)
  if (!place) return null
  const road = roadById(place.road)
  const spot = spotAt(road.id, place.s, place.side * LANE[road.kind])
  // Traffic on the left-hand side of the line runs the other way
  const h = Math.atan2(spot.dx * place.side, spot.dz * place.side)
  return { x: spot.x, z: spot.z, h, place }
}

/** How close to a place's parking spot counts as "at" it. */
export const PARK_REACH = 16

/** The place you could park at from here. Where you said you are going wins over the gate it is inside. */
export function roadPlaceNear(x: number, z: number, destId?: string | null): { id: string; label: string } | null {
  let best: { id: string; label: string } | null = null
  let bestD = PARK_REACH
  for (const place of ROAD_PLACES) {
    if (place.inside && place.id !== destId) continue
    const spot = placeSpot(place.id)!
    const d = Math.hypot(spot.x - x, spot.z - z)
    if (d < bestD || (d < PARK_REACH && place.id === destId)) {
      bestD = place.id === destId ? -1 : d
      best = { id: place.id, label: place.label }
    }
  }
  return best
}

/**
 * Where a drive begins: at the kerb of the place you are leaving if it is on these roads, else on
 * the Ihumudumu road. With a destination on these roads the car starts in the lane that heads
 * toward it, already facing the right way.
 */
export function driveStartFrom(placeId: string, destId?: string | null): { x: number; z: number; h: number } {
  const spot = placeSpot(placeId)
  const road = spot ? roadById(spot.place.road) : (ROADS.find((r) => r.kind === 'road') ?? ROADS[0]!)
  const s = spot ? spot.place.s : road.length * 0.62
  // Which way along this road does the trip go? (default: the place's own side; toward town from Ihumudumu)
  let dir = spot ? spot.place.side : -1
  const centre = pointAt(road, s)
  const route = destId ? plan(centre.x, centre.z, destId) : null
  const first = route?.legs[0]
  if (first && first.road.id === road.id && Math.abs(first.to - first.from) > 1) dir = Math.sign(first.to - first.from)
  const p = spotAt(road.id, s, dir * LANE[road.kind])
  return { x: p.x, z: p.z, h: Math.atan2(p.dx * dir, p.dz * dir) }
}

/* —— Directions —— */

type Node = { id: string; x: number; z: number; links: { to: string; d: number; road: string }[] }

/** The ladder as a graph: one node per junction (a cross street's end on a long road). */
const GRAPH: Map<string, Node> = (() => {
  const nodes = new Map<string, Node>()
  const link = (a: string, b: string, d: number, road: string) => {
    nodes.get(a)!.links.push({ to: b, d, road })
    nodes.get(b)!.links.push({ to: a, d, road })
  }
  for (const j of JUNCTIONS) {
    const p = pointAt(roadById(j.road), j.s)
    nodes.set(`${j.street}:${j.end}`, { id: `${j.street}:${j.end}`, x: p.x, z: p.z, links: [] })
  }
  // Along each cross street, end to end
  for (const road of ROADS) {
    if (nodes.has(`${road.id}:start`) && nodes.has(`${road.id}:end`)) link(`${road.id}:start`, `${road.id}:end`, road.length, road.id)
  }
  // Along each long road, junction to junction
  for (const road of ROADS) {
    const on = JUNCTIONS.filter((j) => j.road === road.id).sort((a, b) => a.s - b.s)
    for (let i = 1; i < on.length; i++) link(`${on[i - 1]!.street}:${on[i - 1]!.end}`, `${on[i]!.street}:${on[i]!.end}`, on[i]!.s - on[i - 1]!.s, road.id)
  }
  return nodes
})()

/** The junction nodes you can reach from a point on a road without leaving it, with the distance to each. */
function exits(road: Road, s: number): { id: string; d: number; s: number }[] {
  if (road.kind === 'street') {
    return [
      { id: `${road.id}:start`, d: s, s: 0 },
      { id: `${road.id}:end`, d: road.length - s, s: road.length },
    ].filter((e) => GRAPH.has(e.id))
  }
  const on = JUNCTIONS.filter((j) => j.road === road.id).sort((a, b) => a.s - b.s)
  const before = [...on].reverse().find((j) => j.s <= s)
  const after = on.find((j) => j.s > s)
  return [before, after].filter((j): j is Junction => Boolean(j)).map((j) => ({ id: `${j.street}:${j.end}`, d: Math.abs(j.s - s), s: j.s }))
}

export type Guidance = {
  /** Metres still to drive (game metres). */
  left: number
  /** What to do at the next point. */
  turn: 'left' | 'right' | 'straight' | 'arrive' | 'uturn'
  /** The road to turn onto, or the place you are arriving at. */
  onto: string
  /** Metres to that point. */
  in: number
  /** Where that point is, to aim the arrow. */
  x: number
  z: number
  /** Arriving: which side the place is on. */
  side?: 'left' | 'right'
}

type Leg = { road: Road; from: number; to: number }

/** What setting off the wrong way costs, in metres: a turn-around is worth this much extra driving. */
const BACK_COST = 160

/**
 * The shortest way from a point to a place, as stretches of road to drive in order. With the car's
 * heading `h`, a way that starts behind the car costs a turn-around, so the route holds steady
 * instead of flipping between "ahead" and "behind" as you drive.
 */
function plan(x: number, z: number, placeId: string, h?: number): { legs: Leg[]; total: number; place: RoadPlace } | null {
  const place = ROAD_PLACES.find((p) => p.id === placeId)
  const here = h === undefined ? roadUnder(x, z) : roadAlong(x, z, h)
  if (!place || !here) return null
  const goalRoad = roadById(place.road)
  // Which way along this road the car points: +1 up it, -1 down it, 0 unknown
  let fwd = 0
  if (h !== undefined) {
    const t = pointAt(here.road, here.s)
    const along = Math.sin(h) * t.dx + Math.cos(h) * t.dz
    fwd = Math.abs(along) > 0.3 ? Math.sign(along) : 0
  }
  const backCost = (towardS: number) => (fwd !== 0 && Math.sign(towardS - here.s) === -fwd ? BACK_COST : 0)
  const direct = here.road.id === goalRoad.id ? Math.abs(place.s - here.s) + backCost(place.s) : Infinity

  const dist = new Map<string, number>()
  const prev = new Map<string, { from: string; road: string }>()
  const open = new Set<string>()
  for (const e of exits(here.road, here.s)) {
    const d = e.d + backCost(e.s)
    dist.set(e.id, d)
    open.add(e.id)
  }
  const ends = new Map(exits(goalRoad, place.s).map((e) => [e.id, e.d]))
  let best = direct
  let last: string | null = null
  while (open.size) {
    let cur = ''
    for (const id of open) if (!cur || dist.get(id)! < dist.get(cur)!) cur = id
    open.delete(cur)
    const d = dist.get(cur)!
    if (d >= best) break
    if (ends.has(cur) && d + ends.get(cur)! < best) {
      best = d + ends.get(cur)!
      last = cur
    }
    for (const link of GRAPH.get(cur)!.links) {
      const nd = d + link.d
      if (nd < (dist.get(link.to) ?? Infinity)) {
        dist.set(link.to, nd)
        prev.set(link.to, { from: cur, road: link.road })
        open.add(link.to)
      }
    }
  }
  if (!Number.isFinite(best)) return null
  if (last === null) return { legs: [{ road: here.road, from: here.s, to: place.s }], total: Math.abs(place.s - here.s), place }

  // The junctions passed, first to last, with the road driven into each
  const nodes: { id: string; roadIn: string }[] = []
  let node: string = last
  for (;;) {
    const p = prev.get(node)
    nodes.unshift({ id: node, roadIn: p ? p.road : here.road.id })
    if (!p) break
    node = p.from
  }
  const legs: Leg[] = []
  let at = { road: here.road, s: here.s }
  for (const n of nodes) {
    const spot = GRAPH.get(n.id)!
    const road = roadById(n.roadIn)
    legs.push({ road, from: at.road.id === road.id ? at.s : locateOn(road, spot.x, spot.z).s, to: locateOn(road, spot.x, spot.z).s })
    // Carry on from this junction along whichever road comes next
    at = { road, s: locateOn(road, spot.x, spot.z).s }
    const next = nodes[nodes.indexOf(n) + 1]
    const nextRoad = roadById(next ? next.roadIn : goalRoad.id)
    at = { road: nextRoad, s: locateOn(nextRoad, spot.x, spot.z).s }
  }
  legs.push({ road: goalRoad, from: at.s, to: place.s })
  // Drop stretches of no length, and join stretches that stay on one road
  const tidy: Leg[] = []
  for (const leg of legs) {
    const prevLeg = tidy[tidy.length - 1]
    if (prevLeg && prevLeg.road.id === leg.road.id && Math.abs(prevLeg.to - leg.from) < 1) prevLeg.to = leg.to
    else if (Math.abs(leg.to - leg.from) > 0.5 || leg === legs[legs.length - 1]) tidy.push({ ...leg })
  }
  return { legs: tidy, total: tidy.reduce((sum, leg) => sum + Math.abs(leg.to - leg.from), 0), place }
}

/**
 * Facing away from the way the trip starts? Then where to turn around: the next gap in the
 * highway's divider, or just up the road on the others. `away` is the way the car is heading
 * along the road (+1 / -1), `s` where it is, `turnS` where to turn.
 */
function turnBack(x: number, z: number, h: number, first: Leg): { s: number; turnS: number; away: number } | null {
  const dir = Math.sign(first.to - first.from) || 1
  const at = locateOn(first.road, x, z)
  const t = pointAt(first.road, at.s)
  if ((Math.sin(h) * t.dx + Math.cos(h) * t.dz) * dir > -0.25) return null
  const away = -dir
  let turnS = at.s + away * 34
  if (first.road.kind === 'highway') {
    const gap = JUNCTIONS.filter((j) => j.road === first.road.id && (j.s - at.s) * away > 18).sort((a, b) => (a.s - b.s) * away)[0]
    if (gap) turnS = gap.s
  }
  turnS = Math.max(8, Math.min(first.road.length - 8, turnS))
  return { s: at.s, turnS, away }
}

/**
 * Turn-by-turn from where the car is (and which way it faces) to a place on these roads:
 * the next thing to do, how far it is, and how far the whole trip still is. Null when the place
 * is not on the driving roads.
 */
export function guide(x: number, z: number, h: number, placeId: string): Guidance | null {
  const route = plan(x, z, placeId, h)
  if (!route) return null
  const goal = placeSpot(placeId)!
  const first = route.legs[0]!
  const next = route.legs[1]
  const back = turnBack(x, z, h, first)
  if (back) {
    const p = pointAt(first.road, back.turnS)
    const out = Math.abs(back.turnS - back.s)
    return { left: route.total + out * 2, turn: 'uturn', onto: route.place.label, in: out, x: p.x, z: p.z }
  }
  if (!next) {
    const fx = Math.sin(h)
    const fz = Math.cos(h)
    const side = (goal.x - x) * -fz + (goal.z - z) * fx >= 0 ? 'right' : 'left'
    return { left: route.total, turn: 'arrive', onto: route.place.label, in: route.total, x: goal.x, z: goal.z, side }
  }
  // The turn is where the first stretch ends: compare the way we arrive with the way the next road leaves
  const at = pointAt(first.road, first.to)
  const dirIn = Math.sign(first.to - first.from) || 1
  const out = pointAt(next.road, next.from)
  const dirOut = Math.sign(next.to - next.from) || 1
  const cross = at.dx * dirIn * (out.dz * dirOut) - at.dz * dirIn * (out.dx * dirOut)
  const dot = at.dx * dirIn * (out.dx * dirOut) + at.dz * dirIn * (out.dz * dirOut)
  const angle = Math.atan2(cross, dot)
  const turn = Math.abs(angle) < 0.5 ? 'straight' : angle > 0 ? 'right' : 'left'
  return { left: route.total, turn, onto: next.road.name || 'the side street', in: Math.abs(first.to - first.from), x: at.x, z: at.z }
}

/**
 * Points down the lane you should drive in, from the car toward the place: [x, z, heading], one
 * every `step` metres, at most `reach` metres ahead. For the arrows painted on the road.
 */
export function routeAhead(x: number, z: number, h: number, placeId: string, step = 9, reach = 330): [number, number, number][] {
  const route = plan(x, z, placeId, h)
  if (!route) return []
  const out: [number, number, number][] = []
  let gone = 0
  let carry = step * 1.4 // the first arrow sits a little ahead of the bonnet
  const legs = route.legs
  // The place is behind you: lead on up your own lane to where you can turn, across, and back
  const back = turnBack(x, z, h, legs[0]!)
  if (back) {
    const road = legs[0]!.road
    const lane = LANE[road.kind]
    const run = Math.abs(back.turnS - back.s)
    for (let d = carry; d < run; d += step) {
      const p = spotAt(road.id, back.s + back.away * d, back.away * lane)
      out.push([p.x, p.z, Math.atan2(p.dx * back.away, p.dz * back.away)])
    }
    const a = spotAt(road.id, back.turnS, back.away * lane)
    const b = spotAt(road.id, back.turnS, -back.away * lane)
    const across = Math.atan2(b.x - a.x, b.z - a.z)
    for (const k of [0.2, 0.5, 0.8]) out.push([a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k, across])
    return out
  }
  for (const leg of legs) {
    const dir = Math.sign(leg.to - leg.from) || 1
    const len = Math.abs(leg.to - leg.from)
    for (let d = carry; d <= len; d += step) {
      const p = spotAt(leg.road.id, leg.from + dir * d, dir * LANE[leg.road.kind])
      const h = Math.atan2(p.dx * dir, p.dz * dir)
      // Just round a corner the new lane can start beyond the last arrow: skip arrows that sit
      // behind it, or the road shows arrows pointing both ways at the junction
      const last = out[out.length - 1]
      if (last && (p.x - last[0]) * Math.sin(h) + (p.z - last[1]) * Math.cos(h) < 2) continue
      out.push([p.x, p.z, h])
      if (gone + d > reach) return out
    }
    carry = step - ((len - carry) % step)
    if (carry >= step) carry -= step
    gone += len
  }
  return out
}
