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
import { playerHasPhone } from '@/lib/game/phone-config'
import { pushNavigation } from '@/lib/navigation/safe-nav'
import { cn } from '@/lib/utils'
import styles from './life-hud.module.css'
import { HostelFinder } from '@/components/hostel/hostel-finder'
import { AdViewer } from './ad-viewer'
import { useChatUnread } from '@/hooks/use-chat-unread'

export function Hud() {
  const { isGuest, state, booting, bootError, retryBoot, select, toast, logOut } =
    useGame()
  const guest = isGuest
  const lowPerf = useLowPerf()
  const [phoneOpen, setPhoneOpen] = useState(false)
  const [buyOpen, setBuyOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [dreamOpen, setDreamOpen] = useState(false)
  const [tab, setTab] = useState<PlayTab>('map')
  const router = useRouter()
  const pathname = usePathname()
  const hasPhone = playerHasPhone(state?.hasPhone)
  // Hostel chat unread counts toward the phone badge too
  const chatUnread = useChatUnread(!guest && Boolean(state))
  const unread = useMemo(() => {
    if (!hasPhone) return 0
    const feed = state?.feed.filter((entry) => entry.day === state.day).length ?? 0
    return Math.min(9, feed + chatUnread)
  }, [hasPhone, state, chatUnread])

  useEffect(() => {
    if (pathname?.startsWith('/room')) {
      setTab('home')
    }
  }, [pathname])

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

  const openShop = () => {
    if (!state) return
    setTab('buy')
    setBuyOpen(true)
    select('town-shop-1')
  }

  const onTab = (next: PlayTab) => {
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
        {/* Home (My Room): find / join your real hostel */}
        {state && pathname?.startsWith('/room') ? (
          <div className={styles.topWrap}>
            <HostelFinder />
          </div>
        ) : null}
      </div>

      <ToastLayer toast={toast} state={state} />

      {state ? <MeCard state={state} onOpen={() => setProfileOpen(true)} /> : null}

      <div className={styles.bottomDock}>
        <div className={styles.bottomRow}>
          <div className={styles.navSlot}>
            <PlayNav
              value={tab}
              onValueChange={onTab}
              badges={{ phone: unread }}
            />
          </div>
        </div>
      </div>

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
