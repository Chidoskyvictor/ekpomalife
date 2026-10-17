'use client'

import NumberFlow from '@number-flow/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Plus, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { usePlayerStats } from '@/hooks/use-player-stats'
import {
  calendarForDay,
  compactCount,
  moodFromNeeds,
  PERIOD_CLOCK,
} from '@/lib/game/needs'
import { isNepaOutage } from '@/lib/game/quests'
import type { GameState } from '@/lib/game/types'
import styles from './life-hud.module.css'

const spring = { type: 'spring' as const, stiffness: 400, damping: 32 }

export function StatusBar({ state, onShop }: { state: GameState; onShop: () => void }) {
  const { online, visits } = usePlayerStats()
  const reduced = useReducedMotion() ?? false
  const [muted, setMuted] = useState(false)
  const prev = useRef(state.cash)
  const [delta, setDelta] = useState<number | null>(null)

  const clock = PERIOD_CLOCK[state.period]
  const cal = calendarForDay(state.day)
  const timeLabel = state.timeLabel ?? clock.time
  const mood = moodFromNeeds(state)
  const nepa = isNepaOutage(state)
  const moodClass =
    mood.tone === 'good' ? styles.moodGood : mood.tone === 'warn' ? styles.moodWarn : styles.moodBad

  useEffect(() => {
    try {
      setMuted(window.localStorage.getItem('ekpoma-life-muted') === '1')
    } catch {
      setMuted(false)
    }
  }, [])

  useEffect(() => {
    const change = state.cash - prev.current
    prev.current = state.cash
    if (!change) return
    setDelta(change)
    const timer = window.setTimeout(() => setDelta(null), 1600)
    return () => window.clearTimeout(timer)
  }, [state.cash])

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

  return (
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
            <span aria-hidden="true">⚡</span> NEPA don take light
          </span>
        ) : null}
      </span>

      <span className={styles.statusDivider} aria-hidden="true" />

      <span className={`${styles.statusItem} ${moodClass}`} aria-label={`Mood ${mood.label}`}>
        {mood.label}
      </span>

      <span className={`${styles.statusDivider} ${styles.deskOnly}`} aria-hidden="true" />

      <span className={`${styles.statusItem} ${styles.statusPlayers}`} aria-label={`${visits} players, ${online} online`}>
        <strong>{compactCount(visits)}</strong>
        <span className={styles.statusMuted}>players</span>
        <span className={styles.statusMuted}>·</span>
        <span className={styles.liveDot} aria-hidden="true" />
        <strong>{compactCount(online)}</strong>
        <span className={styles.statusMuted}>online</span>
      </span>

      <span className={styles.statusOnlineChip} aria-label={`${online} online`}>
        <span className={styles.liveDot} aria-hidden="true" />
        {compactCount(online)}
      </span>

      <div className={styles.statusRight}>
        <button
          type="button"
          className={styles.iconGhost}
          aria-label={muted ? 'Unmute' : 'Mute'}
          onClick={toggleMute}
        >
          {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
        </button>

        <span className={styles.moneyWrap}>
          <NumberFlow
            value={state.cash}
            prefix="₦"
            format={{ maximumFractionDigits: 0 }}
            locales="en-NG"
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
        </span>

        <button type="button" className={styles.plusBtn} aria-label="Open top-up" onClick={onShop}>
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}
