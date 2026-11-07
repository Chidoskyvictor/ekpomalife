'use client'

import { Map as MapIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BuildingPanel, type BuildingActionRunner } from '@/components/buildings/building-panel'
import { ClubPeople } from '@/components/club/club-people'
import { ClubScreen } from '@/components/club/club-screen'
import { CLUB_LAYOUTS } from '@/lib/game/room-layouts'
import { BuildingActionCards } from '@/components/hud/interior/building-actions'
import { PlaceReactions, PlaceTalkCard, usePlaceSocial } from '@/components/hud/interior/place-social'
import { usePlacePresence } from '@/components/hud/interior/use-place-presence'
import { JobsPanel } from '@/components/hud/jobs-panel'
import { PlacePeople, PlaceSheet } from '@/components/hud/place-sheet'
import { ShopGrid } from '@/components/hud/shop-grid'
import { useEconomy } from '@/hooks/use-economy'
import { HallScreen } from '@/components/hall/hall-screen'
import { useGame } from '@/hooks/use-game'
import { BUILDINGS, type BuildingActionDef } from '@/lib/game/buildings'
import { hallFor, officeFor } from '@/lib/game/halls'
import { PLACE_INFO } from '@/lib/game/place-info'
import { formatOpenHour, getPlace, isPlaceOpen } from '@/lib/game/places'
import { markSceneReady, useTrip } from '@/lib/game/trip'
import { pushNavigation } from '@/lib/navigation/safe-nav'
import styles from './place-interior.module.css'
import { WiseInterior } from './wise-interior'

const EMOJI: Record<string, string> = {
  campus: '🎓',
  hostel: '🛏️',
  food: '🍲',
  shop: '🛒',
  leisure: '🎉',
  worship: '⛪',
  community: '🏥',
}

/**
 * The inside of the place you're at. Halls/offices and Wise Gourmet have 3D scenes; every other
 * place shows a stand-in backdrop with the shared place sheet (its activities, shop, jobs,
 * reactions, who's here) until a 3D interior is modelled. Map leaves from here.
 */
export function PlaceInterior({ placeId }: { placeId: string }) {
  return (
    <ClosedGate placeId={placeId}>
      <OpenInterior placeId={placeId} />
    </ClosedGate>
  )
}

/** Closed right now: no interior, just when it opens and the way back to the map. */
function ClosedGate({ placeId, children }: { placeId: string; children: React.ReactNode }) {
  const router = useRouter()
  const { state } = useGame()
  const trip = useTrip()
  const place = getPlace(placeId)
  const closed = Boolean(state && place?.openHours && !isPlaceOpen(place, state.gameTime ?? 12 * 60))
  // Let the trip screen finish onto this notice instead of hanging
  useEffect(() => {
    if (!closed || (trip?.scene === 'interior' && trip.target !== placeId)) return
    markSceneReady('interior')
    return () => markSceneReady('interior', false)
  }, [closed, placeId, trip?.scene, trip?.target])
  if (!closed || !place?.openHours) return <>{children}</>
  return (
    <div className={styles.stage} role="status">
      <span className={styles.emoji} aria-hidden="true">🔒</span>
      <h1 className={styles.title}>{place.label} is closed</h1>
      <p className={styles.note}>Come back at {formatOpenHour(place.openHours.open)}. It is open {formatOpenHour(place.openHours.open)} to {formatOpenHour(place.openHours.close)}.</p>
      <div className={styles.actions}>
        <button type="button" className={styles.action} onClick={() => pushNavigation(router, '/')}>
          <MapIcon size={18} aria-hidden="true" /> Back to map
        </button>
      </div>
    </div>
  )
}

function OpenInterior({ placeId }: { placeId: string }) {
  // Lecture halls and faculties have a real 3D hall with classmates in it
  if (hallFor(placeId) || officeFor(placeId)) return <HallInterior placeId={placeId} />
  if (placeId === 'wise-gourmet') return <WiseInterior />
  // Clubs with a 3D floor (Sazza): straight onto the dance floor, no "Enter" sheet first
  if (CLUB_LAYOUTS[placeId]) return <ClubInterior placeId={placeId} />
  return <StandInInterior placeId={placeId} />
}

/** A club's 3D floor; tells the trip screen when it's up. */
function ClubInterior({ placeId }: { placeId: string }) {
  const trip = useTrip()
  const wrongPlace = trip?.scene === 'interior' && trip.target !== placeId
  useEffect(() => {
    if (wrongPlace) return
    markSceneReady('interior')
    return () => markSceneReady('interior', false)
  }, [placeId, wrongPlace])
  return <ClubScreen venueId={placeId} />
}

