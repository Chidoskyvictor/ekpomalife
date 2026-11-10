'use client'

import { actionSeconds } from '@/lib/game/action-seconds'
import { BookOpen, Car, KeyRound, Map as MapIcon, Mic, Users, UtensilsCrossed } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Object3D } from 'three'
import { BuildingPanel, type BuildingActionRunner } from '@/components/buildings/building-panel'
import { ClubPeers } from '@/components/club/club-peers'
import { ChurchNpcs } from '@/components/church/church-npcs'
import { FoodNpcs } from '@/components/food/food-npcs'
import { useEconomy } from '@/hooks/use-economy'
import type { ShopItem } from '@/lib/game/economy-api'
import { FOOD_PLACES } from '@/lib/game/food-places'
import { ORDER_SPOT, type FoodNpc } from '@/lib/game/food-room'
import { HubDeskPanel } from '@/components/hub/hub-desk-panel'
import { NPC_PEWS } from '@/lib/game/church-npcs'
import { HubNpcs } from '@/components/hub/hub-npcs'
import { CarLotSheet } from '@/components/cars/car-lot-sheet'
import { ShowroomCars } from '@/components/cars/showroom-cars'
import { AUTOS } from '@/lib/game/autos-room'
import { openCarLot, useCarLot } from '@/lib/game/cars-api'
import { HUB_DESKS, HUB_SEATS, hubSpotKey, type HubDeskId } from '@/lib/game/hub-desks'

/** The hub's free chairs and bar stools as hall seats (the sit flow walks to `seat:<id>`). */
const HUB_HALL_SEATS: HallSeat[] = HUB_SEATS.map((s) => ({ id: s.id, x: s.x, z: s.z, row: 0, heading: 0, label: s.label }))
import { ClubPeople } from '@/components/club/club-people'
import { JobsPanel } from '@/components/hud/jobs-panel'
import { BuildingActionCards } from '@/components/hud/interior/building-actions'
import { PlaceReactions, PlaceTalkCard, usePlaceSocial } from '@/components/hud/interior/place-social'
import { usePlacePresence } from '@/components/hud/interior/use-place-presence'
import { PlaceAction, PlaceActions, PlacePeople, PlaceSheet } from '@/components/hud/place-sheet'
import type { PlayerMove, RoomPlayerControl } from '@/components/room/room-player'
import { useGame } from '@/hooks/use-game'
import { endActivity, runTimed, startActivity } from '@/lib/game/activity'
import { BUILDINGS, type BuildingActionDef } from '@/lib/game/buildings'
import { hallFor, officeFor } from '@/lib/game/halls'
import { CHURCH, CHURCH_SEATS, INNOVATION_HUB, OFFICE, seatKey, type HallSeat, type RoomLayout } from '@/lib/game/room-layouts'
import { pushNavigation } from '@/lib/navigation/safe-nav'
import styles from './hall.module.css'
import { CLASS_HALL, CLASS_SEATS } from '@/lib/game/class-hall'
import { hallNeighbours } from '@/lib/game/hall-neighbours'
import { devPinnedMinute, watMinuteOfDay } from '@/lib/game/wat-clock'
import { ClassSigns } from './class-signs'
import { StagePanel, StageScreen, goLiveHere, useStageSpace } from './stage-spaces'
import { StageAudio, type StageJoin } from './stage-audio'
import { joinSpace } from '@/lib/game/spaces-api'

const HomeCanvas = dynamic(() => import('@/components/room/home-canvas').then((m) => m.HomeCanvas), {
  ssr: false,
  loading: () => <div className={styles.stage} aria-hidden="true" />,
})

/** How long you stay seated before standing up on your own (tap the busy pill to stand sooner). */
const SIT_SECONDS = 45
/** Activities that seat you while they run (game minutes ÷ 10 = real seconds × 6). */
const SEATED = new Set(['attend-lecture', 'evening-tutorial'])

type Space = { name: string; paint?: string; layout: RoomLayout; seats: HallSeat[]; icon: string; office: boolean }

