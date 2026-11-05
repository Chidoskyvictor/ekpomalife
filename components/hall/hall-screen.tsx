'use client'

import { actionSeconds } from '@/lib/game/action-seconds'
import { BookOpen, Map as MapIcon, Users, UtensilsCrossed } from 'lucide-react'
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
import { endActivity, startActivity } from '@/lib/game/activity'
import { BUILDINGS, type BuildingActionDef } from '@/lib/game/buildings'
import { hallFor, officeFor } from '@/lib/game/halls'
import { CHURCH, CHURCH_SEATS, HALL_SEATS, INNOVATION_HUB, LECTURE_HALL, OFFICE, seatKey, type HallSeat, type RoomLayout } from '@/lib/game/room-layouts'
import { pushNavigation } from '@/lib/navigation/safe-nav'
import styles from './hall.module.css'

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
  if (hall) return { name: hall.name, paint: hall.color, layout: LECTURE_HALL, seats: HALL_SEATS, icon: '🎓', office: false }
  const office = officeFor(id)
  // The pews the church NPCs sit on are never offered to players
  const food = office?.layout === 'food' ? FOOD_PLACES[id] : undefined
  if (food) return { name: food.name, layout: food.layout, seats: food.seats, icon: food.icon, office: true }
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
  const { state, select, notifyToast } = useGame()
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
  // Spot Rite: order at the counter (like Wise Gourmet), eat at a table
  const food = officeFor(hallId)?.layout === 'food' ? FOOD_PLACES[hallId] : undefined
  const isFood = Boolean(food)
  const { shopItems, shopPlaceId, loadShop, buy, useItem, busy: shopBusy } = useEconomy()
  const [menuOpen, setMenuOpen] = useState(false)
  const [ordering, setOrdering] = useState<string | null>(null)
  useEffect(() => {
    if (isFood && !food?.soldOut) void loadShop(hallId)
  }, [isFood, food?.soldOut, hallId, loadShop])
  const menu = isFood && shopPlaceId === hallId ? shopItems.filter((item) => item.category === 'food') : []
  const [deskOpen, setDeskOpen] = useState<HubDeskId | null>(null)
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
      if (await useItem(item.id)) {
        notifyToast(`${item.emoji} ${item.name}: enjoy!`, true)
        social.showBubble('me', `${item.emoji} Yum!`)
      }
    } finally {
      setOrdering(null)
    }
  }

  const onFoodNpc = (npc: FoodNpc) => {
    if (!npc.seated) return goToCounter()
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
    (_root: Object3D) => (
      <>
      {isHub ? <HubNpcs onTap={(id) => goToDesk(id)} onSeat={(id) => sit(undefined, id)} /> : null}
      {isChurch ? <ChurchNpcs /> : null}
      {food ? <FoodNpcs npcs={food.npcs} onTap={onFoodNpc} bubbles={social.bubbles} /> : null}
      <ClubPeers
        peers={live.peers}
        roster={live.roster}
        bubbles={social.bubbles}
        onTap={(peer) => social.setTalk({ kind: 'player', player: { userId: peer.userId, username: peer.username } })}
      />
      </>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- goToDesk only uses the stable control
    [live.peers, live.roster, social, isHub, isChurch, food],
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
          effects={effects}
          onPlayerMove={inside ? onPlayerMove : undefined}
        />
      </div>

      {social.talk ? <PlaceTalkCard social={social} placeName={hall.name} /> : null}
      {social.talk ? null : (
      <PlaceSheet
        icon={hall.icon}
        title={hall.name}
        subtitle={subtitle}
        buttons={[
          ...(inside
            ? [{ icon: <Users size={18} />, label: 'People', onClick: () => setPeopleOpen(true), badge: count > 1 ? Math.min(count, 99) : undefined }]
            : []),
          ...(isFood ? [{ icon: <UtensilsCrossed size={18} />, label: 'Order', onClick: () => (menuOpen ? setMenuOpen(false) : goToCounter()) }] : []),
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
        {isFood && !menuOpen ? (
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
