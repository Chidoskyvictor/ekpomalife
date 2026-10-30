'use client'

import { useFrame, useThree } from '@react-three/fiber'
import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { ReactNode } from 'react'
import { PerspectiveCamera, Vector3, type Group, type Object3D } from 'three'
import { useGame } from '@/hooks/use-game'
import { useLiveSpaces } from '@/hooks/use-live-spaces'
import { requestOpenSpace } from '@/lib/game/open-spaces'
import { isComingSoon, placeFor } from '@/lib/game/place-info'
import { PLACES } from '@/lib/game/places'
import type { SpaceCard } from '@/lib/game/spaces-api'
import { stickerForZone, stickerImageForZone } from '@/lib/game/zone-stickers'
import { useShowMapLabels } from '@/lib/game/map-labels'
import labelStyles from './zone-label.module.css'

/** Perspective shrink like drei `<Html distanceFactor>`, clamped so names stay readable when zoomed out. */
const DISTANCE_FACTOR = 60
const MIN_SCALE = 0.62
const MAX_SCALE = 1
const Z_NEAR = 80

type Anchor = { zoneId: string; label: string; object: Object3D }
type Painted = { x: number; y: number; scale: number; z: number; shown: boolean }

/**
 * One store for every building sticker: anchors register from inside the Canvas, a single DOM
 * layer renders the pills, and one frame loop positions them — instead of 40 drei `<Html>` roots.
 */
class StickerStore {
  anchors = new Map<string, Anchor>()
  elements = new Map<string, HTMLElement>()
  painted = new Map<string, Painted>()
  version = 0
  private listeners = new Set<() => void>()

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = () => this.version

  set(id: string, anchor: Anchor | null) {
    if (anchor) this.anchors.set(id, anchor)
    else {
      this.anchors.delete(id)
      this.painted.delete(id)
    }
    this.version++
    this.listeners.forEach((listener) => listener())
  }

  setElement(id: string, el: HTMLElement | null) {
    if (el) this.elements.set(id, el)
    else this.elements.delete(id)
    this.painted.delete(id)
  }
}

const StickerContext = createContext<StickerStore | null>(null)

/** Wrap the map (outside the Canvas) so anchors, projector and overlay share one store. */
export function ZoneStickerProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new StickerStore())
  return <StickerContext.Provider value={store}>{children}</StickerContext.Provider>
}

/** Kept for existing callers — stickers now live in the provider/overlay pair. */
export function ZoneStickerRegistry({ children }: { children: ReactNode }) {
  return <>{children}</>
}

function StickerButton({ zoneId, label, space }: { zoneId: string; label: string; space?: SpaceCard }) {
  const [open, setOpen] = useState(false)
  const { select } = useGame()
  const sticker = stickerForZone(zoneId, label)
  const image = stickerImageForZone(zoneId)
  return (
    <span className={labelStyles.stickerWrap}>
      <button
        type="button"
        className={labelStyles.sticker}
        data-open={open ? 'true' : 'false'}
        aria-label={label}
        aria-expanded={open}
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => {
          if (placeFor(zoneId) || isComingSoon(zoneId)) select(zoneId)
        }}
      >
        <span className={labelStyles.emoji} aria-hidden="true">
          {image ? <img src={image} alt="" width={24} height={24} className={labelStyles.stickerImage} /> : sticker}
        </span>
        <span className={labelStyles.name}>{label}</span>
      </button>
      {space ? (
        <button
          type="button"
          className={labelStyles.liveBadge}
          aria-label={`Live Space at ${label}: ${space.title}`}
          onClick={() => requestOpenSpace({ spaceId: space.id })}
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </button>
      ) : null}
    </span>
  )
}

/** Sticker pinned to a world point on the building (roof / fascia). */
export function ZoneStickerAnchor({
  zoneId,
  label,
  height,
}: {
  zoneId: string
  label: string
  height: number
}) {
  const store = useContext(StickerContext)
  const ref = useRef<Group>(null)

  useLayoutEffect(() => {
    if (!store || !ref.current) return
    store.set(zoneId, { zoneId, label, object: ref.current })
    return () => store.set(zoneId, null)
  }, [store, zoneId, label])

  return <group ref={ref} position={[0, height, 0]} />
}

