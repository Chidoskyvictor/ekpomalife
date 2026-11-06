'use client'

import { useMemo, useState } from 'react'
import type { WhotClientState } from '@/lib/game/whot-api'
import { WhotCardBack, WhotCardFace, WhotShapePickerCard } from './whot-card'
import styles from './whot.module.css'
import { playSfx } from '@/lib/audio/sfx'

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
    playSfx('cardPlay')
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
        {(state?.players ?? []).map((p) => (
          <div key={p.seat} className={`${styles.opp} ${p.isTurn ? styles.oppTurn : ''} ${p.eliminated ? styles.oppOut : ''}`}>
            <div className={styles.oppAvatar}>{(p.seat === state?.mySeat ? 'Y' : p.name.replace('@', '').slice(0, 1)).toUpperCase()}</div>
            <div className={styles.oppName}>{p.seat === state?.mySeat ? 'You' : p.name}</div>
            <div className={styles.oppCount}>{p.eliminated ? 'Out' : `${p.cardCount} cards`}</div>
          </div>
        ))}
      </div>

      <div className={styles.status}>
        {state?.phase === 'over' && state.winnerSeat != null
          ? state.winnerSeat === state.mySeat
            ? 'You won! 🏆'
            : `${state.players[state.winnerSeat]?.name ?? 'Someone'} won.`
          : (alertText ?? (state?.mustPick && myTurn ? 'You must pick cards' : myTurn ? 'Your turn' : 'Waiting for others…'))}
      </div>

      <div className={styles.felt}>
        <div className={styles.table}>
          <div className={styles.market}>
            <div className={styles.marketStack}>
              <WhotCardBack className={styles.marketCard} />
            </div>
            <span className={styles.marketTag}>Market · {state?.marketCount ?? 0}</span>
          </div>
          <div className={styles.pile}>
            {state?.pileTop ? <WhotCardFace card={state.pileTop} size="pile" /> : <WhotCardBack />}
            <span>{state?.callShape ? `Call: ${state.callShape}` : 'Pile'}</span>
          </div>
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
        <button type="button" className={styles.pickBtn} disabled={!myTurn || disabled} onClick={() => {
              playSfx('cardDraw')
              onPick()
            }}>
          {state?.mustPick ? 'Pick cards' : 'Go to market'}
        </button>
      </div>
    </div>
  )
}
