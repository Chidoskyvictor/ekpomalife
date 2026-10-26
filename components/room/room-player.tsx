'use client'

import { Html } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Group, Mesh } from 'three'
import { CharacterFigure, type FigurePose } from '@/components/look/character-figure'
import { DEFAULT_APPEARANCE, normalizeAppearance, type Appearance } from '@/lib/game/look'
import type { FurnitureAction } from '@/lib/game/room-furniture'
import { buyUi } from '@/lib/game/home-buy-store'

/** What the character needs to know to use a piece: the pose and how long to hold it. */
type UseHow = Pick<FurnitureAction, 'style' | 'seconds'>
import type { FurnitureSpot, RoomLayout, SpotKey } from '@/lib/game/room-layouts'
import { useActivity } from '@/lib/game/activity'
import bubbleStyles from './head-bubble.module.css'

/*
 * The player's character inside a home. Coordinates are the room GLB's own (floor at
 * y 0), so this mounts inside the model's group. The home's floors, furniture and
 * spots come from room-layouts.ts. Tap the floor to walk there; arrow keys / WASD too.
 */

const RADIUS = 0.28
const CELL = 0.2

type Nav = ReturnType<typeof makeNav>

/** Walkable test + A* path finding on a small grid over the home's floors. */
function makeNav(layout: RoomLayout) {
  const bounds = {
    minX: Math.min(...layout.floors.map((f) => f[0])),
    minZ: Math.min(...layout.floors.map((f) => f[1])),
    maxX: Math.max(...layout.floors.map((f) => f[2])),
    maxZ: Math.max(...layout.floors.map((f) => f[3])),
  }

  function blocked(x: number, z: number) {
    if (!layout.floors.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1)) return true
    return layout.blocks.some(
      ([x0, z0, x1, z1]) => x > x0 - RADIUS && x < x1 + RADIUS && z > z0 - RADIUS && z < z1 + RADIUS,
    )
  }

  const COLS = Math.floor((bounds.maxX - bounds.minX) / CELL) + 1
  const ROWS = Math.floor((bounds.maxZ - bounds.minZ) / CELL) + 1
  const cellX = (i: number) => bounds.minX + i * CELL
  const cellZ = (j: number) => bounds.minZ + j * CELL
  const FREE = Array.from({ length: COLS * ROWS }, (_, k) => !blocked(cellX(k % COLS), cellZ(Math.floor(k / COLS))))

  function nearestCell(x: number, z: number) {
    const i0 = Math.round((x - bounds.minX) / CELL)
    const j0 = Math.round((z - bounds.minZ) / CELL)
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

  return { bounds, blocked, findPath }
}

const storageKey = (layout: RoomLayout) => `ekpoma-room-player-spot-v1:${layout.id}`

function readSpot(layout: RoomLayout, nav: Nav): [number, number] {
  try {
    const raw = window.localStorage.getItem(storageKey(layout))
    const spot = raw ? (JSON.parse(raw) as [number, number]) : null
    if (spot && !nav.blocked(spot[0], spot[1])) return spot
  } catch {
    /* storage blocked */
  }
  return layout.start
}

