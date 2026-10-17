'use client'

import { useMemo, useState } from 'react'
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
import type { ContextAction, QuestPill } from '@/lib/game/quests'
import { cn } from '@/lib/utils'
import styles from './life-hud.module.css'

export function Hud() {
  const { state, selectedId, select, toast, logOut, act } = useGame()
  const { pay } = useEconomy()
  const lowPerf = useLowPerf()
  const [phoneOpen, setPhoneOpen] = useState(false)
  const [buyOpen, setBuyOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [todayOpen, setTodayOpen] = useState(false)
  const [dreamOpen, setDreamOpen] = useState(false)
  const [tab, setTab] = useState<PlayTab>('home')
  const unread = useMemo(() => {
    if (!state?.hasPhone) return 0
    return Math.min(9, state.feed.filter((entry) => entry.day === state.day).length)
  }, [state])

  const openShop = () => {
    setTab('buy')
    setBuyOpen(true)
    select('town-shop-1')
  }

  const onTab = (next: PlayTab) => {
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

  if (!state) {
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
    <div className={cn(styles.root, lowPerf && styles.lowPerf)}>
      <div className={`${styles.safe} absolute inset-x-0 top-0`}>
        <div className={styles.topWrap}>
          <StatusBar state={state} onShop={openShop} />
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
        <ContextDock state={state} onMore={() => setSettingsOpen(true)} onAction={onContext} />
      </div>

      <div className={styles.bottomDock}>
        {selectedId ? <LocationSheet /> : null}
        <div className={styles.bottomRow}>
          <div className={styles.navSlot}>
            <PlayNav value={tab} onValueChange={onTab} badges={{ phone: unread }} />
          </div>
          <ContextDock state={state} onMore={() => setSettingsOpen(true)} onAction={onContext} />
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
    </div>
  )
}
