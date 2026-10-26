'use client'

import { useMemo, useState } from 'react'
import type { WhotClientState } from '@/lib/game/whot-api'
import { WhotCardBack, WhotCardFace, WhotShapePickerCard } from './whot-card'
import styles from './whot.module.css'

const SHAPES = ['Circle', 'Triangle', 'Cross', 'Square', 'Star'] as const

type Props = {
  state: WhotClientState | null
  subtitle: string
  onExit: () => void
  onPlay: (cardIndex: number, shape?: string) => void
  onPick: () => void
  disabled?: boolean
}

export function WhotBoard({ state, subtitle, onExit, onPlay, onPick, disabled }: Props) {
  const [pendingWhotIndex, setPendingWhotIndex] = useState<number | null>(null)
  const myTurn = state != null && state.currentSeat === state.mySeat && state.phase === 'playing'
  const alertText = useMemo(() => {
    if (!state?.alerts.length) return null
    const a = state.alerts[state.alerts.length - 1]!
    if (a.kind === 'last-card') return 'Last card!'
    if (a.kind === 'checkup') return 'Check up!'
    if (a.kind === 'special' && a.text) return a.text
    return null
  }, [state?.alerts])

  const playCard = (index: number, shape?: string) => {
    const card = state?.hand[index]
    if (!card) return
    if (card.shape === 'Whot' && !shape) {
      setPendingWhotIndex(index)
      return
    }
    setPendingWhotIndex(null)
    onPlay(index, shape)
  }

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <button type="button" onClick={onExit} aria-label="Exit">✕</button>
        <div className={styles.title}>
          <strong>Naija Whot!</strong>
          <span>{subtitle}</span>
        </div>
        <div className={styles.timer}>{state?.turnSecondsLeft ?? '—'}</div>
      </div>

      <div className={styles.opponents}>
        {(state?.players ?? []).filter((p) => p.seat !== state?.mySeat).map((p) => (
          <div key={p.seat} className={`${styles.opp} ${p.isTurn ? styles.oppTurn : ''}`}>
            <div className={styles.oppAvatar}>{p.name.replace('@', '').slice(0, 1).toUpperCase()}</div>
            <div>{p.name}</div>
            <div>{p.eliminated ? 'Out' : `${p.cardCount} cards`}</div>
          </div>
        ))}
      </div>

      {alertText ? <div className={styles.alert}>{alertText}</div> : null}
      {state?.phase === 'over' && state.winnerSeat != null ? (
        <div className={styles.alert}>
          {state.winnerSeat === state.mySeat ? 'You won! 🏆' : `${state.players[state.winnerSeat]?.name ?? 'Someone'} won.`}
        </div>
      ) : null}

      <div className={styles.table}>
        <div className={styles.pile}>
          {state?.pileTop ? <WhotCardFace card={state.pileTop} size="pile" /> : <WhotCardBack />}
          <span>Pile{state?.callShape ? ` · ${state.callShape}` : ''}</span>
        </div>
        <div className={styles.market}>
          <div className={styles.marketStack}>
            <WhotCardBack className={styles.marketCard} />
            <span className={styles.marketCount}>{state?.marketCount ?? 0}</span>
          </div>
          <span>Market</span>
        </div>
      </div>

      {pendingWhotIndex != null ? (
        <div className={styles.shapeSheet}>
          <p className={styles.shapeSheetLabel}>Call a shape</p>
          {SHAPES.map((s) => (
            <WhotShapePickerCard key={s} shape={s} onClick={() => playCard(pendingWhotIndex, s)} />
          ))}
        </div>
      ) : null}

      <div className={styles.hand}>
        {(state?.hand ?? []).map((card, i) => (
          <button
            key={`${card.shape}-${card.value}-${i}`}
            type="button"
            className={styles.cardBtn}
            disabled={!myTurn || disabled}
            onClick={() => playCard(i)}
          >
            <WhotCardFace card={card} size="hand" />
          </button>
        ))}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.pickBtn} disabled={!myTurn || disabled} onClick={onPick}>
          {state?.mustPick ? 'Pick cards' : 'Go to market'}
        </button>
      </div>
    </div>
  )
}
