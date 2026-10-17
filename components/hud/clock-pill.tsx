'use client'

import { calendarForDay, PERIOD_CLOCK } from '@/lib/game/needs'
import type { GameState } from '@/lib/game/types'
import styles from './life-hud.module.css'

export function ClockPill({ state }: { state: GameState }) {
  const clock = PERIOD_CLOCK[state.period]
  const cal = calendarForDay(state.day)
  const timeLabel = state.timeLabel ?? clock.time
  const eventLabel = cal.rentDay ? 'Rent day' : cal.weekend ? 'Weekend' : null

  return (
    <div
      className={`${styles.panel} ${styles.clockPill}`}
      data-glow={cal.weekend || cal.rentDay ? 'true' : 'false'}
      style={{ ['--day' as string]: clock.dayProgress }}
      aria-label={`Day ${state.day}, ${cal.label}, ${timeLabel}`}
    >
      <div className={styles.clockRow}>
        {clock.sky === 'moon' ? (
          <img src="/emoji/crescent-moon.png" alt="" width={16} height={16} className={styles.sticker} />
        ) : (
          <img src="/emoji/fire.png" alt="" width={16} height={16} className={styles.sticker} />
        )}
        <strong>
          {cal.label}
          <span className={styles.clockSub}> · {timeLabel}</span>
        </strong>
      </div>
      {eventLabel ? (
        <div className={styles.clockRow}>
          <img src="/emoji/house.png" alt="" width={14} height={14} className={styles.sticker} />
          <span className={styles.clockSub}>
            {cal.weekday} · {eventLabel}
          </span>
        </div>
      ) : null}
      <div className={styles.dayTrack} aria-hidden="true">
        <div className={styles.dayFill} />
      </div>
    </div>
  )
}
