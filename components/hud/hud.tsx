'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { BuildingPanel } from '@/components/buildings/building-panel'
import { BuySheet } from '@/components/hud/buy-sheet'
import { ChangeDreamDialog } from '@/components/hud/change-dream-dialog'
import { DreamCelebration } from '@/components/hud/dream-celebration'
import { EventDialog } from '@/components/hud/event-dialog'
import { LocationSheet } from '@/components/hud/location-sheet'
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
import { usePhone } from '@/hooks/use-phone'
import { takeNavIntent } from '@/lib/game/nav-intent'
import { playerHasPhone } from '@/lib/game/phone-config'
import { BATTERY } from '@/lib/game/phone'
import { cn } from '@/lib/utils'
import styles from './life-hud.module.css'

export function Hud() {
  const { isGuest, state, booting, bootError, retryBoot, selectedId, select, toast, logOut } =
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
  const hasPhone = playerHasPhone(state?.hasPhone)
  const phone = usePhone(!guest && Boolean(state) && hasPhone, { poll: phoneOpen })
  const unread = useMemo(() => {
    if (!hasPhone) return 0
    return Math.min(9, state?.feed.filter((entry) => entry.day === state.day).length ?? 0)
  }, [hasPhone, state])
  const batteryLow = Boolean(hasPhone && phone.battery != null && phone.battery <= BATTERY.low)

  useEffect(() => {
    const intent = takeNavIntent()
    if (!intent || guest || !state) return
    if (intent === 'home') {
      router.push('/room')
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
    if (!state) return
    setTab(next)
    if (next === 'home') {
      router.push('/room')
      return
    }
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
    if (next === 'map') {
      setBuyOpen(false)
      setPhoneOpen(false)
      select(null)
    }
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
      </div>

      <ToastLayer toast={toast} state={state} />

      <MeCard state={state} onOpen={() => setProfileOpen(true)} />

      <div className={styles.bottomDock}>
        {selectedId ? <LocationSheet /> : null}
        <div className={styles.bottomRow}>
          <div className={styles.navSlot}>
            <PlayNav
              value={tab}
              onValueChange={onTab}
              badges={{ phone: unread }}
              phoneBatteryLow={batteryLow}
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
      <ChangeDreamDialog open={dreamOpen} onOpenChange={setDreamOpen} />
      <DreamCelebration />
      <EventDialog />
      {selectedId ? <BuildingPanel /> : null}
    </div>
  )
}