function saveSpot(layout: RoomLayout, x: number, z: number) {
  try {
    window.localStorage.setItem(storageKey(layout), JSON.stringify([Math.round(x * 100) / 100, Math.round(z * 100) / 100]))
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

/** Lets the room screen tell the character to go and use something. */
export type RoomPlayerControl = {
  use?: (furniture: SpotKey, action: UseHow, hooks: UseHooks) => void
  /** Stand up / stop walking over (e.g. the busy pill was tapped). */
  stop?: () => void
}

/** onStart: sat / lay down · onDone: the time ran out · onAbort: stopped early (walked away, tapped stop). */
export type UseHooks = { onStart: () => void; onDone: () => void; onAbort: () => void }

/** Where the character is and what it's doing, reported every frame (e.g. for the live club crowd). */
export type PlayerMove = { x: number; y: number; z: number; h: number; pose: FigurePose; moving: boolean }

export function RoomPlayer({
  layout,
  appearance,
  onFurniture,
  control,
  onMove,
  spawn,
}: {
  layout: RoomLayout
  /** Start here instead of the last saved spot (e.g. at your gate / just inside the door). */
  spawn?: [number, number]
  appearance?: Appearance
  onFurniture?: (id: SpotKey) => void
  control?: RoomPlayerControl
  onMove?: (move: PlayerMove) => void
}) {
  const look = normalizeAppearance(appearance ?? DEFAULT_APPEARANCE)
  const nav = useMemo(() => makeNav(layout), [layout])
  const { blocked, findPath, bounds: BOUNDS } = nav
  const SPOTS = layout.spots as Record<SpotKey, FurnitureSpot>
  const TAP_BOXES = layout.tapBoxes
  const body = useRef<Group>(null)
  const shadow = useRef<Mesh>(null)
  const marker = useRef<Mesh>(null)
  const pos = useRef<[number, number]>(layout.start)
  /** Waypoints still to walk (last one is where the player tapped). */
  const path = useRef<[number, number][]>([])
  const held = useRef(new Set<string>())
  const heading = useRef(-Math.PI / 4)
  const moving = useRef(false)
  const pose = useRef<FigurePose | null>(null)
  /** Furniture the character is heading to or using right now. */
  const task = useRef<{
    furniture: SpotKey
    action: UseHow
    hooks: UseHooks
    using: boolean
    until: number
  } | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    pos.current = spawn && !nav.blocked(...spawn) ? spawn : readSpot(layout, nav)
    path.current = []
    setReady(true)
    // spawn is read once per home: walking around (or bought furniture changing nav) must not snap back to it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.id])

  // Furniture bought or moved while you stand there: step out to the door instead of being stuck inside it
  useEffect(() => {
    if (!nav.blocked(...pos.current)) return
    pos.current = layout.start
    path.current = []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav])

  const stopUsing = (finished = false) => {
    const job = task.current
    if (!job) return
    if (job.using) {
      pos.current = [...SPOTS[job.furniture].approach]
      saveSpot(layout, ...pos.current)
    }
    task.current = null
    pose.current = null
    if (finished) job.hooks.onDone()
    else job.hooks.onAbort()
  }

  useEffect(() => {
    if (!control) return
    control.use = (furniture, action, hooks) => {
      stopUsing()
      held.current.clear()
      task.current = { furniture, action, hooks, using: false, until: 0 }
      path.current = findPath(pos.current, SPOTS[furniture].approach)
    }
    control.stop = () => {
      stopUsing()
      path.current = []
    }
    return () => {
      control.use = undefined
      control.stop = undefined
    }
  }, [control, findPath, SPOTS])

  // Arrow keys / WASD — screen-ish directions for the default camera angle
  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
    }
    const down = (e: KeyboardEvent) => {
      // Buy mode moves the preview with the arrows, not the character
      if (!KEYS[e.code] || typing(e) || buyUi().active) return
      stopUsing()
      held.current.add(e.code)
      path.current = []
      e.preventDefault()
    }
    const up = (e: KeyboardEvent) => {
      if (!held.current.delete(e.code)) return
      if (held.current.size === 0) saveSpot(layout, ...pos.current)
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
        stopUsing(true)
      } else {
        const spot = SPOTS[job.furniture]
        group.position.set(...spot.at)
        if (job.action.style === 'lie') group.rotation.set(-Math.PI / 2, 0, 0)
        else group.rotation.set(0, spot.heading, 0)
        if (shadow.current) shadow.current.visible = false
        if (marker.current) marker.current.visible = false
        moving.current = false
        onMove?.({
          x: group.position.x,
          y: group.position.y,
          z: group.position.z,
          h: spot.heading,
          pose: pose.current ?? 'idle',
          moving: false,
        })
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
      // Rotate input so "up" walks away from the camera: 45° for the corner view (camera at −x, +z)
      const turn = layout.view === 'front' ? 0 : Math.PI / 4
      const rx = dx * Math.cos(turn) + dz * Math.sin(turn)
      const rz = dz * Math.cos(turn) - dx * Math.sin(turn)
      dx = rx
      dz = rz
    } else if (path.current.length) {
      const [wx, wz] = path.current[0]
      dx = wx - pos.current[0]
      dz = wz - pos.current[1]
      if (Math.hypot(dx, dz) < 0.04) {
        path.current.shift()
        if (!path.current.length) saveSpot(layout, ...pos.current)
        dx = 0
        dz = 0
      }
    } else if (job && !job.using) {
      // Arrived next to the furniture: start using it
      job.using = true
      job.until = now + job.action.seconds
      pose.current = job.action.style === 'lie' || job.action.style === 'stand' ? 'idle' : job.action.style
      job.hooks.onStart()
    }

    const length = Math.hypot(dx, dz)
    moving.current = length > 0
    if (moving.current) {
      const step = Math.min(layout.speed * dt, held.current.size ? Infinity : length)
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
    onMove?.({
      x: group.position.x,
      y: 0,
      z: group.position.z,
      h: group.rotation.y,
      pose: moving.current ? 'walk' : 'idle',
      moving: moving.current,
    })
  })

  const onFloorTap = (event: ThreeEvent<MouseEvent>) => {
    // Ignore taps that were really a camera drag, and every tap while shopping (it picks furniture instead)
    if (event.delta > 6 || buyUi().active) return
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
      {/* Invisible floors that take taps */}
      {layout.floors.map(([x0, z0, x1, z1]) => (
        <mesh
          key={`${x0},${z0}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[(x0 + x1) / 2, 0.02, (z0 + z1) / 2]}
          onClick={onFloorTap}
          {...pointer}
        >
          <planeGeometry args={[x1 - x0 + RADIUS * 2, z1 - z0 + RADIUS * 2]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}

      {/* Invisible boxes over furniture: tap to see what you can do */}
      {onFurniture
        ? (Object.keys(TAP_BOXES) as SpotKey[]).map((id) => {
            const [x0, y0, z0, x1, y1, z1] = TAP_BOXES[id]!
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
      <HeadBubble body={body} lying={() => task.current?.using === true && task.current.action.style === 'lie'} />
    </>
  )
}

/**
 * What you're doing, over your head: the action's emoji and the seconds left ("😴 6s") while
 * the busy tile runs. Follows the character (lower when lying down).
 */
function HeadBubble({ body, lying }: { body: React.RefObject<Group | null>; lying: () => boolean }) {
  const activity = useActivity()
  const anchor = useRef<Group>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!activity) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [activity])

  useFrame(() => {
    const from = body.current
    const to = anchor.current
    if (!from || !to) return
    to.position.set(from.position.x, lying() ? 1.15 : 2.15, from.position.z)
  })

  const left = activity ? Math.max(0, Math.ceil(activity.seconds - (now - activity.startedAt) / 1000)) : 0
  return (
    <group ref={anchor}>
      {/* Fixed on-screen size (no distance scaling) so it reads the same on phones and desktop */}
      {activity ? (
        <Html center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <span className={bubbleStyles.bubble}>
            <span aria-hidden="true">{activity.emoji}</span>
            <strong>{left}s</strong>
          </span>
        </Html>
      ) : null}
    </group>
  )
}