/** The 3D room for a place: the shared lecture hall, or the shared office (Admin Block keeps its navy). */
function spaceFor(id: string): Space | null {
  const hall = hallFor(id)
  if (hall) return { name: hall.name, paint: hall.color, layout: CLASS_HALL, seats: CLASS_SEATS, icon: '🎓', office: false }
  const office = officeFor(id)
  // The pews the church NPCs sit on are never offered to players
  const food = office?.layout === 'food' ? FOOD_PLACES[id] : undefined
  if (food) return { name: food.name, layout: food.layout, seats: food.seats, icon: food.icon, office: true }
  if (office?.layout === 'autos') return { name: office.name, layout: AUTOS, seats: [], icon: '🚗', office: true }
  if (office?.layout === 'church') return { name: office.name, layout: CHURCH, seats: CHURCH_SEATS.filter((s) => !NPC_PEWS.has(s.id)), icon: '⛪', office: true }
  if (office) return { name: office.name, paint: office.color ?? undefined, layout: office.layout === 'innovation-hub' ? INNOVATION_HUB : OFFICE, seats: office.layout === 'innovation-hub' ? HUB_HALL_SEATS : [], icon: '🏛️', office: true }
  return null
}

/**
 * A lecture hall, faculty or office. Every hall uses the same 3D room painted in its own colour.
 * Walking in is free; you join a crowd group (like the club) so you see the classmates in
 * your group walk in and take seats. "Take a seat" walks you to the nearest free chair.
 */
