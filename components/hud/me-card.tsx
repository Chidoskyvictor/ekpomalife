'use client'

import {
  criticalNeed,
  NEED_META,
  needTone,
  needValue,
  wellbeingScore,
  type NeedId,
} from '@/lib/game/needs'
import type { GameState } from '@/lib/game/types'
import { AvatarPortrait } from './avatar-portrait'
import { hapticTap } from './haptic'
import styles from './life-hud.module.css'

const TONE = {
  good: '#22c55e',
  warn: '#f59e0b',
  bad: '#ef4444',
} as const

/** Sims-style needs, two rows of three. */
const NEEDS_GRID: NeedId[] = ['hunger', 'energy', 'fun', 'social', 'hygiene', 'study']

/** Bottom-left HUD card: the player's avatar + their needs. Tap → profile. */
export function MeCard({ state, onOpen }: { state: GameState; onOpen: () => void }) {
  const well = wellbeingScore(state)
  const tone = needTone(well)
  const critical = criticalNeed(state)
  const initial = (state.characterName.trim()[0] || state.username[0] || 'E').toUpperCase()

  return (
    <div className={styles.meDock}>
      <button
        type="button"
        className={styles.meCard}
        onClick={() => {
          hapticTap()
          onOpen()
        }}
        aria-label="Open your profile"
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
            <AvatarPortrait
              appearance={state.appearance}
              fallbackColor={state.avatarColor}
              initial={initial}
              className={styles.avatarFace}
            />
          </span>
          {critical ? (
            <span className={styles.critBadge} aria-hidden="true">
              <img src={NEED_META[critical].emoji} alt="" width={14} height={14} />
            </span>
          ) : null}
        </span>

        <span className={styles.needsPanel} aria-label="Needs">
          {NEEDS_GRID.map((id) => {
            const value = Math.max(0, Math.min(100, Math.round(needValue(state, id))))
            return (
              <span key={id} className={styles.needCell} title={`${NEED_META[id].label} ${value}%`}>
                <img src={NEED_META[id].emoji} alt="" width={16} height={16} className={styles.needIcon} />
                <span className={styles.needTrack} aria-label={`${NEED_META[id].label} ${value}%`}>
                  <span className={styles.needFill} style={{ width: `${Math.max(value, 4)}%`, background: TONE[needTone(value)] }} />
                </span>
              </span>
            )
          })}
        </span>
      </button>
    </div>
  )
}
