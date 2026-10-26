'use client'

import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import { endActivity, setActivityQueue, startActivity } from '@/lib/game/activity'
import { fetchHostCard, type HostCard } from '@/lib/game/hostels-api'
import { normalizeAppearance, type Appearance } from '@/lib/game/look'
import type { FurnitureAction, FurnitureId } from '@/lib/game/room-furniture'
import { fetchHomeFurniture, fetchVisitFurniture, type HomeItem, type OwnedPiece } from '@/lib/game/home-buy-api'
import { exitBuyMode, setBuyAvailable, useBuyUi } from '@/lib/game/home-buy-store'
import { furnitureUse, homeSpecFor, layoutWithPlaced, placedIdOf } from '@/lib/game/home-placed'
import { resolvePaint } from '@/lib/game/house-paint'
import { layoutForLodging, type SpotKey } from '@/lib/game/room-layouts'
import { roomLightAt } from '@/lib/game/room-lighting'
import { devPinnedMinute, watMinuteOfDay } from '@/lib/game/wat-clock'
import { HOME_STREET_EVENT, markSceneReady, openTravel, takeHomeStreet } from '@/lib/game/trip'
import travelStyles from '@/components/travel/travel.module.css'
import { STREET_AND_TRAVEL } from '@/lib/flags'
import { BuyPanel } from './buy-panel'
import { FurnitureSheet } from './furniture-sheet'
import type { RoomPlayerControl } from './room-player'
import { VisitBanner } from './visit-banner'
import styles from './room.module.css'

/** Fade to dark, swap scenes, fade back (each way): ~0.5s when the scene is cached. */
const FADE_MS = 220

const HomeCanvas = dynamic(
  () => import('./home-canvas').then((m) => m.HomeCanvas),
  {
    ssr: false,
    loading: () => <div className={styles.canvasStage} aria-hidden="true" />,
  },
)

