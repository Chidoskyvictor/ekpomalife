'use client'

import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { BodyPortal } from '@/components/ui/body-portal'
import { useLowPerf } from '@/hooks/use-low-perf'
import { usePhone } from '@/hooks/use-phone'
import { useGame } from '@/hooks/use-game'
import { PHONE_FREE_FOR_ALL, playerHasPhone } from '@/lib/game/phone-config'
import {
  HOSTEL_PLACE_IDS,
  PHONE_APPS,
  PHONE_MODE_KEY,
  type PhoneAppId,
  type PhonePromo,
} from '@/lib/game/phone'
import { AppFrame } from './app-frame'
import { BankApp } from './apps/bank-app'
import { CalendarApp } from './apps/calendar-app'
import { ComingSoonApp } from './apps/coming-soon'
import { GistApp } from './apps/gist-app'
import { JobsApp } from './apps/jobs-app'
import { MapApp } from './apps/map-app'
import { MarketApp } from './apps/market-app'
import { RideApp } from './apps/ride-app'
import { SettingsApp } from './apps/settings-app'
import { PhoneHome, phoneModeFromStorage } from './phone-home'
import { PhoneStatusBar } from './phone-status-bar'
import { WallpaperSkyline } from './wallpaper-skyline'
import styles from './phone.module.css'

const REAL_TO_GAME_MINUTES = 10

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
  const phoneApi = usePhone(open && canUsePhone, { poll: open })
  const [appId, setAppId] = useState<PhoneAppId | null>(null)
  const [offline, setOffline] = useState(false)
  const [ridePreset, setRidePreset] = useState<string | null>(null)
  const [night, setNight] = useState(false)
  const [tickLabel, setTickLabel] = useState<string | undefined>()
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
    void phoneApi.refresh()
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

  // Local clock tick between polls
  useEffect(() => {
    if (!open || !phoneApi.clock) {
      setTickLabel(undefined)
      return
    }
    const base = phoneApi.clock
    const started = Date.now()
    const id = window.setInterval(() => {
      const elapsedRealMin = (Date.now() - started) / 60_000
      const gameMin = Math.floor(elapsedRealMin * REAL_TO_GAME_MINUTES)
      const t = base.gameTime + gameMin
      const minsInDay = t % (24 * 60)
      const hour = Math.floor(minsInDay / 60)
      const minute = minsInDay % 60
      const ampm = hour >= 12 ? 'PM' : 'AM'
      const h12 = hour % 12 || 12
      setTickLabel(`${h12}:${String(minute).padStart(2, '0')} ${ampm}`)
    }, 1000)
    return () => window.clearInterval(id)
  }, [open, phoneApi.clock])

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
    const res = await phoneApi.open(id)
    if (!res.ok) {
      if (res.code === 'BATTERY_DEAD') {
        setAppId(null)
        notifyToast?.(res.error, false)
      }
      return
    }
    setOffline(!!res.offline)
  }

  const onPromo = (promo: PhonePromo) => {
    if (promo.action.type === 'app') {
      void openApp(promo.action.appId)
      return
    }
    select(promo.action.placeId)
    close()
  }

  const noPhone =
    !canUsePhone || (!PHONE_FREE_FOR_ALL && phoneApi.noPhone)
  const phone = phoneApi.phone
  const dead = phone && phone.battery <= 0
  const atHostel =
    !!phoneApi.location?.placeId &&
    (HOSTEL_PLACE_IDS as readonly string[]).includes(phoneApi.location.placeId)

  const cash = phoneApi.cash ?? state?.cash ?? 0

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
              className={`${styles.frame} ${lowPerf ? styles.lowPerf : ''}`}
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
              className={styles.closePill}
              onClick={close}
            >
              Close
            </button>
            <div className={styles.notch} aria-hidden="true" />
            <div className={styles.screen}>
              <h2 id={titleId} className="sr-only">
                Phone
              </h2>
              {phone && !noPhone ? (
                <>
                  <div className={styles.wallpaper}>
                    <WallpaperSkyline wallpaper={phone.wallpaper} night={night} />
                    <div className={styles.scrim} />
                  </div>
                  <div className={styles.content}>
                    {dead ? (
                      <div className={styles.deadScreen}>
                        <p className={styles.deadTitle}>Phone don die 🪫</p>
                        <p className={styles.listMeta} style={{ color: 'rgba(255,255,255,0.7)' }}>
                          Charge am for hostel
                        </p>
                        {atHostel ? (
                          <button
                            type="button"
                            className={styles.primaryPill}
                            onClick={() => void phoneApi.setCharge('start')}
                          >
                            Charge
                          </button>
                        ) : null}
                        <button type="button" className={styles.ghostPill} onClick={close}>
                          Close
                        </button>
                      </div>
                    ) : appId ? (
                      <AppFrame appId={appId} offline={offline} onHome={goHome}>
                        {appId === 'jobs' ? <JobsApp /> : null}
                        {appId === 'bank' ? <BankApp /> : null}
                        {appId === 'gist' ? <GistApp /> : null}
                        {appId === 'market' ? <MarketApp /> : null}
                        {appId === 'map' ? (
                          <MapApp
                            currentPlaceId={phoneApi.location?.placeId ?? state?.locationId ?? null}
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
                            idemKeyFor={phoneApi.idemKeyFor}
                            clearIdem={phoneApi.clearIdem}
                            onFindShift={() => void openApp('jobs')}
                            onSuccess={(message, nextCash) => {
                              notifyToast?.(message, true)
                              phoneApi.patchLocal({ cash: nextCash })
                              void phoneApi.refresh()
                              close()
                            }}
                          />
                        ) : null}
                        {appId === 'calendar' ? (
                          <CalendarApp items={phoneApi.notifications} />
                        ) : null}
                        {appId === 'settings' ? (
                          <SettingsApp
                            phone={phone}
                            cash={cash}
                            placeId={phoneApi.location?.placeId ?? null}
                            onWallpaper={async (id) => {
                              await phoneApi.setWall(id)
                            }}
                            onBuyData={async (id) => {
                              const res = await phoneApi.purchaseData(id)
                              if (!res.ok) return { ok: false, error: res.error }
                              return { ok: true, message: res.message }
                            }}
                            onCharge={async (action) => {
                              await phoneApi.setCharge(action)
                            }}
                          />
                        ) : null}
                        {['messages', 'portal', 'music', 'games'].includes(appId) ? (
                          <ComingSoonApp appId={appId} onHome={goHome} />
                        ) : null}
                      </AppFrame>
                    ) : (
                      <>
                        <PhoneStatusBar
                          clock={phoneApi.clock}
                          phone={phone}
                          localLabel={tickLabel}
                        />
                        <PhoneHome
                          phone={phone}
                          clock={phoneApi.clock}
                          location={phoneApi.location}
                          promos={phoneApi.promos}
                          cash={cash}
                          lowPerf={lowPerf}
                          onOpenApp={(id) => void openApp(id)}
                          onPromo={onPromo}
                        />
                      </>
                    )}
                  </div>
                </>
              ) : phoneApi.loading ? (
                <div className={styles.deadScreen} aria-busy="true">
                  <p className={styles.deadTitle}>Opening phone…</p>
                </div>
              ) : (
                <div className={styles.deadScreen}>
                  <p className={styles.deadTitle}>Could not load phone</p>
                  <button type="button" className={styles.ghostPill} onClick={() => void phoneApi.refresh()}>
                    Try again
                  </button>
                  <button type="button" className={styles.ghostPill} onClick={close}>
                    Close
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
        ) : null}
      </AnimatePresence>
    </BodyPortal>
  )
}
