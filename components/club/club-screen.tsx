'use client'

import { LogOut, Users } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Object3D } from 'three'
import { PlaceAction, PlaceActions, PlacePeople, PlaceSheet, PlaceSpots, type PlaceTag } from '@/components/hud/place-sheet'
import type { RoomPlayerControl } from '@/components/room/room-player'
import { useGame } from '@/hooks/use-game'
import { endActivity, startActivity } from '@/lib/game/activity'
import type { FurnitureId, UseStyle } from '@/lib/game/room-furniture'
import { CLUB_LAYOUTS } from '@/lib/game/room-layouts'
import { useClubLive } from '@/lib/game/club-live'
import {
  SPRAY_AMOUNTS,
  buyAtVenue,
  enterVenue,
  fetchClubPeople,
  fetchVenue,
  leaveVenue,
  sprayMoney,
  venueHeartbeat,
  type ClubPerson,
  type VenueItem,
  type VenueView,
} from '@/lib/game/venues-api'
import type { PlayerMove } from '@/components/room/room-player'
import { ClubFx } from './club-fx'
import { ClubPeers } from './club-peers'
import { ClubPeople } from './club-people'
import { SprayRain } from './spray-rain'
import styles from './club.module.css'

const HomeCanvas = dynamic(() => import('@/components/room/home-canvas').then((m) => m.HomeCanvas), {
  ssr: false,
  loading: () => <div className={styles.stage} aria-hidden="true" />,
})

/** Where the character goes and what it does for each kind of purchase. */
const USE: Record<VenueItem['kind'], { spot: FurnitureId; style: UseStyle; seconds: number }> = {
  dance: { spot: 'dance-floor', style: 'dance', seconds: 12 },
  drink: { spot: 'bar-stool', style: 'sit', seconds: 7 },
  vip: { spot: 'vip-sofa', style: 'sit', seconds: 8 },
  bottle: { spot: 'vip-sofa', style: 'sit', seconds: 10 },
}

/** What each kind does to you (mirrors backend venues.ts needs). */
const TAGS: Record<VenueItem['kind'], PlaceTag[]> = {
  dance: [
    { text: '+Fun', tone: 'good' },
    { text: '+Social', tone: 'info' },
    { text: '−Energy', tone: 'bad' },
  ],
  drink: [
    { text: '+Fun', tone: 'good' },
    { text: '+Social', tone: 'info' },
  ],
  vip: [{ text: '+Social', tone: 'info' }],
  bottle: [
    { text: '+Fun', tone: 'good' },
    { text: '+Social', tone: 'info' },
  ],
}

type Spot = 'floor' | 'bar' | 'vip' | 'spray'
const SPOTS: { id: Spot; emoji: string; label: string }[] = [
  { id: 'floor', emoji: '💃', label: 'Dance floor' },
  { id: 'bar', emoji: '🍹', label: 'Bar' },
  { id: 'vip', emoji: '🛋️', label: 'VIP' },
  { id: 'spray', emoji: '💸', label: 'Spray' },
]

const naira = (n: number) => `₦${n.toLocaleString()}`

