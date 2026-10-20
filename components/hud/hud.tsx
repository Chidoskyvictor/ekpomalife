'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { BuildingPanel } from '@/components/buildings/building-panel'
import { BuySheet } from '@/components/hud/buy-sheet'
import { ChangeDreamDialog } from '@/components/hud/change-dream-dialog'
import { ContextDock } from '@/components/hud/context-dock'
import { DreamCelebration } from '@/components/hud/dream-celebration'
import { EventDialog } from '@/components/hud/event-dialog'
import { HudToast } from '@/components/hud/hud-toast'
import { IslandToast } from '@/components/hud/island-toast'
import { LocationSheet } from '@/components/hud/location-sheet'
import { MeCard } from '@/components/hud/me-card'
import { PhoneDialog } from '@/components/hud/phone-dialog'
import { PlayNav, type PlayTab } from '@/components/hud/play-nav'
import { ProfileSheet } from '@/components/hud/profile-sheet'
import { SettingsSheet } from '@/components/hud/settings-sheet'
import { StatusBar } from '@/components/hud/status-bar'
import { TodaySheet } from '@/components/hud/today-sheet'
import { TopBar } from '@/components/hud/top-bar'
import { UpNext } from '@/components/hud/up-next'
import { WelcomeCard } from '@/components/hud/welcome-card'
import { useEconomy } from '@/hooks/use-economy'
import { useGame } from '@/hooks/use-game'
import { useLowPerf } from '@/hooks/use-low-perf'
import { usePhone } from '@/hooks/use-phone'
import { BATTERY } from '@/lib/game/phone'
import type { ContextAction, QuestPill } from '@/lib/game/quests'
import { cn } from '@/lib/utils'
import styles from './life-hud.module.css'

export function Hud() {
  const { isGuest, state, booting, bootError, retryBoot, selectedId, select, toast, logOut, act } =
    useGame()
  const guest = isGuest
  const { pay } = useEconomy()
  const phone = usePhone(!guest && Boolean(state))
  const lowPerf = useLowPerf()
  const [phoneOpen, setPhoneOpen] = useState(false)
  const [buyOpen, setBuyOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [todayOpen, setTodayOpen] = useState(false)
  const [dreamOpen, setDreamOpen] = useState(false)
  const [tab, setTab] = useState<PlayTab>('home')
  const router = useRouter()
  const unread = useMemo(() => {
    if (!state?.hasPhone) return 0
    return Math.min(9, state.feed.filter((entry) => entry.day === state.day).length)
  }, [state])
  const batteryLow = Boolean(state?.hasPhone && phone.battery <= BATTERY.low)

  const openShop = () => {
    if (!state) return
    setTab('buy')
    setBuyOpen(true)
    select('town-shop-1')
  }

  const onTab = (next: PlayTab) => {
    if (!state) return
    setTab(next)
    if (next === 'buy') {
      setBuyOpen(true)
      setPhoneOpen(false)
      return
    }
    if (next === 'phone') {
      select(null)
      setBuyOpen(false)
      setPhoneOpen(true)
      return
    }
    setBuyOpen(false)
    setPhoneOpen(false)
    if (next === 'home') select(null)
  }

  const onQuest = (pill: QuestPill) => {
    if (pill.locationId) select(pill.locationId)
  }

  const onContext = (action: ContextAction) => {
    if (!state) return
    if (action.action === 'shop') {
      openShop()
      return
    }
    if (action.action === 'phone') {
      setPhoneOpen(true)
      setTab('phone')
      return
    }
    if (action.action === 'rest') {
      act('rest')
      return
    }
    if (action.locationId) select(action.locationId)
  }

  const cashLoading = booting

  if (guest || !state) {
    return (
      <div className={cn(styles.root, lowPerf && styles.lowPerf)}>
        <div className={`${styles.safe} absolute inset-x-0 top-0`}>
          <TopBar />
        </div>
        <div className={styles.bottomDock}>
          {selectedId ? <LocationSheet /> : <WelcomeCard />}
        </div>
        <DreamCelebration />
        <EventDialog />
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
        <IslandToast state={state} />
        <HudToast toast={toast} />
      </div>

      <UpNext
        state={state}
        onSelect={onQuest}
        onOpenToday={() => setTodayOpen(true)}
        onPayRent={() => void pay()}
      />
      <MeCard state={state} onOpen={() => setProfileOpen(true)} />
      <div className={styles.mobileCorner}>
        <ContextDock
          state={state}
          onMore={() => setSettingsOpen(true)}
          onAction={onContext}
          onRoom={() => router.push('/room')}
        />
      </div>

      <div className={styles.bottomDock}>
        {selectedId ? <LocationSheet /> : null}
        <div className={styles.bottomRow}>
          <div className={styles.navSlot}>
            <PlayNav
              value={tab}
              onValueChange={onTab}
              badges={{ phone: unread }}
              phoneBatteryLow={batteryLow}
              onOpenRoom={() => router.push('/room')}
            />
          </div>
          <ContextDock
            state={state}
            onMore={() => setSettingsOpen(true)}
            onAction={onContext}
            onRoom={() => router.push('/room')}
          />
        </div>
      </div>

      <BuySheet
        open={buyOpen}
        onOpenChange={(open) => {
          setBuyOpen(open)
          if (!open && tab === 'buy') setTab('home')
        }}
      />
      <PhoneDialog
        open={phoneOpen}
        onOpenChange={(open) => {
          setPhoneOpen(open)
          if (!open && tab === 'phone') setTab('home')
        }}
      />
      <TodaySheet open={todayOpen} onOpenChange={setTodayOpen} state={state} onSelect={onQuest} />
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} onLogOut={logOut} />
      <ProfileSheet
        open={profileOpen}
        onOpenChange={setProfileOpen}
        state={state}
        onChangeDream={() => setDreamOpen(true)}
      />
      <ChangeDreamDialog open={dreamOpen} onOpenChange={setDreamOpen} />
      <DreamCelebration />
      <EventDialog />
      {selectedId ? <BuildingPanel /> : null}
    </div>
  )
}
