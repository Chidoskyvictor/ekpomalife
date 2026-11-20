'use client'

import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { WhotClientState } from '@/lib/game/whot-api'
import { CALLABLE_SHAPES, specialOf, type Card, type Shape, type WhotEvent } from '@/lib/game/whot-rules'
import { playSfx } from '@/lib/audio/sfx'
import { CardBack, CardFace, MiniBack, ShapeMark, SHAPE_NAME } from './whot-card'
import styles from './whot.module.css'

type Props = {
  state: WhotClientState | null
  subtitle: string
  onExit: () => void
  onPlay: (cardId: number, shape?: Shape) => void
  onPick: () => void
  onCall: () => void
  disabled?: boolean
}

function who(state: WhotClientState, seat: number) {
  return seat === state.mySeat ? 'You' : (state.names[seat] ?? `Player ${seat + 1}`)
}

function eventText(state: WhotClientState, e: WhotEvent): string | null {
  const name = who(state, 'seat' in e ? e.seat : 0)
  const verb = name === 'You' ? '' : 's'
  switch (e.kind) {
    case 'play': {
      const k = specialOf(e.card)
      if (k === 'whot') return `${name} call${verb} ${SHAPE_NAME[e.call ?? 'circle']}`
      if (k === 'pick-two') return `${name} play${verb} Pick Two`
      if (k === 'pick-three') return `${name} play${verb} Pick Three`
      return null
    }
    case 'hold-on':
      return `${name} hold${verb} on — plays again`
    case 'suspended':
      return `${name} ${name === 'You' ? 'are' : 'is'} suspended`
    case 'general-market':
      return 'General market! Everyone picks one'
    case 'last-card':
      return `${name} call${verb} LAST CARD!`
    case 'penalty':
      return `${name} forgot to call — picks ${e.count}`
    case 'reshuffle':
      return 'Market reshuffled'
    case 'win':
      return null
    default:
      return null
  }
}

