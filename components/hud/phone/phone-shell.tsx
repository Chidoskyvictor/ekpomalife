'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { BodyPortal } from '@/components/ui/body-portal'
import { useLowPerf } from '@/hooks/use-low-perf'
import { usePhone } from '@/hooks/use-phone'
import { useGame } from '@/hooks/use-game'
import { PHONE_FREE_FOR_ALL } from '@/lib/flags'
import { playerHasPhone } from '@/lib/game/phone-config'
import { calendarForDay } from '@/lib/game/needs'
import {
  PHONE_APPS,
  PHONE_MODE_KEY,
  type PhoneAppId,
  type PhoneClock,
  type PhonePromo,
  type PhoneState,
} from '@/lib/game/phone'
import { AppFrame } from './app-frame'
import { BankApp } from './apps/bank-app'
import { CalendarApp } from './apps/calendar-app'
import { ComingSoonApp } from './apps/coming-soon'
import { GistApp } from './apps/gist-app'
import { JobsApp } from './apps/jobs-app'
import { MessagesApp } from './apps/messages-app'
import { useChatUnread } from '@/hooks/use-chat-unread'
import { MapApp } from './apps/map-app'
import { MarketApp } from './apps/market-app'
import { RideApp } from './apps/ride-app'
import { OPEN_CHAT_EVENT } from '@/lib/game/open-chat'
import { OPEN_GAMES_EVENT } from '@/lib/game/open-games'
import { useLiveSpaces } from '@/hooks/use-live-spaces'
import { OPEN_SPACES_EVENT, hasPendingSpace, requestOpenSpace } from '@/lib/game/open-spaces'
import { SettingsApp } from './apps/settings-app'
import { ProfileApp } from './apps/profile-app'
import { InvestApp } from './apps/invest-app'
import { EtaApp } from './apps/eta-app'
import { GamesApp } from './apps/games-app'
import { SpacesApp } from './apps/spaces-app'
import { PhoneHome, phoneModeFromStorage } from './phone-home'
import { PhoneStatusBar } from './phone-status-bar'
import { WallpaperSkyline } from './wallpaper-skyline'
import styles from './phone.module.css'

const FULL_WEEKDAY: Record<string, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
}

/** Same calendar as the HUD ("Thu 15" → "Thursday 15"). */
function phoneDateLabel(day: number) {
  const cal = calendarForDay(day)
  return `${FULL_WEEKDAY[cal.weekday] ?? cal.weekday} ${cal.date}`
}

/** Shown the instant the phone opens, until GET /phone answers (full battery, default wallpaper). */
const PLACEHOLDER_PHONE: PhoneState = {
  battery: 100,
  charging: false,
  dataMb: 1,
  wallpaper: 'aau-dusk',
  unread: {},
  newApps: [],
}

