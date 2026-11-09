'use client'

import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import { endActivity, runTimed, setActivityQueue, startActivity, useActivity } from '@/lib/game/activity'
import { markSelfDone, type SelfAction } from '@/lib/game/self-actions'
import { fetchHostCard, type HostCard } from '@/lib/game/hostels-api'
import { normalizeAppearance, type Appearance } from '@/lib/game/look'
import type { FurnitureAction, FurnitureId } from '@/lib/game/room-furniture'
import { fetchHomeFurniture, fetchVisitFurniture, type HomeItem, type HomeStyle, type OwnedPiece } from '@/lib/game/home-buy-api'
import { exitBuyMode, setBuyAvailable, useBuyUi } from '@/lib/game/home-buy-store'
import { furnitureUse, homeSpecFor, layoutWithPlaced, placedIdOf, startersFor } from '@/lib/game/home-placed'
import { resolvePaint } from '@/lib/game/house-paint'
import { wallHex, type HomeDecor } from '@/lib/game/home-decor'
import { setOwnedDecor, shownDecor, useDecorUi } from '@/lib/game/home-decor-store'
import { layoutForLodging, type SpotKey } from '@/lib/game/room-layouts'
import { roomLightAt } from '@/lib/game/room-lighting'
import { devPinnedMinute, watMinuteOfDay } from '@/lib/game/wat-clock'
import { HOME_STREET_EVENT, markSceneReady, openTravel, takeHomeStreet } from '@/lib/game/trip'
import travelStyles from '@/components/travel/travel.module.css'
import { STREET_AND_TRAVEL } from '@/lib/flags'
import { BuyPanel } from './buy-panel'
import { FurnitureSheet } from './furniture-sheet'
import { SelfActionSheet } from './self-action-sheet'
import type { PlayerMove, RoomPlayerControl } from './room-player'
import { ClubPeers } from '@/components/club/club-peers'
import { useClubLive } from '@/lib/game/club-live'
import type { Object3D } from 'three'
import { VisitBanner } from './visit-banner'
import { AskPrompt, PeopleBar, PersonSheet, useHomePeople } from './people-panel'
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
  // Tap yourself: the "What should they do?" sheet; the pick runs as a timed activity on the spot
  const [selfOpen, setSelfOpen] = useState(false)
  const activity = useActivity()
  const runSelf = useCallback(
    (a: SelfAction) => {
      setSelfOpen(false)
      control.stop?.()
      control.pose?.(a.pose ?? null)
      void runTimed({ emoji: a.emoji, title: a.title, seconds: a.seconds }, async () => {
        control.pose?.(null)
        if (await act(a.id, { atHome: true })) markSelfDone(a.id)
      }).then((finished) => {
        if (!finished) control.pose?.(null)
      })
    },
    [control, act],
  )
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
    () => layoutWithPlaced(baseLayout, spec, home.placements, home.catalog, startersFor(lodgingId)),
    [baseLayout, spec, home.placements, home.catalog, lodgingId],
  )
  // A style being tried on in Buy mode shows instead of what's really placed (nothing is bought yet)
  const stylePreview = useBuyUi().stylePreview
  const furnishing = useMemo(
    () =>
      spec && home.loaded
        ? { spec, catalog: home.catalog, placements: stylePreview ?? home.placements, starters: startersFor(lodgingId) }
        : null,
    [spec, home.loaded, home.catalog, home.placements, stylePreview, lodgingId],
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
  // Your own home shows what you're trying on in the Design tab; a visit shows the owner's look
  const decorUi = useDecorUi()
  const decor = isOwn ? shownDecor(decorUi) : home.decor
  const paint = wallHex(decor.wall) ?? (ownerName ? resolvePaint({ id: ownerName.toLowerCase() }).hex : undefined)

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
  // "Loading your room…" stays up until the room's first frame has actually drawn
  const sceneKey = `${layout.id}-${scene.visit}-${scene.outside ? 'out' : 'in'}`
  const [drawnKey, setDrawnKey] = useState<string | null>(null)
  const sceneOnReady = scene.onReady
  const onSceneReady = useCallback(() => {
    setDrawnKey(sceneKey)
    sceneOnReady()
  }, [sceneKey, sceneOnReady])
  const roomLoading = !scene.outside && modelReady !== 'missing' && drawnKey !== sceneKey

  // The nav's Buy tab opens Buy mode while you are inside your own home (and only then)
  // (as soon as the home is known: waiting for the furniture list made an early tap open the town shop)
  const canBuy = own && !scene.outside && spec !== null
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

  // Live room inside this home: the owner and visitors see each other move (same socket as clubs)
  const owner = visitingOther ? visiting : (state?.username ?? null)
  const live = useClubLive(
    `home-${owner ?? ''}`,
    Boolean(owner && state) && !scene.outside,
    state?.username,
    owner ? `/homes/${encodeURIComponent(owner)}/live-ticket` : undefined,
  )
  const { sendState } = live
  const onPlayerMove = useCallback(
    (m: PlayerMove) => sendState({ x: m.x, y: m.y, z: m.z, h: m.h, pose: m.pose, moving: m.moving }),
    [sendState],
  )
  // The host is shown live once they're in the room; until then, standing still from their card
  const hostLive = useMemo(
    () => visitingOther && [...live.peers.current.values()].some((p) => p.username.toLowerCase() === (visiting ?? '').toLowerCase()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- live.roster is the change signal for the peers ref
    [visitingOther, visiting, live.roster],
  )
  const people = useHomePeople(live, control, owner, state?.username ?? null)
  const effects = useCallback(
    (_root: Object3D) => (
      <ClubPeers peers={live.peers} roster={live.roster} bubbles={people.bubbles} onTap={buy.active ? undefined : people.setTarget} />
    ),
    [live.peers, live.roster, people.bubbles, people.setTarget, buy.active],
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
            decor={decor}
            clock={clock}
            appearance={state?.appearance}
            host={hostLive ? undefined : hostLook}
            effects={effects}
            onPlayerMove={onPlayerMove}
            onFurniture={buy.active ? undefined : setFurnitureKey}
            onSelf={own && !scene.outside && !buy.active ? () => setSelfOpen(true) : undefined}
            furnishing={furnishing}
            control={control}
            spawn={scene.spawnAtDoor || visitingOther ? layout.start : undefined}
            visit={scene.visit}
            onReady={onSceneReady}
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
        {roomLoading ? (
          <div className={styles.roomLoading} role="status" aria-live="polite">
            <span className={styles.roomSkeleton} aria-hidden="true" />
            <p className={styles.roomLoadingText}>Loading your room…</p>
          </div>
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
        {visiting && !isOwn ? (
          <VisitBanner username={host?.username ?? visiting} displayName={host?.displayName ?? null} place={layout.label} hostHome={hostLive} />
        ) : null}
        {owner && !scene.outside && !buy.active && !selfOpen ? <PeopleBar live={live} people={people} onOpen={people.setTarget} /> : null}
        {owner ? <PersonSheet peer={people.target} homeOwner={owner} onClose={() => people.setTarget(null)} people={people} /> : null}
        <AskPrompt live={live} />
        {/* No "My room" bar: tap a piece of furniture to use it */}
        <FurnitureSheet
          furniture={furniture}
          onClose={() => setFurnitureKey(null)}
          onPick={(_id, action) => {
            const key = furnitureKey
            setFurnitureKey(null)
            if (key) pick(key, action)
          }}
        />
        <SelfActionSheet
          open={selfOpen && own && !buy.active}
          name={state?.characterName && state.characterName !== 'Player' ? state.characterName : (state?.username ?? 'You')}
          appearance={state?.appearance}
          avatarColor={state?.avatarColor ?? '#2f7cf6'}
          busy={!!activity}
          onClose={() => setSelfOpen(false)}
          onPick={runSelf}
        />
        {buy.active && furnishing ? (
          <BuyPanel
            spec={furnishing.spec}
            catalog={furnishing.catalog}
            placements={home.placements}
            styles={home.styles}
            stored={home.stored}
            onStored={home.setStored}
            view={layout.view}
            onPlacements={home.setPlacements}
          />
        ) : null}
        {/* Buy mode is on but the furniture list isn't here yet (or failed): never leave the player stuck */}
        {buy.active && !furnishing ? (
          <div className={styles.buyWait} role="status">
            <span>{home.failed ? 'Couldn’t load the items.' : 'Loading items…'}</span>
            {home.failed ? (
              <button type="button" onClick={home.retry}>
                Try again
              </button>
            ) : null}
            <button type="button" onClick={exitBuyMode}>
              Exit
            </button>
          </div>
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
    // The trip home waits for this: inside your room (or on the street when that's used)
    markSceneReady('home')
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
  const [decor, setDecor] = useState<HomeDecor>({})
  const [styles, setStyles] = useState<HomeStyle[]>([])
  const [stored, setStored] = useState<OwnedPiece[]>([])
  const [loaded, setLoaded] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (who === null || !hasGrid) return
    let cancelled = false
    setFailed(false)
    void (who === '' ? fetchHomeFurniture() : fetchVisitFurniture(who)).then((res) => {
      if (cancelled) return
      if (!res.ok) {
        setFailed(true)
        return
      }
      setCatalog(res.catalog)
      setPlacements(res.placements)
      setDecor(res.decor ?? {})
      setStyles((res as { styles?: HomeStyle[] }).styles ?? [])
      setStored((res as { stored?: OwnedPiece[] }).stored ?? [])
      if (who === '') setOwnedDecor(res.decor ?? {}, 'decorZones' in res ? res.decorZones : [])
      setEnabled('enabled' in res ? res.enabled : false)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [who, hasGrid, attempt])
  return { catalog, placements, setPlacements, styles, stored, setStored, decor, loaded, enabled, failed, retry: () => setAttempt((n) => n + 1) }
}
