'use client'

import NumberFlow from '@number-flow/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Plus, Tag, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { TextShimmer } from '@/components/arc/text-shimmer/text-shimmer'
import {
  calendarForDay,
  moodFromNeeds,
  PERIOD_CLOCK,
} from '@/lib/game/needs'
import { useShowMapLabels } from '@/lib/game/map-labels'
import { isNepaOutage } from '@/lib/game/quests'
import { useWatClock } from '@/lib/game/wat-clock'
import type { GameState } from '@/lib/game/types'
import styles from './life-hud.module.css'
import { SiteStats } from './site-stats'

const spring = { type: 'spring' as const, stiffness: 400, damping: 32 }

export function StatusBar({
  state,
  cashLoading,
  onShop,
  onRetry,
}: {
  /** Null while waiting on GET /game/state — chrome still paints. */
  state: GameState | null
  /** True while balance is still coming from the server. */
  cashLoading?: boolean
  onShop: () => void
  onRetry?: () => void
}) {
  const reduced = useReducedMotion() ?? false
  const [muted, setMuted] = useState(false)
  const [showLabels, setShowLabels] = useShowMapLabels()
  const prev = useRef(state?.cash ?? 0)
  const [delta, setDelta] = useState<number | null>(null)

  // Real WAT time, ticking on the device (dev: ?time=21:30 previews another hour)
  const wat = useWatClock()
  const period = wat.period
  const clock = PERIOD_CLOCK[period]
  const cal = calendarForDay(state?.day ?? 1)
  const timeLabel = wat.timeLabel
  const mood = state ? moodFromNeeds(state) : null
  const nepa = state ? isNepaOutage(state) : false
  const moodClass = !mood
    ? ''
    : mood.tone === 'good'
      ? styles.moodGood
      : mood.tone === 'warn'
        ? styles.moodWarn
        : styles.moodBad
  const waitingOnCash = Boolean(cashLoading) || !state
  const cashLabel =
    state != null ? `₦${Math.max(0, Math.round(state.cash)).toLocaleString()}` : '₦·····'

  useEffect(() => {
    try {
      setMuted(window.localStorage.getItem('ekpoma-life-muted') === '1')
    } catch {
      setMuted(false)
    }
  }, [])

  useEffect(() => {
    if (state == null) return
    const change = state.cash - prev.current
    prev.current = state.cash
    if (!change) return
    setDelta(change)
    const timer = window.setTimeout(() => setDelta(null), 1600)
    return () => window.clearTimeout(timer)
  }, [state])

  const toggleMute = () => {
    setMuted((current) => {
      const next = !current
      try {
        window.localStorage.setItem('ekpoma-life-muted', next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const onPlus = () => {
    // Stay visually active; top-up sheet only opens once life state is ready.
    if (!state || cashLoading) return
    onShop()
  }

  return (
    <div className={styles.statusStack}>
      <header className={styles.statusBar} aria-label="Status">
        <span className={styles.statusItem}>
          {clock.sky === 'moon' ? (
            <img src="/emoji/crescent-moon.png" alt="" width={16} height={16} className={styles.sticker} />
          ) : (
            <img src="/emoji/sunglasses.png" alt="" width={16} height={16} className={styles.sticker} />
          )}
          <strong>
            {cal.label}
            <span className={styles.statusMuted}> · {timeLabel}</span>
          </strong>
          {nepa ? (
            <span className={styles.nepaChip}>
              <span aria-hidden="true">⚡</span> Power cut
            </span>
          ) : null}
        </span>

        <span className={styles.statusDivider} aria-hidden="true" />

        <span
          className={`${styles.statusItem} ${moodClass}`}
          aria-label={mood ? `Mood ${mood.label}` : 'Mood loading'}
        >
          {mood ? mood.label : '—'}
        </span>

        <SiteStats variant="inline" />

        <div className={styles.statusRight}>
          <button
            type="button"
            className={styles.iconGhost}
            aria-label={showLabels ? 'Hide labels' : 'Show labels'}
            aria-pressed={showLabels}
            title={showLabels ? 'Hide labels' : 'Show labels'}
            onClick={() => setShowLabels(!showLabels)}
          >
            <Tag size={18} aria-hidden="true" style={showLabels ? undefined : { opacity: 0.45 }} />
          </button>
          <button
            type="button"
            className={`${styles.iconGhost} ${styles.deskOnly}`}
            aria-label={muted ? 'Unmute' : 'Mute'}
            onClick={toggleMute}
          >
            {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
          </button>

          <div className={styles.moneyChip}>
            <span className={styles.moneyWrap}>
              {onRetry && !cashLoading && !state ? (
                <button type="button" className={styles.cashRetry} onClick={onRetry}>
                  Retry
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
                    format={{ maximumFractionDigits: 0 }}
                    locales="en-NG"
                    className={styles.cashAmount}
                    style={{ fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}
                  />
                  <AnimatePresence>
                    {delta !== null ? (
                      <motion.span
                        key={`${delta}-${state.cash}`}
                        className={`${styles.cashDelta} ${delta > 0 ? styles.cashUp : styles.cashDown}`}
                        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduced ? { opacity: 0 } : { opacity: 0, y: -10 }}
                        transition={reduced ? { duration: 0 } : spring}
                      >
                        {delta > 0 ? '+' : '−'}₦{Math.abs(delta).toLocaleString()}
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </>
              ) : null}
            </span>

            <button type="button" className={styles.plusBtn} aria-label="Open top-up" onClick={onPlus}>
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <SiteStats variant="dock" />
    </div>
  )
}