export function HallScreen({ hallId }: { hallId: string }) {
  const router = useRouter()
  const { state, select, notifyToast, act } = useGame()
  const building = BUILDINGS[hallId] ?? null
  const runAction = useRef<BuildingActionRunner | null>(null)
  const hall = spaceFor(hallId)
  const seats = hall?.seats ?? []
  const control = useMemo<RoomPlayerControl>(() => ({}), [])
  const [expanded, setExpanded] = useState(true)
  const [peopleOpen, setPeopleOpen] = useState(false)
  // Innovation Hub: the desk whose task is open (after walking up to its NPC)
  const isHub = hallId === 'innovation-hub'
  const isChurch = officeFor(hallId)?.layout === 'church'
  // Magmus Autos: cars on the bays, Showroom / My garage on the bar
  const isAutos = officeFor(hallId)?.layout === 'autos'
  const carLot = useCarLot()
  // Spot Rite: order at the counter (like Wise Gourmet), eat at a table
  const food = officeFor(hallId)?.layout === 'food' ? FOOD_PLACES[hallId] : undefined
  const isFood = Boolean(food)
  const { shopItems, shopPlaceId, loadShop, buy, useItem, busy: shopBusy } = useEconomy()
  const [menuOpen, setMenuOpen] = useState(false)
  const [ordering, setOrdering] = useState<string | null>(null)
  useEffect(() => {
    if (isFood && !food?.soldOut && !food?.play) void loadShop(hallId)
  }, [isFood, food?.soldOut, hallId, loadShop])
  const menu = isFood && shopPlaceId === hallId ? shopItems.filter((item) => item.category === 'food') : []
  const [deskOpen, setDeskOpen] = useState<HubDeskId | null>(null)
  // Real WAT time of day (dev: ?time=21:30 pins it): classes light their tubes and windows at night
  const [pinned, setPinned] = useState<number | null>(null)
  useEffect(() => setPinned(devPinnedMinute(window.location.search)), [])
  const clock = useCallback(() => pinned ?? watMinuteOfDay(), [pinned])
  const me = useRef<{ x: number; z: number }>({ x: hall?.layout.start[0] ?? 0, z: hall?.layout.start[1] ?? 0 })

  // Walk straight in (halls are free), stay counted, join your group's live room
  const presence = usePlacePresence(hallId)
  const { view, inside, live } = presence
  const social = usePlaceSocial(hallId, live)
  const { sendState } = live
  const onPlayerMove = useCallback(
    (m: PlayerMove) => {
      me.current = { x: m.x, z: m.z }
      sendState({ x: m.x, y: m.y, z: m.z, h: m.h, pose: m.pose, moving: m.moving })
    },
    [sendState],
  )

  /** Walk up to the counter; the staff greet you and the menu opens when you're there. */
  const goToCounter = () => {
    setMenuOpen(false)
    social.setTalk(null)
    let opened = false
    control.use?.(
      ORDER_SPOT,
      { style: 'stand', seconds: 600 },
      {
        onStart: () => {
          if (opened) return
          opened = true
          if (food) social.showBubble(food.greeter, food.greeting)
          setMenuOpen(true)
          setExpanded(true)
        },
        onDone: () => {},
        onAbort: () => setMenuOpen(false),
      },
    )
  }

  /** Buy and eat in one go (as Wise Gourmet). */
  const order = async (item: ShopItem) => {
    if ((state?.cash ?? 0) < item.price) {
      notifyToast('Not enough cash for that', false)
      return
    }
    setOrdering(item.id)
    try {
      const bought = await buy(item.id, 1)
      if (!bought) return
      // Eat on the spot: a 5 s activity bar, the food counts when it finishes
      await runTimed({ emoji: item.emoji, title: `Eating ${item.name.toLowerCase()}`, seconds: 5 }, async () => {
        if (await useItem(item.id)) {
          notifyToast(`${item.emoji} ${item.name}: enjoy!`, true)
          social.showBubble('me', `${item.emoji} Yum!`)
        }
      })
    } finally {
      setOrdering(null)
    }
  }

  /** Play and Chill: run onto the pitch, then play for a while (the activity bar counts down). */
  const goPlay = () => {
    const play = food?.play
    if (!play) return
    setExpanded(false)
    social.setTalk(null)
    if (food) social.showBubble(food.greeter, food.greeting)
    control.use?.(
      play.spot as Parameters<NonNullable<typeof control.use>>[0],
      { style: play.style, seconds: play.seconds },
      {
        onStart: () => startActivity({ emoji: play.emoji, title: play.title, seconds: play.seconds, onCancel: () => control.stop?.() }),
        // Full match played: the server's hang-out reward (+Social, +Fun, costs ₦200)
        onDone: () => {
          endActivity()
          void act('hangout')
        },
        onAbort: endActivity,
      },
    )
  }

  // Student Conference: host a Space from the podium; the screen shows whoever is live
  const stage = food?.stage
  const [stageOpen, setStageOpen] = useState(false)
  const [goingLive, setGoingLive] = useState(false)
  const [stageTitle, setStageTitle] = useState('')
  const [stageError, setStageError] = useState<string | null>(null)
  const { live: stageLive, refresh: refreshStage } = useStageSpace(hallId, Boolean(stage) && inside)
  // The hall's speakers: your connection to the stage Space while you're in here
  const [stageJoin, setStageJoin] = useState<StageJoin | null>(null)
  const dropStage = useCallback(() => {
    setStageJoin(null)
    refreshStage()
  }, [refreshStage])
  const listenStage = async () => {
    if (!stageLive) return
    const res = await joinSpace(stageLive.id)
    if (!res.ok) return notifyToast(res.error || 'Could not reach the stage.', false)
    setStageJoin(res)
  }
  // 🎙️ over whoever is talking (you, or another player in the hall)
  const lastMark = useRef<Record<string, number>>({})
  const onSpeaking = useCallback(
    (ids: string[], localId: string | null) => {
      const now = Date.now()
      for (const id of ids) {
        if (now - (lastMark.current[id] ?? 0) < 2500) continue
        lastMark.current[id] = now
        social.showBubble(id === localId ? 'me' : id, '🎙️ Speaking…')
      }
    },
    [social],
  )

  /** Up the steps to the podium, then go live: the Space opens in the phone with your mic. */
  const hostSpace = (title: string) => {
    if (!stage || goingLive) return
    if (stageLive && !stageLive.mine) {
      notifyToast('The stage is busy. Join as a listener for now.', false)
      return
    }
    setGoingLive(true)
    setStageError(null)
    setExpanded(false)
    social.setTalk(null)
    let started = false
    control.use?.(
      stage.spot as Parameters<NonNullable<typeof control.use>>[0],
      { style: 'stand', seconds: 3600 },
      {
        onStart: () => {
          if (started) return
          started = true
          void goLiveHere(hallId, title).then((res) => {
            setGoingLive(false)
            if (!res.ok) {
              notifyToast(res.error, false)
              setStageError(res.error)
              setExpanded(true)
              setStageOpen(true)
              control.stop?.()
              return
            }
            setStageTitle('')
            setStageJoin(res.join)
            social.showBubble('me', '🎙️ We are live!')
            if (food) social.showBubble(food.greeter, 'Everyone, please take your seats 👏')
            refreshStage()
          })
        },
        onDone: () => {},
        onAbort: () => setGoingLive(false),
      },
    )
  }

  const onFoodNpc = (npc: FoodNpc) => {
    if (!npc.seated && !food?.play) return goToCounter()
    setMenuOpen(false)
    social.talkToNpc({ id: npc.id, name: npc.name, role: npc.role, line: npc.line })
  }

  /** Walk to the NPC's desk, then open their task. */
  const goToDesk = (id: HubDeskId) => {
    const desk = HUB_DESKS.find((d) => d.id === id)
    if (!desk) return
    setExpanded(false)
    let opened = false
    const open = () => {
      if (opened) return
      opened = true
      setDeskOpen(id)
    }
    control.use?.(
      hubSpotKey(id),
      { style: 'stand', seconds: 600 },
      {
        onStart: () => {
          startActivity({ emoji: desk.emoji, title: `${desk.title} · ${desk.npc.name}`, seconds: 600, onCancel: () => control.stop?.() })
          open()
        },
        onDone: endActivity,
        onAbort: endActivity,
      },
    )
  }

  const effects = useCallback(
    (root: Object3D) => (
      <>
      {hallFor(hallId) ? <ClassSigns root={root} names={hallNeighbours(hallId)} /> : null}
      {isHub ? <HubNpcs onTap={(id) => goToDesk(id)} onSeat={(id) => sit(undefined, id)} /> : null}
      {isChurch ? <ChurchNpcs /> : null}
      {isAutos ? <ShowroomCars onTap={(id) => openCarLot('showroom', id)} /> : null}
      {food ? <FoodNpcs npcs={food.npcs} onTap={onFoodNpc} bubbles={social.bubbles} /> : null}
      {stage ? <StageScreen live={stageLive} at={stage.screen.at} size={stage.screen.size} /> : null}
      <ClubPeers
        peers={live.peers}
        roster={live.roster}
        bubbles={social.bubbles}
        onTap={(peer) => social.setTalk({ kind: 'player', player: { userId: peer.userId, username: peer.username } })}
      />
      </>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- goToDesk only uses the stable control
    [live.peers, live.roster, social, isHub, isChurch, isAutos, food, stage, stageLive, hallId],
  )

  /** Nearest chair to you that nobody in your group is sitting on (or standing at). */
  const freeSeat = () => {
    const taken = [...live.peers.current.values()]
      .map((p) => p.state)
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
    const near = (x: number, z: number) => taken.some((t) => Math.hypot(t.x - x, t.z - z) < 0.5)
    const { x, z } = me.current
    return [...seats]
      .filter((s) => !near(s.x, s.z))
      .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0]
  }

  const sit = (what: { emoji: string; title: string; seconds: number } = { emoji: '🪑', title: 'Seated', seconds: SIT_SECONDS }, seatId?: string) => {
    // A tapped chair (if nobody's on it), else the nearest free one
    const seat = (seatId ? seats.find((s) => s.id === seatId) : undefined) ?? freeSeat()
    if (!seat) {
      notifyToast(hall?.office ? 'Every seat is taken.' : 'Every seat is taken. Stand at the back for now.', false)
      return
    }
    setExpanded(false)
    control.use?.(
      seatKey(seat.id),
      { style: 'sit', seconds: what.seconds },
      {
        onStart: () =>
          startActivity({ emoji: what.emoji, title: `${what.title} · ${seat.label ?? `row ${seat.row}`}`, seconds: what.seconds, onCancel: () => control.stop?.() }),
        onDone: endActivity,
        onAbort: endActivity,
      },
    )
  }

  const leave = () => {
    endActivity()
    select(null)
    pushNavigation(router, '/', '/room')
  }

  if (!hall) return null

  const isHere = state?.locationId === hallId
  const run = (action: BuildingActionDef) => {
    setExpanded(false)
    runAction.current?.(action)
    if (SEATED.has(action.id) && !hall.office) {
      const minutes = action.chips.find((c) => c.kind === 'time')
      const seconds = minutes && minutes.kind === 'time' ? actionSeconds(minutes.minutes) : SIT_SECONDS
      sit({ emoji: action.emoji, title: action.title, seconds })
    }
  }

  const count = presence.insideCount
  const subtitle = !view
    ? 'Loading…'
    : !view.venue.open
      ? `Closed · open ${view.venue.hours}`
      : `${count.toLocaleString()} ${hall.office ? 'inside' : 'in class'} · ${view.venue.hours}`

  return (
    <div className={hall.office ? `${styles.root} ${styles.office}` : styles.root} aria-label={hall.name}>
      <div className={styles.stage}>
        <HomeCanvas
          layout={hall.layout}
          paint={hall.paint}
          appearance={state?.appearance}
          control={control}
          clock={hall.office ? undefined : clock}
          effects={effects}
          onFurniture={
            inside
              ? (key) => {
                  if (key.startsWith('seat:')) sit(undefined, key.slice(5))
                }
              : undefined
          }
          onPlayerMove={inside ? onPlayerMove : undefined}
        />
      </div>

      {stage && inside ? (
        <StageAudio live={stageLive} join={stageJoin} onJoin={setStageJoin} onDrop={dropStage} onSpeaking={onSpeaking} />
      ) : null}
      {social.talk ? <PlaceTalkCard social={social} placeName={hall.name} /> : null}
      {isAutos ? <CarLotSheet /> : null}
      {social.talk || carLot ? null : (
      <PlaceSheet
        icon={hall.icon}
        title={hall.name}
        subtitle={subtitle}
        buttons={[
          ...(inside && !isAutos
            ? [{ icon: <Users size={18} />, label: 'People', onClick: () => setPeopleOpen(true), badge: count > 1 ? Math.min(count, 99) : undefined }]
            : []),
          ...(stage
            ? [{ icon: <Mic size={18} />, label: 'Host a Space', onClick: () => { setStageOpen((o) => !o); setExpanded(true) }, badge: stageLive ? 1 : undefined }]
            : isFood && !food?.play
              ? [{ icon: <UtensilsCrossed size={18} />, label: 'Order', onClick: () => (menuOpen ? setMenuOpen(false) : goToCounter()) }]
              : isAutos
                ? [
                    { icon: <Car size={18} />, label: 'Showroom', onClick: () => openCarLot('showroom') },
                    { icon: <KeyRound size={18} />, label: 'My garage', onClick: () => openCarLot('garage') },
                  ]
                : []),
          { icon: <MapIcon size={18} />, label: 'Map', onClick: leave },
        ]}
        expanded={expanded}
        onExpandedChange={setExpanded}
      >
        {isFood && menuOpen ? (
          <PlaceActions>
            {food?.soldOut ? (
              <PlaceAction emoji="📦" title="Out of stock" price="Soon" note="Nothing on the shelves yet. New goods are coming soon." disabled onClick={() => {}} />
            ) : menu.length === 0 ? (
              <p className={styles.note}>The menu is loading…</p>
            ) : (
              menu.map((item) => (
                <PlaceAction
                  key={item.id}
                  emoji={item.emoji}
                  title={`Buy ${item.name.toLowerCase()}`}
                  price={`₦${item.price.toLocaleString()}`}
                  tags={Object.entries(item.effects?.needs ?? {})
                    .filter(([, v]) => (v ?? 0) > 0)
                    .slice(0, 2)
                    .map(([k]) => ({ text: `+${k === 'hunger' ? 'Food' : k[0]!.toUpperCase() + k.slice(1)}`, tone: 'good' as const }))}
                  note={(state?.cash ?? 0) < item.price ? 'Not enough cash' : undefined}
                  disabled={shopBusy || ordering !== null || (state?.cash ?? 0) < item.price}
                  onClick={() => void order(item)}
                />
              ))
            )}
          </PlaceActions>
        ) : null}
        {stage && (stageOpen || stageLive) ? <StagePanel live={stageLive} inside={inside} busy={goingLive} hearing={stageJoin !== null} title={stageTitle} onTitle={(t) => { setStageTitle(t); setStageError(null) }} error={stageError} onHost={hostSpace} onListen={() => void listenStage()} /> : null}
        {food?.play ? (
          <PlaceActions>
            <PlaceAction emoji={food.play.emoji} title={food.play.title} price="₦200" tags={[{ text: '+Fun', tone: 'good' as const }, { text: '+Social', tone: 'good' as const }]} note={food.play.note} disabled={!inside} onClick={goPlay} />
          </PlaceActions>
        ) : null}
        {isFood && !menuOpen && !food?.play ? (
          <PlaceActions>
            <PlaceAction emoji={food?.soldOut ? '🛒' : '🍛'} title={food?.soldOut ? 'Ask at the till' : 'Order food at the counter'} price={food?.soldOut ? 'Out of stock' : 'Menu'} note={food?.orderNote} disabled={!inside} onClick={goToCounter} />
          </PlaceActions>
        ) : null}
        {inside ? <PlaceReactions onReact={social.react} /> : null}
        {isHub ? (
          <PlaceActions>
            {HUB_DESKS.map((d) => (
              <PlaceAction
                key={d.id}
                emoji={d.emoji}
                title={`${d.title} · ${d.npc.name}`}
                price={d.soon ? 'Soon' : 'Free'}
                note={d.blurb}
                disabled={!inside}
                onClick={() => goToDesk(d.id)}
              />
            ))}
          </PlaceActions>
        ) : null}
        {/* Food places use the counter menu and seats instead of the old building cards (jobs still show) */}
        {building && !isFood ? (
          <BuildingActionCards
            building={building}
            placeId={hallId}
            onRun={run}
            before={
              hall.seats.length ? (
                <>
                  {isChurch ? (
                    <PlaceAction
                      emoji="🙏"
                      title="Pray"
                      price="Free"
                      note="Sit on a pew and pray quietly."
                      disabled={!inside}
                      onClick={() => sit({ emoji: '🙏', title: 'Praying', seconds: 45 })}
                    />
                  ) : null}
                  <PlaceAction emoji="🪑" title={isChurch ? 'Sit on a pew' : 'Take a seat'} price="Free" disabled={!inside} onClick={() => sit()} />
                </>
              ) : null
            }
          />
        ) : !hall.seats.length ? null : (
          <PlaceActions>
            {isChurch ? (
              <PlaceAction
                emoji="🙏"
                title="Pray"
                price="Free"
                note="Sit on a pew and pray quietly."
                disabled={!inside}
                onClick={() => sit({ emoji: '🙏', title: 'Praying', seconds: 45 })}
              />
            ) : null}
            <PlaceAction emoji="🪑" title={isChurch ? 'Sit on a pew' : 'Take a seat'} price="Free" disabled={!inside} onClick={() => sit()} />
          </PlaceActions>
        )}
        {!inside && view && !view.venue.open ? (
          <p className={styles.note}>
            <BookOpen size={14} aria-hidden="true" /> {hall.office ? `The office is closed. Open ${view.venue.hours}.` : `The hall is locked. Classes run ${view.venue.hours}.`}
          </p>
        ) : null}
        {isHere && building?.showJobs ? <JobsPanel placeId={hallId} /> : null}
        {inside ? (
          <PlacePeople
            count={count}
            people={presence.others.slice(0, 6).map((p) => ({ id: p.userId, username: p.username, look: p.appearance }))}
            onPick={(id) => {
              const person = presence.others.find((p) => p.userId === id)
              if (person) social.setTalk({ kind: 'player', player: { userId: person.userId, username: person.username } })
            }}
            onMore={() => setPeopleOpen(true)}
          />
        ) : null}
      </PlaceSheet>
      )}

      {/* Runs the cards' actions (and their quiz / results screens); its own list stays hidden */}
      {deskOpen ? <HubDeskPanel deskId={deskOpen} onClose={() => setDeskOpen(null)} /> : null}
      {building ? <BuildingPanel headless={{ buildingId: hallId, runRef: runAction }} /> : null}
      {inside ? <ClubPeople venueId={hallId} open={peopleOpen} initialPick={null} onOpenChange={setPeopleOpen} /> : null}
    </div>
  )
}
