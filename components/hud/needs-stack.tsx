'use client'

import { useMemo, useState } from 'react'
import { NEED_META, needTone, needValue, type NeedId } from '@/lib/game/needs'
import type { GameState } from '@/lib/game/types'
import styles from './life-hud.module.css'

const ORDER: NeedId[] = ['hunger', 'energy', 'hygiene', 'fun', 'study']

const TONE_COLOR = {
  good: '#22c55e',
  warn: '#eab308',
  bad: '#ef4444',
} as const

export function NeedsStack({ state }: { state: GameState }) {
  const [open, setOpen] = useState(true)
  const [focus, setFocus] = useState<NeedId | null>(null)

  const critical = useMemo(
    () => ORDER.find((id) => needValue(state, id) < 25) ?? null,
    [state],
  )
  const tipId = focus ?? critical
  const tip = tipId ? NEED_META[tipId].tip : null

  return (
    <aside className={styles.sideLeft} aria-label="Needs">
      <div className={`${styles.panel} ${styles.needs}`}>
        <button type="button" className={styles.collapseBtn} onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide' : 'Needs'}
        </button>
        {open
          ? ORDER.map((id) => {
              const value = needValue(state, id)
              const tone = needTone(value)
              const meta = NEED_META[id]
              const low = value < 25
              return (
                <button
                  key={id}
                  type="button"
                  className={`${styles.needBtn} ${low ? styles.needPulse : ''}`}
                  style={{ ['--need' as string]: TONE_COLOR[tone], ['--val' as string]: value }}
                  aria-label={`${meta.label} ${Math.round(value)}`}
                  onClick={() => setFocus((current) => (current === id ? null : id))}
                >
                  <span className={styles.needRing} aria-hidden="true" />
                  <span className={styles.needCore}>
                    <img src={meta.emoji} alt="" width={18} height={18} />
                  </span>
                </button>
              )
            })
          : null}
      </div>
      {open && tip ? <p className={`${styles.panel} ${styles.needTip}`}>{tip}</p> : null}
    </aside>
  )
}
