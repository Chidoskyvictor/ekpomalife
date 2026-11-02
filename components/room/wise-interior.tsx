'use client'

import { Map as MapIcon, UtensilsCrossed, X } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PlaceAction, PlaceActions, PlaceSheet, type PlaceTag } from '@/components/hud/place-sheet'
import { useEconomy } from '@/hooks/use-economy'
import { useGame } from '@/hooks/use-game'
import { useClubLive } from '@/lib/game/club-live'
import type { ShopItem } from '@/lib/game/economy-api'
import { QUICK_LINES, quickLineText } from '@/lib/game/quick-lines'
import { markSceneReady, useTrip } from '@/lib/game/trip'
import { enterVenue, fetchVenue, leaveVenue, venueHeartbeat, type VenueView } from '@/lib/game/venues-api'
import { pushNavigation } from '@/lib/navigation/safe-nav'
import { nearestWindow, orderSpot, SELLERS, type WiseNpc, type WisePlayer } from './wise-scene'
import styles from './wise-interior.module.css'

const WiseScene = dynamic(() => import('./wise-scene').then((m) => m.WiseScene), { ssr: false })

const PLACE_ID = 'wise-gourmet'
const BUBBLE_MS = 4000

const NEED_LABEL: Record<string, string> = { hunger: 'Food', fun: 'Fun', social: 'Social', energy: 'Energy' }

function tagsFor(item: ShopItem): PlaceTag[] {
  return Object.entries(item.effects?.needs ?? {})
    .filter(([, v]) => (v ?? 0) > 0)
    .slice(0, 2)
    .map(([k]) => ({ text: `+${NEED_LABEL[k] ?? k}`, tone: 'good' as const }))
}

/** What an NPC says back to each quick line. */
const NPC_REPLY: Record<string, string> = {
  hi: 'Hi dear! 😊',
  'how-far': 'I dey o, how body? 😄',
  'food-sweet': 'Na Wise na! Always sweet 😋',
  'join-me': 'Ehen? Make I finish this one first 😅',
  'treat-me': 'Hahaha, you wan finish my money? 😂',
  lol: '😂😂😂',
  thanks: "You're welcome 🙏",
  later: 'Later! ✌️',
}

type Talk = { kind: 'npc'; npc: WiseNpc } | { kind: 'player'; player: WisePlayer }

/**
 * Wise Gourmet: the 3D kiosk with sellers at the windows, customers, diners and the other
 * players in your group of 5 (live, like Sazza). Tap the window or a seller to open the menu
 * (ordering buys and eats in one go); tap anyone else to talk with quick lines.
 */
