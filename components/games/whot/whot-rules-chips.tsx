'use client'

import type { WhotRules } from '@/lib/game/whot-rules'
import styles from '@/components/hud/phone/apps/games.module.css'

/** House-rule toggles shown when setting up a Whot game (computer or friends table). */
export function WhotRulesChips({ rules, onChange }: { rules: WhotRules; onChange: (rules: WhotRules) => void }) {
  return (
    <>
      <p className={styles.section}>House rules</p>
      <div className={styles.chips}>
        <button
          type="button"
          className={`${styles.chip} ${rules.stackPicks ? styles.chipOn : ''}`}
          onClick={() => onChange({ ...rules, stackPicks: !rules.stackPicks })}
        >
          Stack 2s & 5s
        </button>
        <button
          type="button"
          className={`${styles.chip} ${rules.lastCardCall ? styles.chipOn : ''}`}
          onClick={() => onChange({ ...rules, lastCardCall: !rules.lastCardCall })}
        >
          Last card call
        </button>
      </div>
      <p className={styles.fine}>
        {rules.stackPicks ? 'Answer a Pick Two or Pick Three with the same card to pass it on bigger. ' : 'Pick Two and Pick Three can’t be answered: you pick. '}
        {rules.lastCardCall ? 'Forget to call “Last card” and you pick two.' : ''}
      </p>
    </>
  )
}
