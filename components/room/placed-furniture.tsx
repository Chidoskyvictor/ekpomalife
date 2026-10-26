'use client'

import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Vector3, type Group } from 'three'
import type { HomeItem, OwnedPiece } from '@/lib/game/home-buy-api'
import { checkHomePlacement, type HomeSpec } from '@/lib/game/home-buy-rules'
import { pickPlaced, setBuySpot, useBuyUi } from '@/lib/game/home-buy-store'
import { FRONT, HOME_TILE, pieceRect, shapeMap, spotUnder } from '@/lib/game/home-placed'

/** Wall pieces hang at this height (m) and stick out this far from the wall. */
const WALL_Y = 1.35
const WALL_DEPTH = 0.07

export type HomeFurnishing = { spec: HomeSpec; catalog: HomeItem[]; placements: OwnedPiece[] }

/** One block standing in for a piece of furniture (no models yet): its footprint, height and colour. */
function Block({
  spec,
  item,
  spot,
  ghost,
}: {
  spec: HomeSpec
  item: HomeItem
  spot: { x: number; z: number; rot: 0 | 90 | 180 | 270 }
  ghost?: 'ok' | 'bad'
}) {
  const [x0, z0, x1, z1] = pieceRect(spec, item, spot)
  const w = x1 - x0
  const d = z1 - z0
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const h = item.wall ? Math.min(item.height, 0.9) : item.height
  const y = item.wall ? WALL_Y : h / 2
  const size: [number, number, number] = item.wall ? [w - 0.06, h, WALL_DEPTH] : [w - 0.05, h, d - 0.05]
  const pos: [number, number, number] = item.wall ? [cx, y, spec.oz + WALL_DEPTH / 2 + 0.02] : [cx, y, cz]
  const tint = ghost === 'ok' ? '#34c759' : ghost === 'bad' ? '#ff3b30' : item.color

  return (
    <group>
      <mesh position={pos} castShadow={!ghost} receiveShadow {...(ghost ? { raycast: () => null } : {})}>
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={tint}
          roughness={0.75}
          transparent={!!ghost}
          opacity={ghost ? 0.62 : 1}
          emissive={ghost ? tint : '#000000'}
          emissiveIntensity={ghost ? 0.25 : 0}
        />
      </mesh>
      {/* A dark stripe on the top edge that faces front, so every quarter turn looks different from above */}
      {!item.wall ? (
        <mesh
          position={[cx + FRONT[spot.rot][0] * (w / 2 - 0.09), h + 0.012, cz + FRONT[spot.rot][1] * (d / 2 - 0.09)]}
          raycast={() => null}
        >
          <boxGeometry args={FRONT[spot.rot][0] === 0 ? [Math.max(0.12, w - 0.3), 0.02, 0.1] : [0.1, 0.02, Math.max(0.12, d - 0.3)]} />
          <meshBasicMaterial color="#111827" />
        </mesh>
      ) : null}
      {ghost && !item.wall ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.03, cz]} raycast={() => null}>
          <planeGeometry args={[w, d]} />
          <meshBasicMaterial color={tint} transparent opacity={0.35} depthWrite={false} />
        </mesh>
      ) : null}
    </group>
  )
}

/** Everything bought and placed in this home (Buy mode's layer handles tapping one). */
export function PlacedPieces({ furnishing }: { furnishing: HomeFurnishing }) {
  const ui = useBuyUi()
  const byId = useMemo(() => new Map(furnishing.catalog.map((i) => [i.id, i])), [furnishing.catalog])
  return (
    <>
      {furnishing.placements.map((p) => {
        const item = byId.get(p.itemId)
        if (!item || p.id === ui.movingId) return null
        return (
          <Block
            key={p.id}
            spec={furnishing.spec}
            item={item}
            spot={p}
          />
        )
      })}
    </>
  )
}

/**
 * Buy mode's floor. With something picked: tap or drag anywhere to slide the ghost to the nearest
 * tile (green = fits, red = taken or in the way). With nothing picked: tap a placed piece to get
 * Move / Sell. One transparent plane takes both, because react-three-fiber only registers pointer
 * handlers that exist when an object mounts, and pieces appear and disappear as you shop.
 */