export function RoomScreen() {
  const { state, act } = useGame()
  // The piece that was tapped: a built-in one, or one the player bought (`placed:<id>`)
  const [furnitureKey, setFurnitureKey] = useState<SpotKey | null>(null)
  // The 3D character fills in control.use once it has mounted
  const control = useMemo<RoomPlayerControl>(() => ({}), [])
  const pick = useRoomActionQueue(control, (action) => void act(action.id, { atHome: true }))
  const [modelReady, setModelReady] = useState<'checking' | 'ok' | 'missing'>('checking')
  // /room/[username]: visiting someone else's place — their character is home too
  const params = useParams<{ username?: string }>()
  const visiting = params?.username ? decodeURIComponent(params.username) : null
  const isOwn = !visiting || (state?.username ?? '').toLowerCase() === visiting.toLowerCase()
  const [host, setHost] = useState<HostCard | null>(null)
  useEffect(() => {
    if (!visiting || isOwn) return
    let cancelled = false
    void fetchHostCard(visiting).then((res) => {
      if (!cancelled && res.ok) setHost(res.host)
    })
    return () => {
      cancelled = true
    }
  }, [visiting, isOwn])
  // Your own home, or the host's when visiting (their character shows once the card loads)
  const visitingOther = !!visiting && !isOwn
  const lodgingId = visitingOther ? host?.lodgingId : state?.lodgingId
  const baseLayout = layoutForLodging(lodgingId)
  // Furniture bought in Buy mode: yours, or the host's when visiting
  const spec = useMemo(() => homeSpecFor(lodgingId), [lodgingId])
  const home = useHomeFurniture(visitingOther ? (host ? visiting : null) : '', spec !== null)
  const layout = useMemo(
    () => layoutWithPlaced(baseLayout, spec, home.placements, home.catalog),
    [baseLayout, spec, home.placements, home.catalog],
  )
  const furnishing = useMemo(
    () => (spec && home.loaded ? { spec, catalog: home.catalog, placements: home.placements } : null),
    [spec, home.loaded, home.catalog, home.placements],
  )
  const furniture = useMemo<FurnitureId | null>(() => {
    if (!furnitureKey) return null
    const id = placedIdOf(furnitureKey)
    if (!id) return furnitureKey as FurnitureId
    const piece = home.placements.find((p) => p.id === id)
    return furnitureUse(home.catalog.find((i) => i.id === piece?.itemId))
  }, [furnitureKey, home.placements, home.catalog])
  const buy = useBuyUi()
  // Wall paint follows whoever lives here, so visitors see the owner's colour
  const ownerName = visitingOther ? host?.username : state?.username
  const paint = ownerName ? resolvePaint({ id: ownerName.toLowerCase() }).hex : undefined

  // Real WAT time of day, the same for everyone (dev: ?time=21:30 pins it)
  const [pinned, setPinned] = useState<number | null>(null)
  useEffect(() => setPinned(devPinnedMinute(window.location.search)), [])
  const clock = useCallback(() => pinned ?? watMinuteOfDay(), [pinned])
  // The sky tint behind the house only needs to move every few seconds
  const [sky, setSky] = useState(() => roomLightAt(12 * 60))
  useEffect(() => {
    const update = () => setSky(roomLightAt(clock()))
    update()
    const id = window.setInterval(update, 5000)
    return () => window.clearInterval(id)
  }, [clock, state?.gameTime])
  const own = !visitingOther
  // Stepping outside stops whatever you were doing in there
  const leaveInside = useCallback(() => control.stop?.(), [control])
  const scene = useHomeScene(own, leaveInside)

  // The nav's Buy tab opens Buy mode while you are inside your own home (and only then)
  const canBuy = own && !scene.outside && !!furnishing && home.enabled
  useEffect(() => {
    setBuyAvailable(canBuy)
    return () => setBuyAvailable(false)
  }, [canBuy])
  // Stop whatever you were doing when Buy mode opens
  useEffect(() => {
    if (buy.active) leaveInside()
  }, [buy.active, leaveInside])
  useEffect(() => () => exitBuyMode(), [])

  // Only your own home is fetched (no more preloading every home); dropped when you leave
  useEffect(() => {
    void import('./home-canvas').then((m) => m.preloadHome(baseLayout))
    return () => void import('./home-canvas').then((m) => m.releaseHome(baseLayout))
  }, [baseLayout])

  const hostLook = useMemo<Appearance | undefined>(
    () => (host ? normalizeAppearance(host.appearance as Partial<Appearance>) : undefined),
    [host],
  )

  useEffect(() => {
    let cancelled = false
    setModelReady('checking')
    void fetch(layout.glb, { method: 'HEAD' })
      .then((res) => {
        if (!cancelled) setModelReady(res.ok ? 'ok' : 'missing')
      })
      .catch(() => {
        if (!cancelled) setModelReady('missing')
      })
    return () => {
      cancelled = true
    }
  }, [layout.glb])

  return (
      <div className={styles.root} aria-label={visitingOther ? `${host?.username ?? visiting}'s ${layout.label.toLowerCase()}` : `Your ${layout.label.toLowerCase()}`}>
        <div className={styles.canvasStage}>
        {/* Morning / evening / night tint over the page background; clear at midday */}
        <div
          className={styles.sky}
          aria-hidden="true"
          style={{ background: `linear-gradient(180deg, ${sky.skyTop}, ${sky.skyBottom})`, opacity: sky.skyOpacity }}
        />
        {(modelReady === 'ok' || scene.outside) && (!visitingOther || host) ? (
          <HomeCanvas
            layout={layout}
            paint={paint}
            clock={clock}
            appearance={state?.appearance}
            host={hostLook}
            onFurniture={buy.active ? undefined : setFurnitureKey}
            furnishing={furnishing}
            control={control}
            spawn={scene.spawnAtDoor ? layout.start : undefined}
            visit={scene.visit}
            onReady={scene.onReady}
            street={
              scene.outside
                ? {
                    lodgingId: state?.lodgingId,
                    houseNumber: state?.houseNumber,
                    paint,
                    appearance: state?.appearance,
                    clock,
                    preloadGlb: layout.glb,
                    onNearGate: scene.setNearGate,
                  }
                : null
            }
          />
        ) : null}
        <div className={travelStyles.fade} data-on={scene.cover} aria-hidden={!scene.cover}>
          {scene.slow ? 'Loading…' : null}
        </div>
        {modelReady === 'missing' && !scene.outside ? (
          <p className={styles.missingModel} role="status">
            Add <code>{layout.glb.replace('/models/', '')}</code> to <code>public/models/</code> to see your room here.
          </p>
        ) : null}
        {modelReady === 'checking' && !scene.outside ? (
          <p className={styles.missingModel} role="status" aria-live="polite">
            Loading room…
          </p>
        ) : null}
        </div>
        {STREET_AND_TRAVEL && own && state && !buy.active ? (
          <div className={travelStyles.corner}>
            {scene.outside ? (
              <>
                {scene.nearGate ? (
                  <button type="button" className={`${travelStyles.cornerBtn} ${travelStyles.go}`} onClick={() => scene.goTo(false)}>
                    🏠 Go inside
                  </button>
                ) : null}
                <button type="button" className={travelStyles.cornerBtn} onClick={openTravel}>
                  🧭 Where to?
                </button>
              </>
            ) : (
              <button type="button" className={travelStyles.cornerBtn} onClick={() => scene.goTo(true)}>
                🚪 Go outside
              </button>
            )}
          </div>
        ) : null}
        {visiting && !isOwn ? <VisitBanner username={host?.username ?? visiting} displayName={host?.displayName ?? null} /> : null}
        <FurnitureSheet
          furniture={furniture}
          onClose={() => setFurnitureKey(null)}
          onPick={(_id, action) => {
            const key = furnitureKey
            setFurnitureKey(null)
            if (key) pick(key, action)
          }}
        />
        {buy.active && furnishing ? (
          <BuyPanel
            spec={furnishing.spec}
            catalog={furnishing.catalog}
            placements={furnishing.placements}
            view={layout.view}
            onPlacements={home.setPlacements}
          />
        ) : null}
      </div>
  )
}

/**
 * Inside your home or out on your street. Switching fades to dark, swaps what the canvas
 * shows (the scene you leave is unmounted), and fades back once the new one has drawn.
 * Arriving home by trip (or "Where to? → Home" while here) puts you outside at your gate.
 */
