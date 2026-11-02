'use client'

import { BookOpen, Map as MapIcon, Users } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Object3D } from 'three'
import { BuildingPanel, type BuildingActionRunner } from '@/components/buildings/building-panel'
import { ClubPeers } from '@/components/club/club-peers'
import { ClubPeople } from '@/components/club/club-people'
import { JobsPanel } from '@/components/hud/jobs-panel'
import { PlaceAction, PlaceActions, PlaceSheet, type PlaceTag } from '@/components/hud/place-sheet'
import type { PlayerMove, RoomPlayerControl } from '@/components/room/room-player'
import { useGame } from '@/hooks/use-game'
import { endActivity, startActivity } from '@/lib/game/activity'
import { BUILDINGS, isBuildingOpen, type BuildingActionDef } from '@/lib/game/buildings'
import { emptyCampus } from '@/lib/game/campus'
import { useClubLive } from '@/lib/game/club-live'
import { hallFor, officeFor } from '@/lib/game/halls'
import { HALL_SEATS, LECTURE_HALL, OFFICE, seatKey, type HallSeat, type RoomLayout } from '@/lib/game/room-layouts'
import { enterVenue, fetchVenue, leaveVenue, venueHeartbeat, type VenueView } from '@/lib/game/venues-api'
import { pushNavigation } from '@/lib/navigation/safe-nav'
import styles from './hall.module.css'

const HomeCanvas = dynamic(() => import('@/components/room/home-canvas').then((m) => m.HomeCanvas), {
  ssr: false,
  loading: () => <div className={styles.stage} aria-hidden="true" />,
})

/** How long you stay seated before standing up on your own (tap the busy pill to stand sooner). */
const SIT_SECONDS = 600
/** Activities that seat you while they run (game minutes ÷ 10 = real seconds × 6). */
const SEATED = new Set(['attend-lecture', 'night-class'])

/** An activity's chips → the card's big line and its tags. */
function cardInfo(action: BuildingActionDef): { price: string; tags: PlaceTag[] } {
  let price = 'Free'
  const tags: PlaceTag[] = []
  for (const chip of action.chips) {
    if (chip.kind === 'cash') price = `₦${Math.abs(chip.amount).toLocaleString()}`
    if (chip.kind === 'time') tags.push({ text: `${chip.minutes} min`, tone: 'info' })
    if (chip.kind === 'energy') tags.push({ text: `${chip.amount > 0 ? '+' : '−'}${Math.abs(chip.amount)} energy`, tone: chip.amount > 0 ? 'good' : 'bad' })
    if (chip.kind === 'reward') tags.push({ text: chip.text, tone: 'good' })
  }
  return { price, tags }
}

type Space = { name: string; paint?: string; layout: RoomLayout; seats: HallSeat[]; icon: string; office: boolean }