const worldPos = new Vector3()
const cameraPos = new Vector3()
const projected = new Vector3()

/** Mount inside the Canvas: projects every anchor once per frame, touching the DOM only on change. */
export function ZoneStickerProjector() {
  const store = useContext(StickerContext)
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)

  useFrame(() => {
    if (!store) return
    cameraPos.setFromMatrixPosition(camera.matrixWorld)
    const tanHalf = camera instanceof PerspectiveCamera ? Math.tan((camera.fov * Math.PI) / 360) : 0
    const near = (camera as PerspectiveCamera).near ?? 0.1
    const far = (camera as PerspectiveCamera).far ?? 1000

    for (const [id, anchor] of store.anchors) {
      const el = store.elements.get(id)
      if (!el) continue
      worldPos.setFromMatrixPosition(anchor.object.matrixWorld)
      projected.copy(worldPos).project(camera)
      const dist = worldPos.distanceTo(cameraPos)
      const shown = projected.z < 1
      const x = (projected.x * 0.5 + 0.5) * size.width
      const y = (-projected.y * 0.5 + 0.5) * size.height
      const raw = tanHalf ? DISTANCE_FACTOR / (2 * tanHalf * dist) : 1
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw))
      const z = Math.round(Z_NEAR - (Z_NEAR * (dist - near)) / (far - near))

      const last = store.painted.get(id)
      if (last && last.shown === shown && !shown) continue
      if (
        last &&
        last.shown === shown &&
        Math.abs(last.x - x) < 0.25 &&
        Math.abs(last.y - y) < 0.25 &&
        Math.abs(last.scale - scale) < 0.002
      ) {
        continue
      }
      if (!last || last.shown !== shown) el.style.display = shown ? 'block' : 'none'
      if (!last || last.z !== z) el.style.zIndex = String(z)
      el.style.transform = `translate3d(${x}px,${y}px,0) scale(${scale})`
      store.painted.set(id, { x, y, scale, z, shown })
    }
  })

  return null
}

/** Mount next to the Canvas (same box): the DOM pills the projector moves around. */
export function ZoneStickerOverlay() {
  const store = useContext(StickerContext)
  const version = useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    store?.getVersion ?? zero,
    zero,
  )
  const anchors = useMemo(() => (store ? [...store.anchors.entries()] : []), [store, version])
  const { isGuest } = useGame()
  const [showLabels] = useShowMapLabels()
  // Busiest live public room per map zone (a Space's place is a place id; stickers are keyed by zone id)
  const live = useLiveSpaces(!isGuest)
  const byZone = useMemo(() => {
    const zoneOf = new Map(PLACES.map((p) => [p.id, p.zoneId]))
    const out = new Map<string, SpaceCard>()
    for (const space of live) {
      const zone = space.placeId ? zoneOf.get(space.placeId) : null
      if (zone && !out.has(zone)) out.set(zone, space)
    }
    return out
  }, [live])
  if (!store) return null

  return (
    // Own stacking layer: label z-order (0–80) stays inside it, under every HUD panel
    <div
      className="pointer-events-none absolute inset-0 isolate z-0 overflow-hidden"
      data-labels={showLabels ? 'shown' : 'hidden'}
    >
      {anchors.map(([id, anchor]) => (
        <div
          key={id}
          ref={(el) => store.setElement(id, el)}
          className={labelStyles.htmlWrap}
          style={{ position: 'absolute', top: 0, left: 0, transformOrigin: '0 0', display: 'none' }}
        >
          {/* Bottom-centre on the anchor so the pill rests on the roof */}
          <div style={{ transform: 'translate3d(-50%,-100%,0)' }}>
            <StickerButton zoneId={anchor.zoneId} label={anchor.label} space={byZone.get(anchor.zoneId)} />
          </div>
        </div>
      ))}
    </div>
  )
}

const noopSubscribe = () => () => {}
const zero = () => 0
