'use client'

import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import type { Group, Mesh } from 'three'
import { CharacterFigure, type FigurePose } from '@/components/look/character-figure'
import { DEFAULT_APPEARANCE, normalizeAppearance, type Appearance } from '@/lib/game/look'
import type { FurnitureAction, FurnitureId } from '@/lib/game/room-furniture'

/*
 * The player's character inside the selfcon. Coordinates are the room GLB's own
 * (floor at y 0, inside walls x/z ≈ ±3.4), so this mounts inside the model's group.
 * Tap the floor to walk there; arrow keys / WASD also work on desktop.
 */

const RADIUS = 0.28
const SPEED = 1.7
const BOUNDS = { minX: -3.4 + RADIUS, maxX: 3.4 - RADIUS, minZ: -3.4 + RADIUS, maxZ: 3.4 - RADIUS }
const START: [number, number] = [1.2, 2.3]
const STORAGE_KEY = 'ekpoma-room-player-spot-v1'

/** Furniture footprints [minX, minZ, maxX, maxZ] from selfcon.glb. */
const FURNITURE: [number, number, number, number][] = [
  [-3.4, 0.5, -1.5, 2.6], // bed
  [-3.1, -3.3, -1.9, -2.7], // shelf
  [-2.0, -3.1, -0.3, -2.3], // table + wooden chair
  [0.0, -3.1, 1.1, -2.4], // cooler
  [1.9, -3.4, 3.6, -2.4], // barrel + jerrycans
  [-0.05, 0.6, 0.6, 1.2], // red chair
  [2.2, 0.3, 2.9, 1.4], // bucket + basin
  [2.7, 1.3, 3.4, 1.9], // toilet
]

function blocked(x: number, z: number) {
  if (x < BOUNDS.minX || x > BOUNDS.maxX || z < BOUNDS.minZ || z > BOUNDS.maxZ) return true
  return FURNITURE.some(([x0, z0, x1, z1]) => x > x0 - RADIUS && x < x1 + RADIUS && z > z0 - RADIUS && z < z1 + RADIUS)
}

/* —— Path finding: A* on a small grid over the floor, then straightened —— */
const CELL = 0.2
const COLS = Math.floor((BOUNDS.maxX - BOUNDS.minX) / CELL) + 1
const ROWS = Math.floor((BOUNDS.maxZ - BOUNDS.minZ) / CELL) + 1
const cellX = (i: number) => BOUNDS.minX + i * CELL
const cellZ = (j: number) => BOUNDS.minZ + j * CELL
const FREE = Array.from({ length: COLS * ROWS }, (_, k) => !blocked(cellX(k % COLS), cellZ(Math.floor(k / COLS))))

function nearestCell(x: number, z: number) {
  const i0 = Math.round((x - BOUNDS.minX) / CELL)
  const j0 = Math.round((z - BOUNDS.minZ) / CELL)
  let best = -1
  let bestD = Infinity
  for (let k = 0; k < FREE.length; k++) {
    if (!FREE[k]) continue
    const d = (k % COLS - i0) ** 2 + (Math.floor(k / COLS) - j0) ** 2
    if (d < bestD) {
      bestD = d
      best = k
    }
  }
  return best
}

function clearLine(ax: number, az: number, bx: number, bz: number) {
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.08)
  for (let s = 1; s <= steps; s++) {
    const t = s / steps
    if (blocked(ax + (bx - ax) * t, az + (bz - az) * t)) return false
  }
  return true
}

function findPath(from: [number, number], to: [number, number]): [number, number][] {
  const goal = blocked(...to) ? nearestCell(...to) : -1
  const end: [number, number] = goal >= 0 ? [cellX(goal % COLS), cellZ(Math.floor(goal / COLS))] : to
  if (clearLine(...from, ...end)) return [end]

  const start = nearestCell(...from)
  const target = nearestCell(...end)
  const cost = new Float32Array(FREE.length).fill(Infinity)
  const prev = new Int32Array(FREE.length).fill(-1)
  const open = new Set<number>([start])
  const h = (k: number) => Math.hypot(k % COLS - (target % COLS), Math.floor(k / COLS) - Math.floor(target / COLS))
  cost[start] = 0
  while (open.size) {
    let k = -1
    let f = Infinity
    for (const c of open) {
      const score = cost[c] + h(c)
      if (score < f) {
        f = score
        k = c
      }
    }
    if (k === target) break
    open.delete(k)
    const i = k % COLS
    const j = Math.floor(k / COLS)
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue
        const ni = i + di
        const nj = j + dj
        if (ni < 0 || nj < 0 || ni >= COLS || nj >= ROWS) continue
        const n = nj * COLS + ni
        // No cutting corners past furniture
        if (!FREE[n] || (di && dj && (!FREE[j * COLS + ni] || !FREE[nj * COLS + i]))) continue
        const next = cost[k] + (di && dj ? Math.SQRT2 : 1)
        if (next < cost[n]) {
          cost[n] = next
          prev[n] = k
          open.add(n)
        }
      }
    }
  }
  if (prev[target] < 0 && target !== start) return []

  const cells: [number, number][] = []
  for (let k = target; k >= 0 && k !== start; k = prev[k]) cells.unshift([cellX(k % COLS), cellZ(Math.floor(k / COLS))])
  cells[cells.length - 1] = end
  // Straighten: skip waypoints we can walk past in a straight line
  const path: [number, number][] = []
  let at = from
  let idx = 0
  while (idx < cells.length) {
    let far = idx
    while (far + 1 < cells.length && clearLine(...at, ...cells[far + 1])) far++
    path.push(cells[far])
    at = cells[far]
    idx = far + 1
  }
  return path
}

