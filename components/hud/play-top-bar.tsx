'use client'

import { LogOut, Plus, Users, Volume2, VolumeX } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/arc/button/button'
import { useGame } from '@/hooks/use-game'
import { usePlayerStats } from '@/hooks/use-player-stats'
import { formatNaira } from '@/lib/game/live'
import type { GameState, TimePeriod } from '@/lib/game/types'
import guestStyles from './guest-bar.module.css'
import styles from './play-hud.module.css'

const WEEKDAYS = ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'] as const

const CLOCK: Record<TimePeriod, { time: string; sky: 'sun' | 'moon' }> = {
  morning: { time: '8:12 AM', sky: 'sun' },
  afternoon: { time: '2:40 PM', sky: 'sun' },
  evening: { time: '6:18 PM', sky: 'moon' },
  night: { time: '11:26 PM', sky: 'moon' },
}

function calendarLabel(day: number) {
  const offset = Math.max(1, day) - 1
  const weekday = WEEKDAYS[offset % 7]
  const date = ((14 + offset) % 31) + 1
  return `${weekday} ${date}`
}

function compactCount(value: number) {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000
    return `${millions >= 10 ? Math.round(millions) : millions.toFixed(1).replace(/\.0$/, '')}m`
  }
  if (value >= 1_000) {
    const thousands = value / 1_000
    return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1).replace(/\.0$/, '')}k`
  }
  return String(value)
}

function moodFor(state: GameState) {
  const score = (state.energy + state.health) / 2
  if (score >= 70) return { emoji: '😊', label: 'Happy' }
  if (score >= 40) return { emoji: '😐', label: 'Okay' }
  return { emoji: '😫', label: 'Tired' }
}

export function PlayTopBar({ onShop }: { onShop: () => void }) {
  const { state, logOut } = useGame()
  const { online, visits } = usePlayerStats()
  const [muted, setMuted] = useState(false)
  if (!state) return null

  const mood = moodFor(state)
  const clock = CLOCK[state.period]

  return (
    <header className={guestStyles.bar}>
      <div className={styles.meta}>
        <span className={styles.chip}>
          {clock.sky === 'moon' ? (
            <img src="/emoji/crescent-moon.png" alt="" width={16} height={16} className={styles.sticker} />
          ) : (
            <span aria-hidden="true">☀️</span>
          )}
          <strong>
            {calendarLabel(state.day)}
            <span className={styles.clock}> · {clock.time}</span>
          </strong>
        </span>
        <span className={styles.chip} aria-label={`Mood ${mood.label}`}>
          <span aria-hidden="true">{mood.emoji}</span>
          {mood.label}
        </span>
        <span className={`${styles.chip} ${styles.wide}`} aria-label={`${visits.toLocaleString()} visits`}>
          <Users size={14} aria-hidden="true" />
          <strong>{compactCount(visits)}</strong>
        </span>
        <span className={styles.chip}>
          <span className={guestStyles.live} aria-hidden="true" />
          <strong>{compactCount(online)}</strong> online
        </span>
      </div>
      <div className={styles.right}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={muted ? 'Unmute' : 'Mute'}
          onClick={() => setMuted((current) => !current)}
        >
          {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
        </Button>
        <span className={styles.cash}>{formatNaira(state.cash)}</span>
        <Button type="button" size="sm" aria-label="Open campus shop" onClick={onShop}>
          <Plus aria-hidden="true" />
        </Button>
        <span className={styles.logout}>
          <Button type="button" variant="ghost" size="sm" aria-label="Log out" onClick={logOut}>
            <LogOut aria-hidden="true" />
          </Button>
        </span>
      </div>
    </header>
  )
}