/** The 3D lecture hall or office; still tells the trip screen when it's up. */
function HallInterior({ placeId }: { placeId: string }) {
  const trip = useTrip()
  const wrongPlace = trip?.scene === 'interior' && trip.target !== placeId
  useEffect(() => {
    if (wrongPlace) return
    markSceneReady('interior')
    return () => markSceneReady('interior', false)
  }, [placeId, wrongPlace])
  return <HallScreen hallId={placeId} />
}

function StandInInterior({ placeId }: { placeId: string }) {
  const router = useRouter()
  const { state, select } = useGame()
  const { shopItems, loadShop, loading } = useEconomy()
  const place = getPlace(placeId)
  const info = PLACE_INFO[placeId]
  const building = BUILDINGS[placeId] ?? null
  const runAction = useRef<BuildingActionRunner | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [peopleOpen, setPeopleOpen] = useState(false)
  const name = place?.label ?? 'Inside'
  const isHere = state?.locationId === placeId

  // Who's here (every public place is a free walk-in venue), reactions and the talk card
  const presence = usePlacePresence(placeId)
  const social = usePlaceSocial(placeId, presence.live)

  // The trip that brought you here holds its screen until this is up. A fresh page starts from the
  // saved place before the server answers, so only the place the trip is heading to counts.
  const trip = useTrip()
  const wrongPlace = trip?.scene === 'interior' && trip.target !== placeId
  useEffect(() => {
    if (wrongPlace) return
    markSceneReady('interior')
    return () => markSceneReady('interior', false)
  }, [placeId, wrongPlace])

  useEffect(() => {
    if (building?.showShop && isHere) void loadShop(placeId)
  }, [building?.showShop, isHere, loadShop, placeId])

  const leave = () => {
    select(null)
    pushNavigation(router, '/', '/room')
  }

  const run = (action: BuildingActionDef) => {
    setExpanded(false)
    runAction.current?.(action)
  }

  const subtitle = info?.about ?? (presence.inside ? `${presence.insideCount.toLocaleString()} here` : 'You’re inside')

  return (
    <div className={styles.stage}>
      {/* stand-in backdrop until this place gets its own 3D interior */}
      <span className={styles.emoji} aria-hidden="true">
        {EMOJI[place?.type ?? ''] ?? '📍'}
      </span>
      <h1 className={styles.title}>{name}</h1>
      <p className={styles.note}>🚧 This building is still under construction. You can still use what's here.</p>
      {social.bubbles.me ? <p className={styles.bubble}>{social.bubbles.me}</p> : null}

      {social.talk ? (
        <PlaceTalkCard social={social} placeName={name} />
      ) : (
        <PlaceSheet
          icon={EMOJI[place?.type ?? ''] ?? '📍'}
          title={name}
          subtitle={subtitle}
          buttons={[{ icon: <MapIcon size={18} />, label: 'Map', onClick: leave }]}
          expanded={expanded}
          onExpandedChange={setExpanded}
        >
          {presence.inside ? <PlaceReactions onReact={social.react} /> : null}
          {building ? (
            <BuildingActionCards building={building} placeId={placeId} onRun={run} />
          ) : info?.doing.length ? (
            <ul className={styles.doing}>
              {info.doing.map((line) => (
                <li key={line.text}>
                  <span aria-hidden="true">{line.emoji}</span>
                  {line.text}
                </li>
              ))}
            </ul>
          ) : null}
          {isHere && building?.showShop ? (
            <div className={styles.block}>
              <p className={styles.blockTitle}>Shop</p>
              {loading && shopItems.length === 0 ? <p className={styles.note}>Loading…</p> : <ShopGrid items={shopItems} />}
            </div>
          ) : null}
          {isHere && building?.showJobs ? <JobsPanel placeId={placeId} /> : null}
          {presence.inside ? (
            <PlacePeople
              count={presence.insideCount}
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

      {/* Runs the cards' actions (and their quiz / fees / results screens); its own list stays hidden */}
      {building ? <BuildingPanel headless={{ buildingId: placeId, runRef: runAction }} /> : null}
      {presence.inside ? <ClubPeople venueId={placeId} open={peopleOpen} onOpenChange={setPeopleOpen} /> : null}
    </div>
  )
}