function useHomeScene(own: boolean, leaveInside: () => void) {
  const [outside, setOutside] = useState(false)
  const [cover, setCover] = useState(false)
  const [slow, setSlow] = useState(false)
  const [nearGate, setNearGate] = useState(false)
  /** Bumps on every switch so the player re-spawns (at the gate / inside the door). */
  const [visit, setVisit] = useState(0)
  const [spawnAtDoor, setSpawnAtDoor] = useState(false)
  const outsideRef = useRef(false)
  const timers = useRef<number[]>([])

  const goTo = useCallback(
    (next: boolean) => {
      if (!own) return
      if (!next) setNearGate(false)
      else leaveInside()
      setCover(true)
      timers.current.push(
        window.setTimeout(() => {
          outsideRef.current = next
          setOutside(next)
          setSpawnAtDoor(!next)
          setVisit((v) => v + 1)
        }, FADE_MS),
        // Only say "Loading…" when the scene isn't cached
        window.setTimeout(() => setSlow(true), FADE_MS + 350),
      )
    },
    [own, leaveInside],
  )

  const onReady = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id)
    timers.current = []
    setSlow(false)
    setCover(false)
    if (outsideRef.current) markSceneReady('home')
  }, [])

  // Came here by trip: start on the street
  useEffect(() => {
    if (own && takeHomeStreet()) {
      outsideRef.current = true
      setOutside(true)
      setVisit((v) => v + 1)
    }
  }, [own])

  useEffect(() => {
    const onStreet = () => goTo(true)
    window.addEventListener(HOME_STREET_EVENT, onStreet)
    return () => window.removeEventListener(HOME_STREET_EVENT, onStreet)
  }, [goTo])

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), [])

  return { outside: own && outside, cover, slow, nearGate, setNearGate, visit, spawnAtDoor, goTo, onReady }
}

type Queued = { key: string; furniture: SpotKey; action: FurnitureAction }
const MAX_QUEUED = 3

/**
 * Sims-style action queue for the room: pick something while busy and it lines up (up to 3) as a
 * dim tile; each runs when the one before finishes. The running action walks over, then the tile
 * fills and the server applies it at the end. ✕ on the running tile skips to the next one; ✕ on a
 * waiting tile drops it; walking off (tap the floor / arrow keys) stops everything.
 */
function useRoomActionQueue(control: RoomPlayerControl, run: (action: FurnitureAction) => void) {
  const queue = useRef<Queued[]>([])
  const busy = useRef(false)
  const skipped = useRef(false)

  const sync = useCallback(() => {
    setActivityQueue(
      queue.current.map((q) => ({
        key: q.key,
        emoji: q.action.emoji,
        title: q.action.title,
        onRemove: () => {
          queue.current = queue.current.filter((x) => x.key !== q.key)
          sync()
        },
      })),
    )
  }, [])

  const start = useRef<(item: Queued) => void>(() => undefined)
  const next = useCallback(() => {
    busy.current = false
    const item = queue.current.shift()
    sync()
    if (item) start.current(item)
  }, [sync])

  start.current = (item: Queued) => {
    busy.current = true
    const { action } = item
    control.use?.(item.furniture, action, {
      onStart: () =>
        startActivity({
          emoji: action.emoji,
          title: action.title,
          seconds: action.seconds,
          onCancel: () => {
            skipped.current = true
            control.stop?.()
          },
        }),
      onDone: () => {
        endActivity()
        run(action)
        next()
      },
      onAbort: () => {
        endActivity()
        if (skipped.current) {
          skipped.current = false
          next()
          return
        }
        // Walked away: drop everything lined up
        queue.current = []
        busy.current = false
        sync()
      },
    })
  }

  // Leaving the room clears the queue tiles
  useEffect(() => () => setActivityQueue([]), [])

  return useCallback(
    (furniture: SpotKey, action: FurnitureAction) => {
      const item = { key: `${Date.now()}-${Math.random()}`, furniture, action }
      if (!busy.current) {
        start.current(item)
        return
      }
      if (queue.current.length >= MAX_QUEUED) return
      queue.current = [...queue.current, item]
      sync()
    },
    [sync],
  )
}

/**
 * What was bought and placed in a home: yours (`who` = '') or a host's when visiting. The catalogue
 * comes with it. `enabled` is false for homes without a grid (the hostel bunk) and when it can't load.
 */
function useHomeFurniture(who: string | null, hasGrid: boolean) {
  const [catalog, setCatalog] = useState<HomeItem[]>([])
  const [placements, setPlacements] = useState<OwnedPiece[]>([])
  const [loaded, setLoaded] = useState(false)
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    if (who === null || !hasGrid) return
    let cancelled = false
    void (who === '' ? fetchHomeFurniture() : fetchVisitFurniture(who)).then((res) => {
      if (cancelled || !res.ok) return
      setCatalog(res.catalog)
      setPlacements(res.placements)
      setEnabled('enabled' in res ? res.enabled : false)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [who, hasGrid])
  return { catalog, placements, setPlacements, loaded, enabled }
}