/** The 3D room for a place: the shared lecture hall, or the shared office (Admin Block keeps its navy). */
function spaceFor(id: string): Space | null {
  const hall = hallFor(id)
  if (hall) return { name: hall.name, paint: hall.color, layout: LECTURE_HALL, seats: HALL_SEATS, icon: '🎓', office: false }
  const office = officeFor(id)
  if (office) return { name: office.name, paint: office.color ?? undefined, layout: OFFICE, seats: [], icon: '🏛️', office: true }
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
  const [view, setView] = useState<VenueView | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [peopleOpen, setPeopleOpen] = useState(false)
  const me = useRef<{ x: number; z: number }>({ x: hall?.layout.start[0] ?? 0, z: hall?.layout.start[1] ?? 0 })

  const load = useCallback(async () => {
    const res = await fetchVenue(hallId)
    if (res.ok) setView(res)
    return res
  }, [hallId])

  // Walk straight in: halls are free, so enter as soon as the hall answers (and it's open)
  useEffect(() => {
    let stop = false
    void (async () => {
      const res = await load()
      if (stop || !res.ok || res.me.paid || !res.venue.open) return
      const entered = await enterVenue(hallId)
      if (!stop && entered.ok) void load()
    })()
    return () => {
      stop = true
    }
  }, [hallId, load])

  const inside = !!view?.me.paid
  const live = useClubLive(hallId, inside, state?.username)
  const { sendState } = live
  const onPlayerMove = useCallback(
    (m: PlayerMove) => {
      me.current = { x: m.x, z: m.z }
      sendState({ x: m.x, y: m.y, z: m.z, h: m.h, pose: m.pose, moving: m.moving })
    },
    [sendState],
  )

  // Heartbeat while inside (keeps your seat in the group); leave on the way out
  useEffect(() => {
    if (!inside) return
    const first = window.setTimeout(() => void venueHeartbeat(hallId).then(() => load()), 800)
    const id = window.setInterval(() => {
      void venueHeartbeat(hallId)
      void load()
    }, 30_000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(id)
      void leaveVenue(hallId)
    }
  }, [inside, hallId, load])

  const effects = useCallback(
    (_root: Object3D) => <ClubPeers peers={live.peers} roster={live.roster} />,
    [live.peers, live.roster],
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

  const sit = (what: { emoji: string; title: string; seconds: number } = { emoji: '🪑', title: 'Seated', seconds: SIT_SECONDS }) => {
    const seat = freeSeat()
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

  // Activity cards: same rules as the old pop-up (here, open, and each action's own lock)
  const gameTime = state?.gameTime ?? 10 * 60
  const gameHour = Math.floor((((gameTime % 1440) + 1440) % 1440) / 60)
  const campus = state?.campus ?? emptyCampus(100)
  const isHere = state?.locationId === hallId
  const openInfo = building ? isBuildingOpen(building, gameTime) : { open: true }
  const closedNote = building?.openHours && !openInfo.open ? `Opens at ${building.openHours.open % 12 || 12}${building.openHours.open < 12 ? 'am' : 'pm'}` : null
  const lockOf = (action: BuildingActionDef) =>
    !isHere
      ? 'Come here first'
      : closedNote ?? action.lock?.({ campus, gameHour, traits: state?.traits ?? [], placeId: hallId }) ?? null
  const run = (action: BuildingActionDef) => {
    setExpanded(false)
    runAction.current?.(action)
    if (SEATED.has(action.id) && !hall.office) {
      const minutes = action.chips.find((c) => c.kind === 'time')
      const seconds = minutes && minutes.kind === 'time' ? Math.max(20, Math.round(minutes.minutes * 6)) : SIT_SECONDS
      sit({ emoji: action.emoji, title: action.title, seconds })
    }
  }

  const count = view?.inside ?? 0
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

      <PlaceSheet
        icon={hall.icon}
        title={hall.name}
        subtitle={subtitle}
        buttons={[
          ...(inside
            ? [{ icon: <Users size={18} />, label: 'People', onClick: () => setPeopleOpen(true), badge: count > 1 ? Math.min(count, 99) : undefined }]
            : []),
          { icon: <MapIcon size={18} />, label: 'Map', onClick: leave },
        ]}
        expanded={expanded}
        onExpandedChange={setExpanded}
      >
        <PlaceActions>
          {hall.office ? null : (
            <PlaceAction emoji="🪑" title="Take a seat" price="Free" disabled={!inside} onClick={() => sit()} />
          )}
          {(building?.actions ?? []).map((action) => {
            const { price, tags } = cardInfo(action)
            const locked = lockOf(action)
            return (
              <PlaceAction
                key={action.id}
                emoji={action.emoji}
                title={action.title}
                price={price}
                tags={tags}
                note={locked ?? undefined}
                disabled={Boolean(locked)}
                onClick={() => run(action)}
              />
            )
          })}
        </PlaceActions>
        {!inside && view && !view.venue.open ? (
          <p className={styles.note}>
            <BookOpen size={14} aria-hidden="true" /> {hall.office ? `The office is closed. Open ${view.venue.hours}.` : `The hall is locked. Classes run ${view.venue.hours}.`}
          </p>
        ) : null}
        {isHere && building?.showJobs ? <JobsPanel placeId={hallId} /> : null}
      </PlaceSheet>

      {/* Runs the cards' actions (and their quiz / results screens); its own list stays hidden */}
      {building ? <BuildingPanel headless={{ buildingId: hallId, runRef: runAction }} /> : null}
      {inside ? <ClubPeople venueId={hallId} open={peopleOpen} initialPick={null} onOpenChange={setPeopleOpen} /> : null}
    </div>
  )
}
