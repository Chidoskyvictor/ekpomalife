'use client'

import { MoreHorizontal } from 'lucide-react'
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
import { UpNext } from '@/components/hud/up-next'
import { useEconomy } from '@/hooks/use-economy'
import { useGame } from '@/hooks/use-game'
import { useLowPerf } from '@/hooks/use-low-perf'
import type { ContextAction, QuestPill } from '@/lib/game/quests'
import { cn } from '@/lib/utils'
import styles from './life-hud.module.css'

export function Hud() {
  const { state, booting, bootError, retryBoot, selectedId, select, toast, logOut, act } = useGame()
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

  // Provisional local shell may paint early; shimmer until server confirms (or error).
  const cashLoading = booting

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
        {state ? <IslandToast state={state} /> : null}
        <HudToast toast={toast} />
      </div>

      {state ? (
        <>
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
        </>
      ) : null}

      <div className={styles.bottomDock}>
        {state && selectedId ? <LocationSheet /> : null}
        <div className={styles.bottomRow}>
          <div className={styles.navSlot}>
            <PlayNav value={tab} onValueChange={onTab} badges={{ phone: unread }} />
          </div>
          {state ? (
            <ContextDock state={state} onMore={() => setSettingsOpen(true)} onAction={onContext} />
          ) : (
            <div className={styles.cornerActions}>
              <button
                type="button"
                className={styles.moreBtn}
                aria-label="More"
                onClick={() => setSettingsOpen(true)}
              >
                <MoreHorizontal size={18} aria-hidden="true" />
              </button>
            </div>
          )}
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
      {state ? (
        <TodaySheet open={todayOpen} onOpenChange={setTodayOpen} state={state} onSelect={onQuest} />
      ) : null}
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} onLogOut={logOut} />
      {state ? (
        <ProfileSheet
          open={profileOpen}
          onOpenChange={setProfileOpen}
          state={state}
          onChangeDream={() => setDreamOpen(true)}
        />
      ) : null}
      <ChangeDreamDialog open={dreamOpen} onOpenChange={setDreamOpen} />
      <DreamCelebration />
      <EventDialog />
    </div>
  )
}