/** A club (Sazza): pay the door, then dance, drink, take VIP or pop a bottle with everyone inside. */
export function ClubScreen({ venueId }: { venueId: string }) {
  const router = useRouter()
  const { state, notifyToast, refreshServer } = useGame()
  const layout = CLUB_LAYOUTS[venueId]
  const control = useMemo<RoomPlayerControl>(() => ({}), [])
  const [view, setView] = useState<VenueView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Blocks a second tap before the button re-renders as busy (so nothing is bought twice)
  const inFlight = useRef(false)
  const [expanded, setExpanded] = useState(false)
  const [spot, setSpot] = useState<Spot>('floor')
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [picked, setPicked] = useState<ClubPerson | null>(null)
  const [faces, setFaces] = useState<ClubPerson[]>([])

  const load = useCallback(async () => {
    const res = await fetchVenue(venueId)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setError(null)
    setView(res)
  }, [venueId])

  useEffect(() => {
    void load()
  }, [load])

  const inside = !!view?.me.paid
  // Live crowd: the others in your group, and money sprays
  const live = useClubLive(venueId, inside, state?.username)
  const { sendState } = live
  const onPlayerMove = useCallback(
    (m: PlayerMove) => sendState({ x: m.x, y: m.y, z: m.z, h: m.h, pose: m.pose, moving: m.moving }),
    [sendState],
  )

  // Still here: heartbeat while inside (and the count / spender board refresh); leave on the way out
  useEffect(() => {
    if (!inside) return
    // First ping shortly after arriving (lands after a dev double-mount's "left" call)
    const first = window.setTimeout(() => void venueHeartbeat(venueId).then(() => load()), 800)
    const id = window.setInterval(() => {
      void venueHeartbeat(venueId)
      void load()
    }, 30_000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(id)
      void leaveVenue(venueId)
    }
  }, [inside, venueId, load])

  // Faces for the "Players here" row, while the sheet is open
  useEffect(() => {
    if (!inside || !expanded) return
    let stop = false
    void fetchClubPeople(venueId, 0).then((res) => {
      if (!stop && res.ok) setFaces(res.people.filter((p) => p.username !== state?.username).slice(0, 8))
    })
    return () => {
      stop = true
    }
  }, [inside, expanded, venueId, state?.username, view?.inside])

  const leave = () => {
    endActivity()
    void leaveVenue(venueId)
    router.push('/')
  }

  const enter = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    const res = await enterVenue(venueId)
    inFlight.current = false
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    notifyToast(res.message, true)
    setExpanded(false)
    void refreshServer()
    await load()
  }

  const buy = async (item: VenueItem) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    const res = await buyAtVenue(venueId, item.id)
    inFlight.current = false
    setBusy(false)
    if (!res.ok) {
      notifyToast(res.error, false)
      return
    }
    // Paid: close the sheet, walk over and do it; the busy pill counts down once you're there
    setExpanded(false)
    const how = USE[item.kind]
    control.use?.(
      how.spot,
      { style: how.style, seconds: how.seconds },
      {
        onStart: () => startActivity({ emoji: item.emoji, title: item.name, seconds: how.seconds, onCancel: () => control.stop?.() }),
        onDone: endActivity,
        onAbort: endActivity,
      },
    )
    notifyToast(res.message, true)
    void refreshServer()
    void load()
  }

  const spray = async (amount: number) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    const res = await sprayMoney(venueId, amount)
    inFlight.current = false
    setBusy(false)
    if (!res.ok) {
      notifyToast(res.error, false)
      return
    }
    setExpanded(false)
    live.addOwnSpray({ id: res.sprayId, by: res.by, byUsername: res.byUsername, amount, notes: res.notes, endsAt: res.endsAt })
    void refreshServer()
    void load()
  }

  // Money picked from a spray lands in your wallet: refresh the balance
  useEffect(() => {
    if (live.lastGot) void refreshServer()
  }, [live.lastGot, refreshServer])

  const effects = useCallback(
    (root: Object3D) => (
      <>
        <ClubFx root={root} clubName={view?.venue.name ?? ''} top={view?.top ?? []} />
        <ClubPeers peers={live.peers} roster={live.roster} />
      </>
    ),
    [view?.venue.name, view?.top, live.peers, live.roster],
  )

  if (!layout) return <div className={styles.status}>This club isn't open yet.</div>

  const items = view?.venue.items ?? []
  const dance = items.find((i) => i.kind === 'dance')
  const vip = items.find((i) => i.kind === 'vip')
  const drinks = items.filter((i) => i.kind === 'drink')
  const bottles = items.filter((i) => i.kind === 'bottle')
  const top = view?.top[0]

  const card = (item: VenueItem) => (
    <PlaceAction
      key={item.id}
      emoji={item.emoji}
      seconds={USE[item.kind].seconds}
      price={item.price ? naira(item.price) : 'Free'}
      title={item.name}
      tags={TAGS[item.kind]}
      note={item.vipOnly && !view?.me.vip ? 'Get VIP first' : undefined}
      disabled={busy || (item.vipOnly && !view?.me.vip)}
      onClick={() => void buy(item)}
    />
  )

  return (
    <div className={styles.root} aria-label={view?.venue.name ?? 'Club'}>
      <div className={styles.stage}>
        <HomeCanvas
          layout={layout}
          appearance={state?.appearance}
          control={control}
          effects={effects}
          onPlayerMove={inside ? onPlayerMove : undefined}
        />
      </div>

      {view ? (
        <PlaceSheet
          tone="night"
          icon="🪩"
          title={view.venue.name.toUpperCase()}
          subtitle={
            inside
              ? `${view.inside.toLocaleString()} inside${top ? ` · @${top.username} is shutting it down` : ' · The night is young'}`
              : view.venue.open
                ? `Entry ${naira(view.venue.entry)} · ${view.inside.toLocaleString()} inside`
                : `Closed · opens ${view.venue.hours}`
          }
          buttons={
            inside
              ? [
                  { icon: <Users size={18} />, label: 'People', onClick: () => setPeopleOpen(true), badge: view.inside > 1 ? Math.min(view.inside, 99) : undefined },
                  { icon: <LogOut size={18} />, label: 'Leave', onClick: leave },
                ]
              : [{ icon: <LogOut size={18} />, label: 'Back to map', onClick: () => router.push('/') }]
          }
          expanded={expanded || !inside}
          onExpandedChange={(open) => setExpanded(open)}
        >
          {inside ? (
            <>
              <PlaceSpots spots={SPOTS} value={spot} onChange={setSpot} hint="Tap one to see what's there" />
              <PlaceActions>
                {spot === 'floor' && dance ? card(dance) : null}
                {spot === 'bar' ? drinks.map(card) : null}
                {spot === 'vip' && vip ? (
                  <PlaceAction
                    emoji={vip.emoji}
                    seconds={USE.vip.seconds}
                    price={view.me.vip ? 'Yours tonight' : naira(vip.price)}
                    title={view.me.vip ? 'VIP table ✓' : 'VIP table'}
                    tags={TAGS.vip}
                    disabled={busy || view.me.vip}
                    onClick={() => void buy(vip)}
                  />
                ) : null}
                {spot === 'vip' ? bottles.map(card) : null}
                {spot === 'spray'
                  ? SPRAY_AMOUNTS.map((amount) => (
                      <PlaceAction
                        key={amount}
                        emoji={amount >= 500_000 ? '🤑' : '💵'}
                        price={naira(amount)}
                        title="Spray the crowd"
                        note="Fastest hands keep it"
                        tags={[{ text: '+Clout', tone: 'info' }]}
                        disabled={busy}
                        onClick={() => void spray(amount)}
                      />
                    ))
                  : null}
              </PlaceActions>
              <PlacePeople
                count={view.inside}
                people={faces.map((p) => ({ id: p.userId, username: p.username, mark: p.vip ? 'VIP' : undefined }))}
                onPick={(id) => {
                  setPicked(faces.find((p) => p.userId === id) ?? null)
                  setPeopleOpen(true)
                }}
                onMore={() => {
                  setPicked(null)
                  setPeopleOpen(true)
                }}
              />
            </>
          ) : (
            <div className={styles.entry}>
              <div className={styles.entryRow}>
                <span>Entry tonight</span>
                <strong>{naira(view.venue.entry)}</strong>
              </div>
              <div className={styles.entryRow}>
                <span>Inside now</span>
                <strong>{view.inside.toLocaleString()}</strong>
              </div>
              {error ? <p className={styles.error}>{error}</p> : null}
              {view.venue.open ? (
                <button type="button" className={styles.primary} disabled={busy} onClick={() => void enter()}>
                  {busy ? 'Paying…' : `Enter · ${naira(view.venue.entry)}`}
                </button>
              ) : (
                <p className={styles.doorNote}>Closed now. Doors open at night ({view.venue.hours}).</p>
              )}
            </div>
          )}
        </PlaceSheet>
      ) : null}

      {inside ? (
        <ClubPeople
          venueId={venueId}
          open={peopleOpen}
          initialPick={picked}
          onOpenChange={(open) => {
            setPeopleOpen(open)
            if (!open) setPicked(null)
          }}
        />
      ) : null}
      {inside ? <SprayRain sprays={live.sprays} lastGot={live.lastGot} onPick={live.pick} /> : null}

      {!view && !error ? <p className={styles.status}>Loading club…</p> : null}
      {!view && error ? <p className={styles.status}>{error}</p> : null}
    </div>
  )
}