export function WiseInterior() {
  const router = useRouter()
  const { state, select, notifyToast } = useGame()
  const { shopItems, shopPlaceId, loadShop, buy, useItem, busy } = useEconomy()
  const [menuOpen, setMenuOpen] = useState(false)
  const [ordering, setOrdering] = useState<string | null>(null)
  const [talk, setTalk] = useState<Talk | null>(null)
  /** The window you're walking to (a seller), so the menu opens when you get there. */
  const [walkTo, setWalkTo] = useState<{ seller: WiseNpc; spot: [number, number] } | null>(null)
  const [bubbles, setBubbles] = useState<Record<string, string>>({})
  const bubbleTimers = useRef<Record<string, number>>({})
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

  // —— Your group of 5 (backend venue 'wise-gourmet', same crowd groups as Sazza) ——
  const [view, setView] = useState<VenueView | null>(null)
  const load = useCallback(async () => {
    const res = await fetchVenue(PLACE_ID)
    if (res.ok) setView(res)
    return res
  }, [])
  useEffect(() => {
    let stop = false
    void (async () => {
      const res = await load()
      if (stop || !res.ok || res.me.paid || !res.venue.open) return
      const entered = await enterVenue(PLACE_ID)
      if (!stop && entered.ok) void load()
    })()
    return () => {
      stop = true
    }
  }, [load])
  const inside = !!view?.me.paid
  const live = useClubLive(PLACE_ID, inside, state?.username)
  useEffect(() => {
    if (!inside) return
    const id = window.setInterval(() => void venueHeartbeat(PLACE_ID), 30_000)
    return () => {
      window.clearInterval(id)
      void leaveVenue(PLACE_ID)
    }
  }, [inside])

  const players = useMemo<WisePlayer[]>(() => {
    void live.roster
    const others = [...live.peers.current.values()].map((p) => ({ userId: p.userId, username: p.username, appearance: p.appearance }))
    const me: WisePlayer[] = state ? [{ userId: 'me', username: state.username ?? 'You', appearance: state.appearance, me: true }] : []
    return [...me, ...others]
  }, [live.roster, live.peers, state])

  const showBubble = useCallback((who: string, text: string) => {
    window.clearTimeout(bubbleTimers.current[who])
    setBubbles((b) => ({ ...b, [who]: text }))
    bubbleTimers.current[who] = window.setTimeout(() => {
      setBubbles((b) => {
        const next = { ...b }
        delete next[who]
        return next
      })
    }, BUBBLE_MS)
  }, [])
  useEffect(() => {
    const timers = bubbleTimers.current
    return () => Object.values(timers).forEach((t) => window.clearTimeout(t))
  }, [])

  // Lines from the others in the group: a bubble over the sender, and a toast when it's for you
  const seen = useRef(0)
  useEffect(() => {
    for (const s of live.said) {
      if (s.at <= seen.current) continue
      seen.current = s.at
      const text = quickLineText(s.line)
      const from = live.peers.current.get(s.from)
      // Lines I sent come back too; I already show those over my own head
      if (!text || !from) continue
      showBubble(s.from, text)
      // Peers never include me, so a line to someone not in the list is to me
      if (!live.peers.current.has(s.to)) notifyToast(`${from.username}: ${text}`, true)
    }
  }, [live.said, live.peers, showBubble, notifyToast])

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
        showBubble('me', `${item.emoji} Yum!`)
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
    setTalk(null)
    setMenuOpen(true)
  }

  /** Walk up to a window; the seller greets you and the menu opens when you arrive. */
  const goToWindow = (windowX: number) => {
    const seller = nearestWindow(windowX)
    setTalk(null)
    setMenuOpen(false)
    setWalkTo({ seller, spot: orderSpot(seller.x) })
  }

  const onArrive = () => {
    if (!walkTo) return
    showBubble(walkTo.seller.id, walkTo.seller.line)
    openMenu()
  }

  const onNpc = (npc: WiseNpc) => {
    // Sellers take your order
    if (npc.role === 'seller') {
      goToWindow(SELLERS.find((s) => s.id === npc.id)?.x ?? 0)
      return
    }
    setMenuOpen(false)
    showBubble(npc.id, npc.line)
    setTalk({ kind: 'npc', npc })
  }

  const onPlayer = (player: WisePlayer) => {
    setMenuOpen(false)
    setTalk({ kind: 'player', player })
  }

  const sendLine = (lineId: string) => {
    if (!talk) return
    const text = quickLineText(lineId)
    if (!text) return
    showBubble('me', text)
    if (talk.kind === 'player') {
      live.say(talk.player.userId, lineId)
    } else {
      const npcId = talk.npc.id
      window.setTimeout(() => showBubble(npcId, NPC_REPLY[lineId] ?? '😊'), 900)
    }
  }

  const groupCount = players.length

  return (
    <div className="absolute inset-0">
      <WiseScene
        players={players}
        bubbles={bubbles}
        onWindow={goToWindow}
        onNpc={onNpc}
        onPlayer={onPlayer}
        meTarget={walkTo?.spot ?? null}
        onArrive={onArrive}
      />

      {talk ? (
        <div className={styles.talk} role="dialog" aria-label={`Talk to ${talk.kind === 'npc' ? talk.npc.name : talk.player.username}`}>
          <div className={styles.talkHead}>
            <span className={styles.avatar} aria-hidden="true">
              {talk.kind === 'npc' ? '🙂' : '🧑🏾'}
            </span>
            <div className={styles.talkText}>
              <strong>{talk.kind === 'npc' ? talk.npc.name : talk.player.username}</strong>
              <span>{talk.kind === 'npc' ? talk.npc.line : 'In your group here at Wise'}</span>
            </div>
            <button type="button" className={styles.close} aria-label="Close" onClick={() => setTalk(null)}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <div className={styles.lines}>
            {QUICK_LINES.map((line) => (
              <button key={line.id} type="button" className={styles.line} onClick={() => sendLine(line.id)}>
                {line.text}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <PlaceSheet
          icon="🍽️"
          title="Wise Gourmet"
          subtitle={menuOpen ? 'What will you have?' : `Tap the window to order · ${groupCount} here`}
          buttons={[
            { icon: <UtensilsCrossed size={18} />, label: 'Order', onClick: () => setMenuOpen((o) => !o) },
            { icon: <MapIcon size={18} />, label: 'Map', onClick: leave },
          ]}
          expanded={menuOpen}
          onExpandedChange={setMenuOpen}
        >
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
        </PlaceSheet>
      )}
    </div>
  )
}
