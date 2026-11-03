'use client'

import { actionSeconds } from '@/lib/game/action-seconds'
import { BookOpen, Map as MapIcon, Users } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Object3D } from 'three'
import { BuildingPanel, type BuildingActionRunner } from '@/components/buildings/building-panel'
import { ClubPeers } from '@/components/club/club-peers'
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
import { HALL_SEATS, LECTURE_HALL, OFFICE, seatKey, type HallSeat, type RoomLayout } from '@/lib/game/room-layouts'
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
  const [expanded, setExpanded] = useState(true)
  const [peopleOpen, setPeopleOpen] = useState(false)
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

  const effects = useCallback(
    (_root: Object3D) => (
      <ClubPeers
        peers={live.peers}
        roster={live.roster}
        bubbles={social.bubbles}
        onTap={(peer) => social.setTalk({ kind: 'player', player: { userId: peer.userId, username: peer.username } })}
      />
    ),
    [live.peers, live.roster, social],
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
          { icon: <MapIcon size={18} />, label: 'Map', onClick: leave },
        ]}
        expanded={expanded}
        onExpandedChange={setExpanded}
      >
        {inside ? <PlaceReactions onReact={social.react} /> : null}
        {building ? (
          <BuildingActionCards
            building={building}
            placeId={hallId}
            onRun={run}
            before={hall.office ? null : <PlaceAction emoji="🪑" title="Take a seat" price="Free" disabled={!inside} onClick={() => sit()} />}
          />
        ) : hall.office ? null : (
          <PlaceActions>
            <PlaceAction emoji="🪑" title="Take a seat" price="Free" disabled={!inside} onClick={() => sit()} />
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
            people={presence.others.slice(0, 6).map((p) => ({ id: p.userId, username: p.username }))}
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
      {building ? <BuildingPanel headless={{ buildingId: hallId, runRef: runAction }} /> : null}
      {inside ? <ClubPeople venueId={hallId} open={peopleOpen} initialPick={null} onOpenChange={setPeopleOpen} /> : null}
    </div>
  )
}
