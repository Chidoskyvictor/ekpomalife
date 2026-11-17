'use client'

import { COMPACT_FROM, compactNaira } from '@/lib/game/live'
import { SOUND_EVENT } from '@/lib/audio/music'
import NumberFlow from '@number-flow/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Plus, Tag, Volume2, VolumeX, Target } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { TextShimmer } from '@/components/arc/text-shimmer/text-shimmer'
import {
  calendarForDay,
  moodFromNeeds,
  PERIOD_CLOCK,
} from '@/lib/game/needs'
import { useShowMapLabels } from '@/lib/game/map-labels'
import { useWatClock } from '@/lib/game/wat-clock'
import type { GameState } from '@/lib/game/types'
import hudStyles from './life-hud.module.css'
import styles from './status-bar.module.css'
import { SiteStats } from './site-stats'
import { usePathname } from 'next/navigation'

const spring = { type: 'spring' as const, stiffness: 400, damping: 32 }

export function StatusBar({
  state,
  cashLoading,
  onShop,
  onRetry,
  onMood,
  missions,
}: {
  /** Null while waiting on GET /game/state — chrome still paints. */
  state: GameState | null
  /** True while balance is still coming from the server. */
  cashLoading?: boolean
  onShop: () => void
  onRetry?: () => void
  /** Tapping the mood chip ("Sad") opens the Needs sheet. */
  onMood?: () => void
  /** Daily missions counter (🎯 1/3): opens the missions sheet. */
  missions?: { done: number; total: number; onOpen: () => void } | null
}) {
  const visiting = usePathname()?.startsWith('/room/') ?? false
  const reduced = useReducedMotion() ?? false
  const [muted, setMuted] = useState(false)
  const [showLabels, setShowLabels] = useShowMapLabels()
  // Last balance shown (null until the real one arrives, so loading it never reads as a gain)
  const prev = useRef<number | null>(cashLoading ? null : (state?.cash ?? null))
  const [delta, setDelta] = useState<number | null>(null)
  // The ±₦ float sits outside the scrolling bar (which clips it), placed over the money chip
  const stackRef = useRef<HTMLDivElement>(null)
  const chipRef = useRef<HTMLDivElement>(null)
  const [deltaPos, setDeltaPos] = useState<{ left: number; top: number; above: boolean } | null>(null)
  const autoRetried = useRef(false)

  // Real WAT time, ticking on the device (dev: ?time=21:30 previews another hour)
  const wat = useWatClock()
  const period = wat.period
  const clock = PERIOD_CLOCK[period]
  const cal = calendarForDay(state?.day ?? 1)
  const timeLabel = wat.timeLabel
  const mood = state ? moodFromNeeds(state) : null
  const moodClass = !mood
    ? ''
    : mood.tone === 'good'
      ? hudStyles.moodGood
      : mood.tone === 'warn'
        ? hudStyles.moodWarn
        : hudStyles.moodBad
  const waitingOnCash = Boolean(cashLoading) || !state
  const cashLabel =
    state != null ? compactNaira(state.cash) : '₦·····'

  useEffect(() => {
    try {
      setMuted(window.localStorage.getItem('ekpoma-life-muted') === '1')
    } catch {
      setMuted(false)
    }
  }, [])

  useEffect(() => {
    if (state == null || cashLoading) return
    if (prev.current == null) {
      prev.current = state.cash
      return
    }
    const change = state.cash - prev.current
    prev.current = state.cash
    if (!change) return
    setDelta(change)
    const stack = stackRef.current?.getBoundingClientRect()
    const chip = chipRef.current?.getBoundingClientRect()
    if (stack && chip) {
      // Above the chip when there is room on screen, else just under it; never over the digits
      const above = chip.top >= 22
      setDeltaPos({
        left: chip.left - stack.left + chip.width / 2,
        top: (above ? chip.top - 4 : chip.bottom + 4) - stack.top,
        above,
      })
    }
    const timer = window.setTimeout(() => setDelta(null), 1600)
    return () => window.clearTimeout(timer)
  }, [state, cashLoading])

  // Balance failed: retry once on its own after 3s (the Retry button stays for more tries)
  const loadFailed = Boolean(onRetry) && !cashLoading && !state
  useEffect(() => {
    if (state) autoRetried.current = false
    if (!loadFailed || autoRetried.current || !onRetry) return
    const timer = window.setTimeout(() => {
      autoRetried.current = true
      onRetry()
    }, 3000)
    return () => window.clearTimeout(timer)
  }, [loadFailed, onRetry, state])

  const toggleMute = () => {
    setMuted((current) => {
      const next = !current
      try {
        window.localStorage.setItem('ekpoma-life-muted', next ? '1' : '0')
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new Event(SOUND_EVENT))
      return next
    })
  }

  const onPlus = () => {
    // Stay visually active; top-up sheet only opens once life state is ready.
    if (!state || cashLoading) return
    onShop()
  }

  return (
    <div className={hudStyles.statusStack} ref={stackRef}>
      <header className={hudStyles.statusBar} aria-label="Status">
        <span className={hudStyles.statusItem}>
          {clock.sky === 'moon' ? (
            <img src="/emoji/crescent-moon.png" alt="Night" width={16} height={16} className={hudStyles.sticker} />
          ) : (
            <img src="/emoji/sunglasses.png" alt="Daytime" width={16} height={16} className={hudStyles.sticker} />
          )}
          <strong>
            {cal.label}
            <span className={hudStyles.statusMuted}> · {timeLabel}</span>
          </strong>
        </span>

        <span className={hudStyles.statusDivider} aria-hidden="true" />

        {mood && onMood ? (
          <button
            type="button"
            className={`${hudStyles.statusItem} ${hudStyles.moodBtn} ${moodClass}`}
            aria-label={`Mood ${mood.label}. Open needs`}
            onClick={onMood}
          >
            {mood.label}
          </button>
        ) : (
          <span
            className={`${hudStyles.statusItem} ${moodClass}`}
            aria-label={mood ? `Mood ${mood.label}` : 'Mood loading'}
          >
            {mood ? mood.label : '—'}
          </span>
        )}

        {missions ? (
          <button
            type="button"
            className={`${hudStyles.statusItem} ${hudStyles.moodBtn}`}
            aria-label={`Today's missions: ${missions.done} of ${missions.total} done`}
            onClick={missions.onOpen}
          >
            <Target size={12} aria-hidden="true" /> {missions.done}/{missions.total}
          </button>
        ) : null}

        <SiteStats variant="inline" />

        <div className={hudStyles.statusRight}>
          {/* Desktop only: on phones these live in the round settings button under the bar */}
          <button
            type="button"
            className={`${hudStyles.iconGhost} ${hudStyles.deskOnly}`}
            aria-label={showLabels ? 'Hide labels' : 'Show labels'}
            aria-pressed={showLabels}
            title={showLabels ? 'Hide labels' : 'Show labels'}
            onClick={() => setShowLabels(!showLabels)}
          >
            <Tag size={18} aria-hidden="true" style={showLabels ? undefined : { opacity: 0.45 }} />
          </button>
          <button
            type="button"
            className={`${hudStyles.iconGhost} ${hudStyles.deskOnly}`}
            aria-label={muted ? 'Unmute' : 'Mute'}
            onClick={toggleMute}
          >
            {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
          </button>

          <div className={styles.moneyChip} ref={chipRef}>
            <span className={styles.moneyWrap}>
              {loadFailed ? (
                <button type="button" className={styles.cashRetry} onClick={onRetry}>
                  Couldn&apos;t load ₦ · Retry
                </button>
              ) : waitingOnCash ? (
                <span aria-label={state ? 'Confirming balance' : 'Loading balance'}>
                  <TextShimmer active className={styles.cashShimmer}>
                    {cashLabel}
                  </TextShimmer>
                </span>
              ) : state ? (
                <>
                  <NumberFlow
                    value={state.cash}
                    prefix="₦"
                    format={
                      state.cash >= COMPACT_FROM
                        ? { notation: 'compact', maximumFractionDigits: 1 }
                        : { maximumFractionDigits: 0 }
                    }
                    locales="en-NG"
                    className={styles.cashAmount}
                    style={{ fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}
                  />
                </>
              ) : null}
            </span>

            <button type="button" className={styles.plusBtn} aria-label="Open top-up" onClick={onPlus}>
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {delta !== null && state && deltaPos ? (
          <motion.span
            key={`${delta}-${state.cash}`}
            className={`${hudStyles.cashDelta} ${delta > 0 ? hudStyles.cashUp : hudStyles.cashDown}`}
            style={{
              left: deltaPos.left,
              top: deltaPos.top,
              translate: deltaPos.above ? '-50% -100%' : '-50% 0',
            }}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: deltaPos.above ? 6 : -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: deltaPos.above ? -10 : 10 }}
            transition={reduced ? { duration: 0 } : spring}
          >
            {delta > 0 ? '+' : '−'}{compactNaira(Math.abs(delta))}
          </motion.span>
        ) : null}
      </AnimatePresence>

      {/* Hidden while visiting someone: the "Visiting" banner sits in the same spot */}
      {visiting ? null : <SiteStats variant="dock" />}
    </div>
  )
}
