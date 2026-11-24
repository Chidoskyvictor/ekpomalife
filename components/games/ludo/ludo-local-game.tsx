'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { applyMove, applyRoll, autoMove, legalMoves, newLudo, type LudoMove, type LudoState } from '@/lib/game/ludo-engine'
import { COLOR_NAMES } from './ludo-geometry'
import { LudoScreen, type LudoView } from './ludo-screen'

const COLORS_FOR: Record<number, number[]> = { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] }
const TURN_SECONDS = 45

const die = () => 1 + Math.floor(Math.random() * 6)

/** Ludo against the phone (computer seats) or passed around one phone. Same rules file as the server. */
export function LudoLocalGame({
  mode,
  players,
  onExit,
  onOver,
}: {
  mode: 'cpu' | 'local'
  players: number
  onExit: () => void
  onOver: (winner: number) => void
}) {
  const game = useRef<LudoState | null>(null)
  if (!game.current) game.current = newLudo(COLORS_FOR[players] ?? COLORS_FOR[2]!)
  const [, setTick] = useState(0)
  const [last, setLast] = useState<LudoView['last']>(null)
  const [left, setLeft] = useState(TURN_SECONDS)
  const seq = useRef(0)
  const leftRef = useRef(TURN_SECONDS)
  const reported = useRef(false)
  const s = game.current

  const names =
    mode === 'cpu'
      ? ['You', ...Array.from({ length: players - 1 }, (_, i) => `Phone ${i + 1}`)]
      : s.colors.map((c) => COLOR_NAMES[c]!)

  const bump = useCallback(() => {
    setTick((t) => t + 1)
    leftRef.current = TURN_SECONDS
    setLeft(TURN_SECONDS)
  }, [])

  const doRoll = useCallback(() => {
    const st = game.current!
    const seat = st.turn
    const a = die()
    const b = die()
    const res = applyRoll(st, a, b)
    if (!res.ok) return
    setLast({ seat, roll: [a, b], passed: res.passed, n: ++seq.current })
    bump()
  }, [bump])

  const doMove = useCallback(
    (m: LudoMove) => {
      const st = game.current!
      const seat = st.turn
      const roll = st.dice ?? undefined
      const res = applyMove(st, m)
      if (!res) return
      setLast({ seat, roll, move: res, n: ++seq.current })
      bump()
    },
    [bump],
  )

  // Phone players: roll, think, move
  useEffect(() => {
    const st = game.current!
    if (st.winner != null || mode !== 'cpu' || st.turn === 0) return
    const t = window.setTimeout(
      () => {
        if (st.dice == null) doRoll()
        else {
          const m = autoMove(st)
          if (m) doMove(m)
        }
      },
      st.dice == null ? 900 : 1100,
    )
    return () => window.clearTimeout(t)
  })

  // Human turn clock: out of time and the game plays for you
  useEffect(() => {
    const st = game.current!
    if (st.winner != null || (mode === 'cpu' && st.turn !== 0)) return
    const id = window.setInterval(() => {
      // No side effects inside a state updater: React may run those twice and play a move twice
      if (leftRef.current > 1) {
        leftRef.current -= 1
        setLeft(leftRef.current)
        return
      }
      leftRef.current = TURN_SECONDS
      const cur = game.current!
      if (cur.dice == null) doRoll()
      else {
        const m = autoMove(cur)
        if (m) doMove(m)
      }
    }, 1000)
    return () => window.clearInterval(id)
  })

  useEffect(() => {
    if (s.winner != null && !reported.current) {
      reported.current = true
      onOver(s.winner)
    }
  }, [s.winner, onOver])

  const view: LudoView = {
    colors: s.colors,
    pos: s.pos,
    turn: s.turn,
    dice: s.dice,
    used: s.used,
    moves: legalMoves(s),
    winner: s.winner,
    last,
    secondsLeft: left,
  }

  return (
    <LudoScreen
      view={view}
      names={names}
      mySeat={mode === 'cpu' ? 0 : null}
      subtitle={mode === 'cpu' ? `vs Phone · ${players} players` : `Pass & play · ${players} players`}
      onRoll={doRoll}
      onMove={doMove}
      onExit={onExit}
    />
  )
}
