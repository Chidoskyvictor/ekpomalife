'use client'

import {
  criticalNeed,
  NEED_META,
  needTone,
  wellbeingScore,
} from '@/lib/game/needs'
import type { GameState } from '@/lib/game/types'
import { hapticTap } from './haptic'
import styles from './life-hud.module.css'

const TONE = {
  good: '#22c55e',
  warn: '#eab308',
  bad: '#ef4444',
} as const

export function MeCard({ state, onOpen }: { state: GameState; onOpen: () => void }) {
  const well = wellbeingScore(state)
  const tone = needTone(well)
  const critical = criticalNeed(state)
  const initial = (state.characterName.trim()[0] || state.username[0] || 'E').toUpperCase()

  return (
    <div className={styles.meDock}>
      <button
        type="button"
        className={styles.avatarBtn}
        onClick={() => {
          hapticTap()
          onOpen()
        }}
        aria-label="Open profile and needs"
      >
        <span
          className={styles.avatarWrap}
          style={{
            ['--well' as string]: well,
            ['--ring-tone' as string]: TONE[tone],
          }}
        >
          <span className={styles.ring} aria-hidden="true" />
          <span className={styles.ringInner}>
            <span className={styles.avatarFace} style={{ background: state.avatarColor }} aria-hidden="true">
              {initial}
            </span>
          </span>
          {critical ? (
            <span className={styles.critBadge} aria-hidden="true">
              <img src={NEED_META[critical].emoji} alt="" width={14} height={14} />
            </span>
          ) : null}
        </span>
      </button>
    </div>
  )
}
