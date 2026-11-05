'use client'

import { Map as MapIcon, UtensilsCrossed } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { ClubPeople } from '@/components/club/club-people'
import { PlaceReactions, PlaceTalkCard, usePlaceSocial } from '@/components/hud/interior/place-social'
import { usePlacePresence } from '@/components/hud/interior/use-place-presence'
import { PlaceAction, PlaceActions, PlacePeople, PlaceSheet, PlaceSpots, type PlaceTag } from '@/components/hud/place-sheet'
import { useEconomy } from '@/hooks/use-economy'
import { useGame } from '@/hooks/use-game'
import type { ShopItem } from '@/lib/game/economy-api'
import { markSceneReady, useTrip } from '@/lib/game/trip'
import { pushNavigation } from '@/lib/navigation/safe-nav'
import { nearestWindow, orderSpot, SEATS, SELLERS, type WiseNpc, type WisePlayer, type WiseSeat } from './wise-scene'
import styles from './wise-interior.module.css'

const WiseScene = dynamic(() => import('./wise-scene').then((m) => m.WiseScene), { ssr: false })

const PLACE_ID = 'wise-gourmet'
const PLACE_NAME = 'Wise Gourmet'

const NEED_LABEL: Record<string, string> = { hunger: 'Food', fun: 'Fun', social: 'Social', energy: 'Energy' }

function tagsFor(item: ShopItem): PlaceTag[] {
  return Object.entries(item.effects?.needs ?? {})
    .filter(([, v]) => (v ?? 0) > 0)
    .slice(0, 2)
    .map(([k]) => ({ text: `+${NEED_LABEL[k] ?? k}`, tone: 'good' as const }))
}

/** The line under the name in the sheet header; changes every few seconds like Lagos Life. */
const STATUS = [
  '🔥 Shawarma fresh off the grill',
  '🍗 Chicken and chips going fast',
  '🎶 Afrobeats on the speaker',
  '🍹 Chapman cold, cold',
  '🪑 Tables open out front',
]

const ROLE: Record<WiseNpc['role'], string> = {
  seller: 'Selling at the window',
  customer: 'Ordering at the window',
  diner: 'Eating at the tables',
}

/** Places you can walk to from the sheet ("Spots here"). */
const TABLE_IDS = [...new Set(SEATS.map((seat) => seat.table))]
const SPOTS: { id: string; emoji: string; label: string; window?: number; table?: number }[] = [
  ...SELLERS.map((s, i) => ({ id: s.id, emoji: '🪟', label: `Window ${i + 1}`, window: s.x })),
  ...TABLE_IDS.map((table, i) => ({ id: `table-${table}`, emoji: '🪑', label: `Table ${i + 1}`, table })),
]

type Walk = { to: [number, number]; seller?: WiseNpc; sit?: number }

/**
 * Wise Gourmet on the shared interior sheet: the 3D kiosk (sellers, walk-in customers, diners,
 * your group of 5), a rotating status line, reactions, spots to walk to, everyone here, and the
 * shared talk card. Tap a window or a seller to walk up and order; tap a stool to sit.
 */