export function WhotBoard({ state, subtitle, onExit, onPlay, onPick, onCall, disabled }: Props) {
  const [pendingWhot, setPendingWhot] = useState<Card | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const myTurn = state != null && state.turn === state.mySeat && state.phase === 'playing'
  const owe = state != null && state.owesCall === state.mySeat && state.rules.lastCardCall

  useEffect(() => {
    if (!state?.events.length) return
    const texts = state.events.map((e) => eventText(state, e)).filter((t): t is string => Boolean(t))
    const last = texts[texts.length - 1]
    if (!last) return
    setBanner(last)
    const t = window.setTimeout(() => setBanner(null), 2200)
    return () => window.clearTimeout(t)
  }, [state])

  const status = useMemo(() => {
    if (!state) return 'Connecting…'
    if (state.phase === 'over') return state.winner === state.mySeat ? 'You won! 🏆' : `${who(state, state.winner ?? 0)} won`
    if (!myTurn) return `${who(state, state.turn)}’s turn`
    if (state.pending > 0) {
      return state.rules.stackPicks && state.playable.length ? `Pick ${state.pending} — or stack` : `Pick ${state.pending} from the market`
    }
    if (state.again) return 'Play again'
    return 'Your turn'
  }, [state, myTurn])

  if (!state) {
    return (
      <div className={styles.root}>
        <div className={styles.topBar}>
          <button type="button" onClick={onExit} aria-label="Exit">
            <X size={18} />
          </button>
          <div className={styles.title}>
            <strong>Naija Whot</strong>
            <span>{subtitle}</span>
          </div>
        </div>
        <div className={styles.status}>Connecting…</div>
      </div>
    )
  }

  const playable = new Set(state.playable)
  const others = state.names.map((_, seat) => seat).filter((seat) => seat !== state.mySeat)
  const tap = (card: Card) => {
    if (!myTurn || disabled || !playable.has(card.id)) return
    if (card.shape === 'whot') return setPendingWhot(card)
    playSfx('cardPlay')
    onPlay(card.id)
  }
  const callShape = (shape: Shape) => {
    if (!pendingWhot) return
    playSfx('cardPlay')
    onPlay(pendingWhot.id, shape)
    setPendingWhot(null)
  }

  const myCount = state.hand.length

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <button type="button" onClick={onExit} aria-label="Exit">
          <X size={18} />
        </button>
        <div className={styles.title}>
          <strong>Naija Whot</strong>
          <span>{subtitle}</span>
        </div>
        <div className={`${styles.timer} ${myTurn ? styles.timerMine : ''}`} aria-label="Seconds left">
          {state.phase === 'over' ? '—' : state.turnSecondsLeft}
        </div>
      </div>

      <div className={styles.felt}>
        <div className={styles.seats}>
          {others.map((seat) => {
            const out = state.out[seat]
            return (
              <div
                key={seat}
                className={`${styles.seat} ${state.turn === seat && state.phase === 'playing' ? styles.seatTurn : ''} ${out ? styles.seatOut : ''}`}
              >
                <div className={styles.avatar}>{(state.names[seat] ?? '?').replace('@', '').slice(0, 1).toUpperCase()}</div>
                <div className={styles.seatName}>{state.names[seat]}</div>
                <div className={styles.seatCards}>
                  {out ? (
                    <span className={styles.outTag}>Left</span>
                  ) : (
                    <>
                      {Array.from({ length: Math.min(state.counts[seat] ?? 0, 7) }, (_, i) => (
                        <MiniBack key={i} />
                      ))}
                      <b>{state.counts[seat]}</b>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className={styles.table}>
          <button type="button" className={styles.market} onClick={onPick} disabled={!myTurn || disabled} aria-label="Go to market">
            <span className={styles.marketStack}>
              <CardBack className={styles.m3} />
              <CardBack className={styles.m2} />
              <CardBack className={styles.m1} />
            </span>
            <span className={styles.marketTag}>{state.pending > 0 && myTurn ? `Pick ${state.pending}` : `Market · ${state.marketCount}`}</span>
          </button>

          <div className={styles.pile}>
            <CardFace card={state.pileTop} size="pile" called={state.called} className={styles.pileTop} />
            <span className={styles.pileTag}>{state.called ? `Needs ${SHAPE_NAME[state.called]}` : 'Pile'}</span>
          </div>
        </div>

        {banner ? <div className={styles.banner}>{banner}</div> : null}
        {state.pending > 0 ? (
          <div className={styles.pendingChip}>+{state.pending} cards coming</div>
        ) : null}
      </div>

      <div className={`${styles.status} ${myTurn ? styles.statusMine : ''}`}>{status}</div>

      <div className={styles.handWrap}>
        <div className={`${styles.hand} ${myCount > 7 ? styles.handTight : ''}`}>
          {state.hand.map((card) => {
            const ok = myTurn && playable.has(card.id)
            return (
              <button
                key={card.id}
                type="button"
                className={`${styles.cardBtn} ${ok ? styles.cardBtnOk : ''} ${myTurn && !ok ? styles.cardBtnDim : ''}`}
                onClick={() => tap(card)}
                aria-label={`${SHAPE_NAME[card.shape]} ${card.num}`}
              >
                <CardFace card={card} size="hand" playable={ok} />
              </button>
            )
          })}
        </div>
      </div>

      <div className={styles.actions}>
        {state.rules.lastCardCall ? (
          <button type="button" className={`${styles.lastBtn} ${owe ? styles.lastBtnOn : ''}`} disabled={!owe || disabled} onClick={onCall}>
            Last card!
          </button>
        ) : null}
        <button
          type="button"
          className={styles.pickBtn}
          disabled={!myTurn || disabled}
          onClick={() => {
            playSfx('cardDraw')
            onPick()
          }}
        >
          {state.pending > 0 ? `Pick ${state.pending}` : 'Go to market'}
        </button>
      </div>

      {pendingWhot ? (
        <div className={styles.sheetBackdrop} onClick={() => setPendingWhot(null)}>
          <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <p className={styles.sheetTitle}>Call a shape</p>
            <div className={styles.shapeGrid}>
              {CALLABLE_SHAPES.map((s) => (
                <button key={s} type="button" className={styles.shapeBtn} onClick={() => callShape(s)}>
                  <ShapeMark shape={s} size={36} />
                  <span>{SHAPE_NAME[s]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {state.phase === 'over' ? (
        <div className={styles.over}>
          <div className={styles.overCard}>
            <strong>{state.winner === state.mySeat ? 'You won! 🏆' : `${who(state, state.winner ?? 0)} won`}</strong>
            {state.pot > 0 ? <span>Pot ₦{state.pot.toLocaleString()}</span> : null}
            <button type="button" className={styles.pickBtn} onClick={onExit}>
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