export function PhoneShell({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { state, select, notifyToast } = useGame()
  const lowPerf = useLowPerf()
  const reduced = useReducedMotion() ?? false
  const canUsePhone = playerHasPhone(state?.hasPhone)
  const mobileApi = usePhone(open && canUsePhone, { poll: open })
  // Never a loading/error screen: render the home screen right away, live data fills in
  const deviceState = mobileApi.device ?? (canUsePhone ? PLACEHOLDER_PHONE : null)
  // Until the phone answers, read the time from the game state the HUD already has
  const fallbackClock = useMemo<PhoneClock | null>(() => {
    const label = state?.timeLabel
    const match = label?.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
    if (!state || !label || !match) return null
    const hour = (Number(match[1]) % 12) + (match[3]!.toUpperCase() === 'PM' ? 12 : 0)
    return {
      gameTime: state.gameTime ?? 0,
      day: state.day,
      hour,
      minute: Number(match[2]),
      period: state.period,
      label,
    }
  }, [state])
  // Same time as the HUD status bar (game state); the phone's own clock is only a fallback
  const phoneClock = fallbackClock ?? mobileApi.clock
  const lacksPhone =
    !canUsePhone || (!PHONE_FREE_FOR_ALL && mobileApi.missingDevice)
  const cash = mobileApi.cash ?? state?.cash ?? 0
  // Hostel chat unread shows on the Messages icon
  const chatUnread = useChatUnread(open && canUsePhone)
  const homePhone = useMemo(
    () =>
      deviceState && chatUnread > 0
        ? { ...deviceState, unread: { ...deviceState.unread, messages: chatUnread } }
        : null,
    [deviceState, chatUnread],
  )

  const [appId, setAppId] = useState<PhoneAppId | null>(null)
  // "Live now" strip on the home screen only
  const liveSpaces = useLiveSpaces(open && canUsePhone && !appId)
  const [offline, setOffline] = useState(false)
  const [ridePreset, setRidePreset] = useState<string | null>(null)
  const [night, setNight] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) {
      setAppId(null)
      setOffline(false)
      setRidePreset(null)
      return
    }
    setNight(phoneModeFromStorage() === 'night')
    closeRef.current?.focus()
    void mobileApi.refresh()
    // A shared Space link opened the phone: land in Spaces, not on the home screen
    if (hasPendingSpace()) void openApp('spaces')
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const onStorage = () => setNight(phoneModeFromStorage() === 'night')
    window.addEventListener('storage', onStorage)
    const id = window.setInterval(() => {
      try {
        setNight(localStorage.getItem(PHONE_MODE_KEY) === 'night')
      } catch {
        /* ignore */
      }
    }, 1000)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.clearInterval(id)
    }
  }, [open])

  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  const goHome = useCallback(() => {
    setAppId(null)
    setOffline(false)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (appId) {
        e.preventDefault()
        goHome()
        return
      }
      e.preventDefault()
      close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, appId, close, goHome])

  const openApp = async (id: PhoneAppId) => {
    const meta = PHONE_APPS.find((a) => a.id === id)
    setAppId(id)
    if (meta?.status === 'soon') return
    const res = await mobileApi.open(id)
    if (!res.ok) {
      if (res.code === 'BATTERY_DEAD') {
        setAppId(null)
        notifyToast?.(res.error, false)
      }
      return
    }
    setOffline(!!res.offline)
  }

  useEffect(() => {
    const onOpenChat = () => void openApp('messages')
    const onOpenGames = () => {
      if (appId !== 'games') void openApp('games')
    }
    window.addEventListener(OPEN_CHAT_EVENT, onOpenChat)
    const onOpenSpaces = () => {
      if (appId !== 'spaces') void openApp('spaces')
    }
    window.addEventListener(OPEN_GAMES_EVENT, onOpenGames)
    window.addEventListener(OPEN_SPACES_EVENT, onOpenSpaces)
    return () => {
      window.removeEventListener(OPEN_SPACES_EVENT, onOpenSpaces)
      window.removeEventListener(OPEN_CHAT_EVENT, onOpenChat)
      window.removeEventListener(OPEN_GAMES_EVENT, onOpenGames)
    }
  })

  const onPromo = (promo: PhonePromo) => {
    if (promo.action.type === 'app') {
      void openApp(promo.action.appId)
      return
    }
    select(promo.action.placeId)
    close()
  }

  return (
    <BodyPortal>
      <AnimatePresence>
        {open ? (
          <motion.div
            className={`${styles.overlay} ${lowPerf ? styles.overlayLow : ''}`}
            initial={reduced || lowPerf ? { opacity: 0 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced || lowPerf ? 0.12 : 0.2 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={close}
          >
            <motion.div
              className={styles.device}
              onClick={(event) => event.stopPropagation()}
            initial={
              reduced || lowPerf
                ? { opacity: 0 }
                : { y: 40, scale: 0.96, opacity: 0 }
            }
            animate={reduced || lowPerf ? { opacity: 1 } : { y: 0, scale: 1, opacity: 1 }}
            exit={reduced || lowPerf ? { opacity: 0 } : { y: 48, scale: 0.96, opacity: 0 }}
            transition={
              reduced || lowPerf
                ? { duration: 0.12 }
                : { type: 'spring', stiffness: 380, damping: 32 }
            }
          >
            <button
              ref={closeRef}
              type="button"
              className={`${styles.closePill} ${lowPerf ? styles.closePillLow : ''}`}
              onClick={close}
            >
              <span aria-hidden="true">✕</span> Close
            </button>
            <div className={`${styles.frame} ${lowPerf ? styles.lowPerf : ''}`}>
            <div className={styles.screen}>
              <div className={styles.island} aria-hidden="true" />
              <h2 id={titleId} className="sr-only">
                Phone
              </h2>
              {deviceState && !lacksPhone ? (
                <>
                  <div className={styles.wallpaper}>
                    <WallpaperSkyline wallpaper={deviceState.wallpaper} night={night} />
                    <div className={styles.scrim} />
                  </div>
                  <div className={styles.content}>
                    <PhoneStatusBar clock={phoneClock} phone={deviceState} onApp={Boolean(appId)} />
                    {appId ? (
                      <AppFrame appId={appId} offline={offline} onHome={goHome} bare={appId === 'messages' || appId === 'games' || appId === 'spaces'}>
                        {appId === 'jobs' ? <JobsApp /> : null}
                        {appId === 'bank' ? <BankApp /> : null}
                        {appId === 'gist' ? <GistApp /> : null}
                        {appId === 'market' ? <MarketApp /> : null}
                        {appId === 'map' ? (
                          <MapApp
                            currentPlaceId={mobileApi.location?.placeId ?? state?.locationId ?? null}
                            onGo={(id) => {
                              select(id)
                              close()
                            }}
                            onRide={(id) => {
                              setRidePreset(id)
                              void openApp('ride')
                            }}
                          />
                        ) : null}
                        {appId === 'ride' ? (
                          <RideApp
                            cash={cash}
                            presetTo={ridePreset}
                            idemKeyFor={mobileApi.idemKeyFor}
                            clearIdem={mobileApi.clearIdem}
                            onFindShift={() => void openApp('jobs')}
                            onSuccess={(message, nextCash) => {
                              notifyToast?.(message, true)
                              mobileApi.patchLocal({ cash: nextCash })
                              void mobileApi.refresh()
                              close()
                            }}
                          />
                        ) : null}
                        {appId === 'calendar' ? (
                          <CalendarApp items={mobileApi.notifications} />
                        ) : null}
                        {appId === 'profile' ? <ProfileApp /> : null}
                        {appId === 'invest' ? <InvestApp /> : null}
                        {appId === 'eta' ? <EtaApp /> : null}
                        {appId === 'games' ? <GamesApp onHome={goHome} /> : null}
                        {appId === 'spaces' ? (
                          <SpacesApp currentPlaceId={mobileApi.location?.placeId ?? state?.locationId ?? null} onHome={goHome} />
                        ) : null}
                        {appId === 'settings' ? (
                          <SettingsApp
                            phone={deviceState}
                            cash={cash}
                            placeId={mobileApi.location?.placeId ?? null}
                            onWallpaper={async (id) => {
                              await mobileApi.setWall(id)
                            }}
                            onBuyData={async (id) => {
                              const res = await mobileApi.purchaseData(id)
                              if (!res.ok) return { ok: false, error: res.error }
                              return { ok: true, message: res.message }
                            }}
                            onCharge={async (action) => {
                              await mobileApi.setCharge(action)
                            }}
                          />
                        ) : null}
                        {appId === 'messages' ? (
                          <MessagesApp
                            onHome={goHome}
                            notifications={mobileApi.notifications}
                            onOpenApp={(id) => void openApp(id)}
                          />
                        ) : null}
                        {['portal', 'music', 'games'].includes(appId) ? (
                          <ComingSoonApp appId={appId} onHome={goHome} />
                        ) : null}
                      </AppFrame>
                    ) : (
                      <PhoneHome
                        phone={homePhone ?? deviceState}
                        clock={phoneClock}
                        dateLabel={state ? phoneDateLabel(state.day) : null}
                        promos={mobileApi.promos}
                        lowPerf={lowPerf}
                        liveSpaces={liveSpaces}
                        onOpenSpace={(spaceId) => requestOpenSpace({ spaceId })}
                        onOpenApp={(id) => void openApp(id)}
                        onPromo={onPromo}
                      />
                    )}
                  </div>
                </>
              ) : (
                <div className={styles.deadScreen}>
                  <p className={styles.deadTitle}>You don&apos;t have a phone yet</p>
                  <button type="button" className={styles.ghostPill} onClick={close}>
                    Close
                  </button>
                </div>
              )}
            </div>
            </div>
          </motion.div>
        </motion.div>
        ) : null}
      </AnimatePresence>
    </BodyPortal>
  )
}
