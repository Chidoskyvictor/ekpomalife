'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { BuySheet } from '@/components/hud/buy-sheet'
import { ChangeDreamDialog } from '@/components/hud/change-dream-dialog'
import { DreamCelebration } from '@/components/hud/dream-celebration'
import { EventDialog } from '@/components/hud/event-dialog'
import { MeCard } from '@/components/hud/me-card'
import { PhoneDialog } from '@/components/hud/phone-dialog'
import { PlayNav, type PlayTab } from '@/components/hud/play-nav'
import { ProfileSheet } from '@/components/hud/profile-sheet'
import { SettingsSheet } from '@/components/hud/settings-sheet'
import { StatusBar } from '@/components/hud/status-bar'
import { ToastLayer } from '@/components/hud/toast-layer'
import { TopBar } from '@/components/hud/top-bar'
import { WelcomeCard } from '@/components/hud/welcome-card'
import { useGame } from '@/hooks/use-game'
import { useLowPerf } from '@/hooks/use-low-perf'
import { takeNavIntent } from '@/lib/game/nav-intent'
import { buyUi, enterBuyMode, exitBuyMode, useBuyUi } from '@/lib/game/home-buy-store'
import { OPEN_CHAT_EVENT } from '@/lib/game/open-chat'
import { OPEN_GAMES_EVENT } from '@/lib/game/open-games'
import { OPEN_SPACES_EVENT, captureSpaceLink, requestOpenSpace, takeStoredSpaceLink } from '@/lib/game/open-spaces'
import { ChallengePopup, useIncomingChallenges } from '@/components/hud/challenge-popup'
import { ActionTiles } from '@/components/hud/action-tiles'
import { usePlaceSheetActive } from '@/components/hud/place-sheet'
import { playerHasPhone } from '@/lib/game/phone-config'
import { pushNavigation } from '@/lib/navigation/safe-nav'
import { cn } from '@/lib/utils'
import styles from './life-hud.module.css'
import { HostelFinder } from '@/components/hostel/hostel-finder'
import { AdViewer } from './ad-viewer'
import { useChatUnread } from '@/hooks/use-chat-unread'
import { TravelControl } from '@/components/travel/travel-control'
import travelStyles from '@/components/travel/travel.module.css'
import { openTravel } from '@/lib/game/trip'
import { STREET_AND_TRAVEL } from '@/lib/flags'

