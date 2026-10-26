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

/**
 * Bottom-left HUD card: the player's avatar + their needs. Tap → profile.
 * Phones show the avatar and just the need that wants attention most ("⚡ 24% +1");
 * wider screens show all six bars. `raised` lifts it above a place sheet (club…).
 */
export function MeCard({ state, onOpen, raised = false }: { state: GameState; onOpen: () => void; raised?: boolean }) {
  const well = wellbeingScore(state)
  const tone = needTone(well)
  const critical = criticalNeed(state)
  const initial = (state.characterName.trim()[0] || state.username[0] || 'E').toUpperCase()
  const values = NEEDS_GRID.map((id) => ({ id, value: Math.max(0, Math.min(100, Math.round(needValue(state, id)))) }))
  const sorted = [...values].sort((a, b) => a.value - b.value)
  const lowest = sorted[0]!
  // Other needs that also want attention (below "good")
  const alsoLow = sorted.slice(1).filter((n) => needTone(n.value) !== 'good').length

  return (
    <div className={`${styles.meDock} ${raised ? styles.meDockRaised : ''}`}>
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
          {values.map(({ id, value }) => (
            <span key={id} className={styles.needCell} title={`${NEED_META[id].label} ${value}%`}>
              <img src={NEED_META[id].emoji} alt="" width={16} height={16} className={styles.needIcon} />
              <span className={styles.needTrack} aria-label={`${NEED_META[id].label} ${value}%`}>
                <span className={styles.needFill} style={{ width: `${Math.max(value, 4)}%`, background: TONE[needTone(value)] }} />
              </span>
            </span>
          ))}
        </span>

        {/* Phones: only the need that matters most right now */}
        <span className={styles.needChip} aria-label={`${NEED_META[lowest.id].label} ${lowest.value}%${alsoLow ? `, ${alsoLow} more low` : ''}`}>
          <img src={NEED_META[lowest.id].emoji} alt="" width={16} height={16} className={styles.needIcon} />
          <strong style={{ color: TONE[needTone(lowest.value)] }}>{lowest.value}%</strong>
          {alsoLow ? <span className={styles.needMore}>+{alsoLow}</span> : null}
        </span>
      </button>
    </div>
  )
}
