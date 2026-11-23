'use client'

import { ArrowLeft, Lock } from 'lucide-react'
import { hapticTap } from '@/components/hud/haptic'
import { EFFECT, LEVEL_RANK, MAX_LEVEL, PART_DEFS, RANKS, rankFor, rankProgress, upgradeBlock, upgradeNote, upgradePrice, type Part, type Upgrades } from '@/lib/game/race-rewards'
import styles from './upgrade-panel.module.css'

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`
const short = (n: number) => (n >= 1_000_000 ? `₦${+(n / 1_000_000).toFixed(1)}m` : n >= 1000 ? `₦${Math.round(n / 1000)}k` : `₦${n}`)

/** What a level of a part adds, in words a player reads at a glance. */
function effectText(part: Part, level: number) {
  const pct = (n: number) => `+${Math.round(n * 100)}%`
  if (part === 'engine') return `${pct(EFFECT.engineTop * level)} top speed · ${pct(EFFECT.engineGas * level)} pull`
  if (part === 'tyres') return `${pct(EFFECT.tyreGrip * level)} grip in corners`
  return `${pct(EFFECT.brake * level)} braking power`
}

/**
 * Upgrades for one car: engine, tyres and brakes, three levels each. Money pays for them and your
 * racer rank unlocks the higher levels. They really change how the car drives, and every race shows
 * each car's fitted levels on the grid, so races stay fair.
 */
export function UpgradePanel({
  carName,
  carPrice,
  up,
  xp,
  cash,
  busy,
  onBuy,
  onBack,
}: {
  carName: string
  carPrice: number
  up: Upgrades
  xp: number
  cash: number
  busy: boolean
  onBuy: (part: Part) => void
  onBack: () => void
}) {
  const prog = rankProgress(xp)
  return (
    <div className={styles.panel} role="group" aria-label={`Upgrades for ${carName}`}>
      <div className={styles.head}>
        <button type="button" className={styles.back} aria-label="Back to the garage" onClick={onBack}>
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <div>
          <strong>Upgrades</strong>
          <small>{upgradeNote(up) ?? 'Stock'} · fitted levels show on every grid</small>
        </div>
      </div>

      <div className={styles.rank}>
        <span aria-hidden="true">{prog.rank.emoji}</span>
        <div>
          <b>{prog.rank.name}</b>
          <small>{prog.next ? `${prog.toGo} XP to ${prog.next.name}` : 'Top rank'}</small>
          <i className={styles.bar} aria-hidden="true">
            <u style={{ width: `${Math.round(prog.fraction * 100)}%` }} />
          </i>
        </div>
      </div>

      <ul className={styles.parts}>
        {PART_DEFS.map((def) => {
          const have = up[def.id]
          const next = have + 1
          const block = upgradeBlock(have, next, xp)
          const price = block === 'max' ? 0 : upgradePrice(def.id, next, carPrice)
          const needRank = block === 'max' ? null : RANKS[LEVEL_RANK[next - 1]!]!
          const poor = cash < price
          return (
            <li key={def.id} className={styles.part}>
              <span className={styles.icon} aria-hidden="true">
                {def.emoji}
              </span>
              <div className={styles.info}>
                <strong>{def.name}</strong>
                <small>{have > 0 ? effectText(def.id, have) : def.blurb}</small>
                <span className={styles.pips} aria-label={`Level ${have} of ${MAX_LEVEL}`}>
                  {Array.from({ length: MAX_LEVEL }, (_, i) => (
                    <i key={i} className={i < have ? styles.on : i === have && block === 'ok' ? styles.next : ''} />
                  ))}
                </span>
              </div>
              {block === 'max' ? (
                <span className={styles.maxed}>Maxed</span>
              ) : block === 'rank' && needRank ? (
                <span className={styles.locked}>
                  <Lock size={14} aria-hidden="true" />
                  <span>
                    {needRank.emoji} {needRank.name}
                  </span>
                </span>
              ) : (
                <button
                  type="button"
                  className={styles.buy}
                  disabled={busy || poor}
                  onClick={() => {
                    hapticTap()
                    onBuy(def.id)
                  }}
                  title={poor ? `You need ${naira(price)}` : undefined}
                >
                  <b>Level {next}</b>
                  <small>{short(price)}</small>
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <p className={styles.note}>
        Level 2 unlocks at {RANKS[LEVEL_RANK[1]!]!.name}, level 3 at {RANKS[LEVEL_RANK[2]!]!.name}. Win races and beat the clock to earn XP. You are {rankFor(xp).name}.
      </p>
    </div>
  )
}