export function Hud() {
  const { isGuest, state, booting, bootError, retryBoot, select, selectedId, toast, logOut } =
    useGame()
  const guest = isGuest
  const lowPerf = useLowPerf()
  const [phoneOpen, setPhoneOpen] = useState(false)
  const [buyOpen, setBuyOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [dreamOpen, setDreamOpen] = useState(false)
  const [tab, setTab] = useState<PlayTab>('map')
  // Inside your own home the Buy tab is Buy mode (furniture); everywhere else it is the town shop
  const homeBuy = useBuyUi()
  const router = useRouter()
  const pathname = usePathname()
  const hasPhone = playerHasPhone(state?.hasPhone)
  // Hostel chat unread counts toward the phone badge too
  const chatUnread = useChatUnread(!guest && Boolean(state))
  // Snooker (and later other games) challenges waiting for an answer
  const challenges = useIncomingChallenges(!guest && Boolean(state) && hasPhone)
  // A place sheet (club…) is at the bottom: the avatar card sits above it
  const placeSheet = usePlaceSheetActive()
  const unread = useMemo(() => {
    if (!hasPhone) return 0
    const feed = state?.feed.filter((entry) => entry.day === state.day).length ?? 0
    return Math.min(9, feed + chatUnread + challenges.incoming.length)
  }, [hasPhone, state, chatUnread, challenges.incoming.length])

  useEffect(() => {
    if (pathname?.startsWith('/room')) {
      setTab('home')
    }
  }, [pathname])

  // Leaving Buy mode (Exit, or stepping outside) puts the nav back on Home
  useEffect(() => {
    if (!homeBuy.active && pathname === '/room') setTab((current) => (current === 'buy' && !buyOpen ? 'home' : current))
  }, [homeBuy.active, pathname, buyOpen])

  useEffect(() => {
    const intent = takeNavIntent()
    if (!intent || guest || !state) return
    if (intent === 'home') {
      pushNavigation(router, '/room')
      return
    }
    if (intent === 'map') {
      setTab('map')
      select(null)
      return
    }
    if (intent === 'buy') {
      setTab('buy')
      setBuyOpen(true)
      select('town-shop-1')
      return
    }
    if (intent === 'phone') {
      setTab('phone')
      setPhoneOpen(true)
    }
  }, [guest, router, select, state])

  // A shared Space link (?space=…): keep it through login, then open the phone on that room
  useEffect(() => {
    captureSpaceLink()
    if (guest || !state || !hasPhone) return
    const link = takeStoredSpaceLink()
    if (!link) return
    // After the listeners below are attached
    window.setTimeout(() => requestOpenSpace(link), 0)
  }, [guest, state, hasPhone])

  // "Message" / "Challenge" from outside the phone (club People list, profile, chat note) opens the phone
  useEffect(() => {
    const onOpenChat = () => {
      if (!state) return
      select(null)
      setBuyOpen(false)
      setTab('phone')
      setPhoneOpen(true)
    }
    window.addEventListener(OPEN_CHAT_EVENT, onOpenChat)
    window.addEventListener(OPEN_GAMES_EVENT, onOpenChat)
    window.addEventListener(OPEN_SPACES_EVENT, onOpenChat)
    return () => {
      window.removeEventListener(OPEN_SPACES_EVENT, onOpenChat)
      window.removeEventListener(OPEN_CHAT_EVENT, onOpenChat)
      window.removeEventListener(OPEN_GAMES_EVENT, onOpenChat)
    }
  }, [state, select])

  const openShop = () => {
    if (!state) return
    setTab('buy')
    setBuyOpen(true)
    select('town-shop-1')
  }

  const onTab = (next: PlayTab) => {
    if (next !== 'buy') exitBuyMode()
    if (next === 'buy' && pathname === '/room' && buyUi().available) {
      setBuyOpen(false)
      setPhoneOpen(false)
      setTab('buy')
      enterBuyMode()
      return
    }
    // Buy / Phone need the game loaded. Don't select them early — re-tapping a selected
    // tab doesn't fire again, so the phone would never open.
    if (!state && (next === 'buy' || next === 'phone')) return
    setTab(next)
    if (next === 'home') {
      setBuyOpen(false)
      setPhoneOpen(false)
      pushNavigation(router, '/room', pathname)
      return
    }
    if (next === 'map') {
      setBuyOpen(false)
      setPhoneOpen(false)
      if (state) select(null)
      pushNavigation(router, '/', pathname)
      return
    }
    if (!state) return
    if (next === 'buy') {
      setBuyOpen(true)
      setPhoneOpen(false)
      return
    }
    if (next === 'phone') {
      select(null)
      setBuyOpen(false)
      setPhoneOpen(true)
    }
  }

  const cashLoading = booting

  if (guest) {
    return (
      <div className={cn(styles.root, lowPerf && styles.lowPerf)}>
        <div className={`${styles.safe} absolute inset-x-0 top-0`}>
          <div className={styles.topWrap}>
            <TopBar />
          </div>
        </div>
        <div className={styles.bottomDock}>
          <WelcomeCard />
        </div>
        <DreamCelebration />
        <EventDialog />
        <AdViewer />
      </div>
    )
  }

  return (
    <div
      className={cn(styles.root, lowPerf && styles.lowPerf)}
      aria-busy={cashLoading || undefined}
    >
      <div className={`${styles.safe} absolute inset-x-0 top-0`}>
        <div className={styles.topWrap}>
          <StatusBar
            state={state}
            cashLoading={cashLoading}
            onShop={openShop}
            onRetry={bootError ? retryBoot : undefined}
          />
        </div>
        {/* What you're doing and what's next (Sims-style tiles): fills up, ✕ cancels */}
        <div className={styles.activityRow}>
          <ActionTiles />
        </div>
        {/* Home (My Room): find / join your real hostel — not while visiting someone (/room/[username]) */}
        {state && pathname === '/room' ? (
          <div className={styles.topWrap}>
            <HostelFinder />
          </div>
        ) : null}
      </div>

      <ToastLayer toast={toast} state={state} />
      <ChallengePopup incoming={challenges.incoming} hidden={phoneOpen} onDone={() => void challenges.reload()} />

      {state && !homeBuy.active ? <MeCard state={state} onOpen={() => setProfileOpen(true)} raised={placeSheet} /> : null}

      {/* Map: travel anywhere on campus (hidden while a place's sheet is up) */}
      {STREET_AND_TRAVEL && state && pathname === '/' && !selectedId && !placeSheet && !phoneOpen && !buyOpen ? (
        <div className={travelStyles.corner}>
          <button type="button" className={travelStyles.cornerBtn} onClick={openTravel}>
            🧭 Where to?
          </button>
        </div>
      ) : null}
      {STREET_AND_TRAVEL && state ? <TravelControl /> : null}

      {homeBuy.active ? null : <div className={styles.bottomDock}>
        <div className={styles.bottomRow}>
          <div className={styles.navSlot}>
            <PlayNav
              value={tab}
              onValueChange={onTab}
              badges={{ phone: unread }}
            />
          </div>
        </div>
      </div>}

      <BuySheet
        open={buyOpen}
        onOpenChange={(open) => {
          setBuyOpen(open)
          if (!open && tab === 'buy') setTab('map')
        }}
      />
      <PhoneDialog
        open={phoneOpen}
        onOpenChange={(open) => {
          setPhoneOpen(open)
          if (!open && tab === 'phone') setTab('map')
        }}
      />
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} onLogOut={logOut} />
      {state ? (
        <ProfileSheet
          open={profileOpen}
          onOpenChange={setProfileOpen}
          state={state}
          onChangeDream={() => setDreamOpen(true)}
          onOpenSettings={() => {
            setProfileOpen(false)
            setSettingsOpen(true)
          }}
        />
      ) : null}
      <ChangeDreamDialog open={dreamOpen} onOpenChange={setDreamOpen} />
      <DreamCelebration />
      <EventDialog />
      <AdViewer />
    </div>
  )
}