export function BuyLayer({ furnishing }: { furnishing: HomeFurnishing }) {
  const ui = useBuyUi()
  const dragging = useRef(false)
  const root = useRef<Group>(null)
  const camera = useThree((state) => state.camera)
  const canvas = useThree((state) => state.gl.domElement)
  const controls = useThree((state) => state.controls) as { enabled: boolean } | null
  const { spec, catalog, placements } = furnishing
  const shapes = useMemo(() => shapeMap(catalog), [catalog])
  const byId = useMemo(() => new Map(catalog.map((i) => [i.id, i])), [catalog])
  const item = ui.item
  const spot = ui.spot
  const active = ui.active

  const verdict = useMemo(() => {
    if (!item || !spot) return null
    const others = placements.filter((p) => p.id !== ui.movingId)
    return checkHomePlacement(spec, shapes, others, item.id, spot)
  }, [item, spot, spec, shapes, placements, ui.movingId])

  // Nothing picked: a tap on a placed piece picks it for Move / Sell. Plain DOM listeners, because
  // react-three-fiber did not deliver pointer events to the plane in this mode.
  useEffect(() => {
    if (!active || item) return
    let down: [number, number] | null = null
    const onDown = (e: PointerEvent) => {
      down = [e.clientX, e.clientY]
    }
    const onUp = (e: PointerEvent) => {
      const from = down
      down = null
      const group = root.current
      if (!from || !group || Math.hypot(e.clientX - from[0], e.clientY - from[1]) > 6) return
      const rect = canvas.getBoundingClientRect()
      let best: { id: string; d: number } | null = null
      for (const p of placements) {
        const it = byId.get(p.itemId)
        if (!it) continue
        const [x0, z0, x1, z1] = pieceRect(spec, it, p)
        const y = it.wall ? 1.35 : it.height / 2
        const at = group.localToWorld(new Vector3((x0 + x1) / 2, y, it.wall ? spec.oz + 0.05 : (z0 + z1) / 2)).project(camera)
        const d = Math.hypot(
          rect.left + (at.x * 0.5 + 0.5) * rect.width - e.clientX,
          rect.top + (-at.y * 0.5 + 0.5) * rect.height - e.clientY,
        )
        if (d < 48 && (!best || d < best.d)) best = { id: p.id, d }
      }
      pickPlaced(best?.id ?? null)
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
    }
  }, [active, item, placements, byId, spec, camera, canvas])

  if (!active) return null

  const toSpot = (event: ThreeEvent<PointerEvent>) => {
    if (!item || !ui.spot) return
    const local = root.current?.worldToLocal(event.point.clone()) ?? event.point
    setBuySpot(spotUnder(spec, item, ui.spot.rot, local.x, local.z))
  }

  const width = spec.cols * HOME_TILE
  const depth = spec.rows * HOME_TILE

  return (
    <group ref={root}>
      {/* While placing: tap or drag anywhere on the floor to slide the ghost to the nearest tile */}
      {item && spot ? (
        <>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[spec.ox + width / 2, 0.05, spec.oz + depth / 2]}
            onPointerDown={(event) => {
              event.stopPropagation()
              dragging.current = true
              // Dragging the ghost must not also swing the camera
              if (controls) controls.enabled = false
              toSpot(event)
            }}
            onPointerMove={(event) => {
              if (dragging.current) toSpot(event)
            }}
            onPointerUp={() => {
              dragging.current = false
              if (controls) controls.enabled = true
            }}
            onPointerLeave={() => {
              dragging.current = false
              if (controls) controls.enabled = true
            }}
            // The character's own floor-tap must not fire under the plane
            onClick={(event) => event.stopPropagation()}
          >
            <planeGeometry args={[width, depth]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          <Block spec={spec} item={item} spot={spot} ghost={verdict?.ok ? 'ok' : 'bad'} />
        </>
      ) : null}
    </group>
  )
}