export function WiseInterior() {
  const router = useRouter()
  const { state, select, notifyToast } = useGame()
  const { shopItems, shopPlaceId, loadShop, buy, useItem, busy } = useEconomy()
  const presence = usePlacePresence(PLACE_ID)
  const { live } = presence
  const social = usePlaceSocial(PLACE_ID, live)
  const [expanded, setExpanded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [ordering, setOrdering] = useState<string | null>(null)
  const [walk, setWalk] = useState<Walk | null>(null)
  const [statusIdx, setStatusIdx] = useState(0)
  const cash = state?.cash ?? 0

  // The trip that brought you here waits for this scene
  const trip = useTrip()
  const wrongPlace = trip?.scene === 'interior' && trip.target !== PLACE_ID
  useEffect(() => {
    if (wrongPlace) return
    markSceneReady('interior')
    return () => markSceneReady('interior', false)
  }, [wrongPlace])

  useEffect(() => {
    void loadShop(PLACE_ID)
  }, [loadShop])

  useEffect(() => {
    const id = window.setInterval(() => setStatusIdx((i) => (i + 1) % STATUS.length), 5000)
    return () => window.clearInterval(id)
  }, [])

  // Your group of 5, physically in the scene
  const players = useMemo<WisePlayer[]>(() => {
    void live.roster
    const others = [...live.peers.current.values()].map((p) => ({ userId: p.userId, username: p.username, appearance: p.appearance }))
    const me: WisePlayer[] = state ? [{ userId: 'me', username: state.username ?? 'You', appearance: state.appearance, me: true }] : []
    return [...me, ...others]
  }, [live.roster, live.peers, state])

  // The server falls back to the corner shop's list when a place has no menu yet: only show ours
  const menu = shopPlaceId === PLACE_ID ? shopItems.filter((item) => item.category === 'food') : []

  const order = async (item: ShopItem) => {
    if (cash < item.price) {
      notifyToast('Not enough cash for that', false)
      return
    }
    setOrdering(item.id)
    try {
      const bought = await buy(item.id, 1)
      if (!bought) return
      const ate = await useItem(item.id)
      if (ate) {
        notifyToast(`${item.emoji} ${item.name}: enjoy!`, true)
        social.showBubble('me', `${item.emoji} Yum!`)
      }
    } finally {
      setOrdering(null)
    }
  }

  const leave = () => {
    select(null)
    pushNavigation(router, '/', '/room')
  }

  const openMenu = () => {
    social.setTalk(null)
    setMenuOpen(true)
    setExpanded(true)
  }

  /** Walk up to a window; the seller greets you and the menu opens when you arrive. */
  const goToWindow = (windowX: number) => {
    const seller = nearestWindow(windowX)
    social.setTalk(null)
    setMenuOpen(false)
    setWalk({ to: orderSpot(seller.x), seller })
  }

  /** Walk to a free stool and sit down. */
  const sitAt = (seat: WiseSeat) => {
    social.setTalk(null)
    setMenuOpen(false)
    setExpanded(false)
    setWalk({ to: seat.at, sit: seat.heading })
  }

  const goToSpot = (id: string) => {
    const spot = SPOTS.find((s) => s.id === id)
    if (!spot) return
    if (spot.window !== undefined) return goToWindow(spot.window)
    const seat = SEATS.find((x) => x.table === spot.table)
    if (seat) sitAt(seat)
  }

  const onArrive = () => {
    if (!walk?.seller) return
    social.showBubble(walk.seller.id, walk.seller.line)
    openMenu()
  }

  const onNpc = (npc: WiseNpc) => {
    // Sellers take your order
    if (npc.role === 'seller') return goToWindow(SELLERS.find((s) => s.id === npc.id)?.x ?? 0)
    setMenuOpen(false)
    social.talkToNpc({ id: npc.id, name: npc.name, role: ROLE[npc.role], line: npc.line })
  }

  const onPlayer = (player: WisePlayer) => {
    if (player.me) return
    setMenuOpen(false)
    social.setTalk({ kind: 'player', player })
  }

  const pickPerson = (userId: string) => {
    const person = presence.others.find((p) => p.userId === userId)
    if (person) onPlayer({ userId: person.userId, username: person.username, appearance: person.appearance })
  }

  return (
    <div className="absolute inset-0">
      <WiseScene
        players={players}
        bubbles={social.bubbles}
        onWindow={goToWindow}
        onNpc={onNpc}
        onPlayer={onPlayer}
        meTarget={walk?.to ?? null}
        meSit={walk?.sit ?? null}
        onArrive={onArrive}
        onSeat={sitAt}
        peers={live.peers}
        onMove={live.sendState}
      />

      {social.talk ? (
        <PlaceTalkCard social={social} placeName={PLACE_NAME} />
      ) : (
        <PlaceSheet
          icon="🍽️"
          title={PLACE_NAME}
          subtitle={menuOpen ? 'What will you have?' : STATUS[statusIdx]}
          buttons={[
            { icon: <UtensilsCrossed size={18} />, label: 'Order', onClick: () => (menuOpen ? setMenuOpen(false) : openMenu()) },
            { icon: <MapIcon size={18} />, label: 'Map', onClick: leave },
          ]}
          expanded={expanded}
          onExpandedChange={(open) => {
            setExpanded(open)
            if (!open) setMenuOpen(false)
          }}
        >
          {menuOpen ? (
            <PlaceActions>
              {menu.length === 0 ? (
                <p className={styles.note}>The menu is loading…</p>
              ) : (
                menu.map((item) => (
                  <PlaceAction
                    key={item.id}
                    emoji={item.emoji}
                    title={`Buy ${item.name.toLowerCase()}`}
                    price={`₦${item.price.toLocaleString()}`}
                    tags={tagsFor(item)}
                    note={cash < item.price ? 'Not enough cash' : undefined}
                    disabled={busy || ordering !== null || cash < item.price}
                    onClick={() => void order(item)}
                  />
                ))
              )}
            </PlaceActions>
          ) : (
            <>
              <PlaceReactions onReact={social.react} />
              <PlaceSpots hint="Tap one to walk there" spots={SPOTS} value={null} onChange={goToSpot} />
              <PlacePeople
                count={presence.insideCount}
                people={presence.others.slice(0, 6).map((p) => ({ id: p.userId, username: p.username, look: p.appearance }))}
                onPick={pickPerson}
                onMore={() => setPeopleOpen(true)}
              />
            </>
          )}
        </PlaceSheet>
      )}
      <ClubPeople venueId={PLACE_ID} open={peopleOpen} onOpenChange={setPeopleOpen} />
    </div>
  )
}