function readSpot(): [number, number] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const spot = raw ? (JSON.parse(raw) as [number, number]) : null
    if (spot && !blocked(spot[0], spot[1])) return spot
  } catch {
    /* storage blocked */
  }
  return START
}

function saveSpot(x: number, z: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([Math.round(x * 100) / 100, Math.round(z * 100) / 100]))
  } catch {
    /* storage blocked */
  }
}

const KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
}

/** Where the character stands to use each piece, and where/how it sits or lies (GLB coords). */
const SPOTS: Record<FurnitureId, { approach: [number, number]; at: [number, number, number]; heading: number }> = {
  bed: { approach: [-1.1, 1.7], at: [-2.45, 0.54, 2.4], heading: 0 },
  'red-chair': { approach: [0.35, 1.65], at: [0.28, -0.25, 0.86], heading: 0.245 },
  'desk-chair': { approach: [-1.75, -1.9], at: [-1.75, -0.28, -2.62], heading: 0 },
  toilet: { approach: [2.15, 2.0], at: [2.95, -0.18, 1.6], heading: -Math.PI / 2 },
  bucket: { approach: [1.6, 0.6], at: [1.95, 0, 0.6], heading: Math.PI / 2 },
}

/** Invisible tap boxes over each piece: [minX, minY, minZ, maxX, maxY, maxZ]. */
const TAP_BOXES: Record<FurnitureId, [number, number, number, number, number, number]> = {
  bed: [-3.4, 0, 0.5, -1.5, 0.6, 2.6],
  'red-chair': [-0.05, 0, 0.6, 0.6, 1.3, 1.2],
  'desk-chair': [-2.05, 0, -2.85, -1.45, 1.3, -2.35],
  toilet: [2.65, 0, 1.25, 3.35, 1.05, 1.95],
  bucket: [2.15, 0, 0.25, 2.95, 0.7, 1.45],
}

/** Lets the room screen tell the character to go and use something. */
export type RoomPlayerControl = {
  use?: (furniture: FurnitureId, action: FurnitureAction, onStart: () => void) => void
}

export function RoomPlayer({
  appearance,
  onFurniture,
  control,
}: {
  appearance?: Appearance
  onFurniture?: (id: FurnitureId) => void
  control?: RoomPlayerControl
}) {
  const look = normalizeAppearance(appearance ?? DEFAULT_APPEARANCE)
  const body = useRef<Group>(null)
  const shadow = useRef<Mesh>(null)
  const marker = useRef<Mesh>(null)
  const pos = useRef<[number, number]>(START)
  /** Waypoints still to walk (last one is where the player tapped). */
  const path = useRef<[number, number][]>([])
  const held = useRef(new Set<string>())
  const heading = useRef(-Math.PI / 4)
  const moving = useRef(false)
  const pose = useRef<FigurePose | null>(null)
  /** Furniture the character is heading to or using right now. */
  const task = useRef<{
    furniture: FurnitureId
    action: FurnitureAction
    onStart: () => void
    using: boolean
    until: number
  } | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    pos.current = readSpot()
    setReady(true)
  }, [])

  const stopUsing = () => {
    if (!task.current) return
    if (task.current.using) {
      pos.current = [...SPOTS[task.current.furniture].approach]
      saveSpot(...pos.current)
    }
    task.current = null
    pose.current = null
  }

  useEffect(() => {
    if (!control) return
    control.use = (furniture, action, onStart) => {
      stopUsing()
      held.current.clear()
      task.current = { furniture, action, onStart, using: false, until: 0 }
      path.current = findPath(pos.current, SPOTS[furniture].approach)
    }
    return () => {
      control.use = undefined
    }
  }, [control])

  // Arrow keys / WASD — screen-ish directions for the default camera angle
  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
    }
    const down = (e: KeyboardEvent) => {
      if (!KEYS[e.code] || typing(e)) return
      stopUsing()
      held.current.add(e.code)
      path.current = []
      e.preventDefault()
    }
    const up = (e: KeyboardEvent) => {
      if (!held.current.delete(e.code)) return
      if (held.current.size === 0) saveSpot(...pos.current)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useFrame((state, delta) => {
    const group = body.current
    if (!group) return
    const dt = Math.min(delta, 0.05)
    const now = state.clock.elapsedTime

    // —— Using a piece of furniture: hold the pose, then stand back up ——
    const job = task.current
    if (job?.using) {
      if (now >= job.until) {
        stopUsing()
      } else {
        const spot = SPOTS[job.furniture]
        group.position.set(...spot.at)
        if (job.action.style === 'lie') group.rotation.set(-Math.PI / 2, 0, 0)
        else group.rotation.set(0, spot.heading, 0)
        if (shadow.current) shadow.current.visible = false
        if (marker.current) marker.current.visible = false
        moving.current = false
        return
      }
    }
    if (shadow.current) shadow.current.visible = true
    group.position.y = 0
    group.rotation.x = 0
    group.rotation.z = 0

    let dx = 0
    let dz = 0

    if (held.current.size) {
      for (const code of held.current) {
        dx += KEYS[code][0]
        dz += KEYS[code][1]
      }
      // Rotate input 45° so "up" walks away from the camera (camera sits at −x, +z)
      const rx = (dx + dz) * Math.SQRT1_2
      const rz = (dz - dx) * Math.SQRT1_2
      dx = rx
      dz = rz
    } else if (path.current.length) {
      const [wx, wz] = path.current[0]
      dx = wx - pos.current[0]
      dz = wz - pos.current[1]
      if (Math.hypot(dx, dz) < 0.04) {
        path.current.shift()
        if (!path.current.length) saveSpot(...pos.current)
        dx = 0
        dz = 0
      }
    } else if (job && !job.using) {
      // Arrived next to the furniture: start using it
      job.using = true
      job.until = now + job.action.seconds
      pose.current = job.action.style === 'lie' ? 'idle' : job.action.style
      job.onStart()
    }

    const length = Math.hypot(dx, dz)
    moving.current = length > 0
    if (moving.current) {
      const step = Math.min(SPEED * dt, held.current.size ? Infinity : length)
      const sx = (dx / length) * step
      const sz = (dz / length) * step
      // Slide along furniture/walls: try each axis on its own
      let [x, z] = pos.current
      if (!blocked(x + sx, z)) x += sx
      if (!blocked(x, z + sz)) z += sz
      if (x === pos.current[0] && z === pos.current[1]) {
        path.current = [] // walked into something — stop here
        moving.current = false
      }
      pos.current = [x, z]
      heading.current = Math.atan2(dx, dz)
    }

    group.position.x = pos.current[0]
    group.position.z = pos.current[1]
    // Turn smoothly toward the walking direction
    let turn = heading.current - group.rotation.y
    turn = Math.atan2(Math.sin(turn), Math.cos(turn))
    group.rotation.y += turn * Math.min(1, dt * 10)

    if (marker.current) {
      const last = path.current[path.current.length - 1]
      marker.current.visible = !!last && !task.current
      if (last) marker.current.position.set(last[0], 0.03, last[1])
    }
  })

  const onFloorTap = (event: ThreeEvent<MouseEvent>) => {
    // Ignore taps that were really a camera drag
    if (event.delta > 6) return
    event.stopPropagation()
    const local = event.object.parent?.worldToLocal(event.point.clone()) ?? event.point
    const x = Math.min(BOUNDS.maxX, Math.max(BOUNDS.minX, local.x))
    const z = Math.min(BOUNDS.maxZ, Math.max(BOUNDS.minZ, local.z))
    stopUsing()
    held.current.clear()
    path.current = findPath(pos.current, [x, z])
  }

  const pointer = {
    onPointerOver: () => (document.body.style.cursor = 'pointer'),
    onPointerOut: () => (document.body.style.cursor = ''),
  }

  if (!ready) return null

  return (
    <>
      {/* Invisible floor that takes taps */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} onClick={onFloorTap} {...pointer}>
        <planeGeometry args={[6.8, 6.8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Invisible boxes over furniture: tap to see what you can do */}
      {onFurniture
        ? (Object.keys(TAP_BOXES) as FurnitureId[]).map((id) => {
            const [x0, y0, z0, x1, y1, z1] = TAP_BOXES[id]
            return (
              <mesh
                key={id}
                position={[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]}
                onClick={(event) => {
                  if (event.delta > 6) return
                  event.stopPropagation()
                  onFurniture(id)
                }}
                {...pointer}
              >
                <boxGeometry args={[x1 - x0, y1 - y0, z1 - z0]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            )
          })
        : null}

      <mesh ref={marker} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.16, 0.24, 28]} />
        <meshBasicMaterial color="#2f7cf6" transparent opacity={0.8} depthWrite={false} />
      </mesh>

      <group ref={body} position={[pos.current[0], 0, pos.current[1]]} rotation={[0, heading.current, 0]}>
        <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
          <circleGeometry args={[0.32, 24]} />
          <meshBasicMaterial color="#000" transparent opacity={0.18} depthWrite={false} />
        </mesh>
        <CharacterFigure appearance={look} moving={moving} pose={pose} />
      </group>
    </>
  )
}
