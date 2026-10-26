'use client'

import { Game } from 'whot'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  advancePastEliminated,
  botShapeChoice,
  buildPublicState,
  checkWinner,
  handForSeat,
  pickCompatibleIndex,
  seatIndexFromPlayerId,
  tryPick,
  tryPlay,
  type WhotAlert,
} from '@/lib/game/whot-cpu-engine'
import { rewardWhotCpuWin } from '@/lib/game/whot-api'
import { WhotBoard } from './whot-board'
import type { WhotClientState } from '@/lib/game/whot-api'

type Props = {
  players: number
  onExit: () => void
  notify: (text: string, ok?: boolean) => void
}

export function WhotCpuGame({ players, onExit, notify }: Props) {
  const gameRef = useRef<Game | null>(null)
  const eliminatedRef = useRef(new Set<number>())
  const [alerts, setAlerts] = useState<WhotAlert[]>([])
  const [winnerSeat, setWinnerSeat] = useState<number | null>(null)
  const [tick, setTick] = useState(0)
  const [turnLeft, setTurnLeft] = useState(30)
  const rewarded = useRef(false)

  if (!gameRef.current) {
    gameRef.current = new Game({ noOfDecks: 1, noOfPlayers: players })
  }

  const game = gameRef.current
  const names = ['You', ...Array.from({ length: players - 1 }, (_, i) => `Bot ${i + 1}`)]

  const rebuild = useCallback(() => {
    setTick((t) => t + 1)
  }, [])

  useEffect(() => {
    if (winnerSeat != null) return
    const id = window.setInterval(() => setTurnLeft((s) => Math.max(0, s - 1)), 1000)
    return () => window.clearInterval(id)
  }, [winnerSeat, tick])

  useEffect(() => {
    if (winnerSeat != null) return
    setTurnLeft(30)
  }, [tick, winnerSeat])

  useEffect(() => {
    if (winnerSeat != null) return
    const seat = seatIndexFromPlayerId(game.turn.next()?.id ?? 0)
    if (seat === 0) return
    if (eliminatedRef.current.has(seat)) return
    const t = window.setTimeout(() => {
      const player = game.players[seat]
      if (!player?.turn) return
      if (player.toPick > 0 || !player.canPlay()) tryPick(game, seat)
      else {
        const idx = pickCompatibleIndex(game, seat)
        if (idx >= 0) {
          const shape = player.hand()[idx]?.shape === 'Whot' ? botShapeChoice() : undefined
          const res = tryPlay(game, seat, idx, shape)
          if (res.ok) {
            if (res.lastCard) setAlerts((a) => [...a, { kind: 'last-card', seat }])
            if (res.checkup) setAlerts((a) => [...a, { kind: 'checkup', seat }])
          }
        } else tryPick(game, seat)
      }
      advancePastEliminated(game, eliminatedRef.current)
      const w = checkWinner(game, eliminatedRef.current)
      if (w != null) setWinnerSeat(w)
      rebuild()
    }, 700)
    return () => window.clearTimeout(t)
  }, [tick, game, winnerSeat, rebuild])

  useEffect(() => {
    if (winnerSeat !== 0 || rewarded.current) return
    rewarded.current = true
    void rewardWhotCpuWin().then((res) => {
      if (res.ok && res.rewarded) notify(`You won! +${res.fun} Fun 🎉`, true)
      else if (res.ok) notify('You won! 🎉', true)
    })
  }, [winnerSeat, notify])

  const publicState = buildPublicState(game, names, eliminatedRef.current, alerts, winnerSeat)
  const clientState: WhotClientState = {
    ...publicState,
    pot: 0,
    turnSecondsLeft: turnLeft,
    hand: handForSeat(game, 0),
    mySeat: 0,
  }

  const onPlay = (cardIndex: number, shape?: string) => {
    const res = tryPlay(game, 0, cardIndex, shape as never)
    if (!res.ok) return notify(res.error, false)
    if (res.lastCard) setAlerts((a) => [...a, { kind: 'last-card', seat: 0 }])
    if (res.checkup) setAlerts((a) => [...a, { kind: 'checkup', seat: 0 }])
    advancePastEliminated(game, eliminatedRef.current)
    const w = checkWinner(game, eliminatedRef.current)
    if (w != null) setWinnerSeat(w)
    rebuild()
  }

  const onPick = () => {
    const res = tryPick(game, 0)
    if (!res.ok) return notify(res.error, false)
    advancePastEliminated(game, eliminatedRef.current)
    rebuild()
  }

  return (
    <WhotBoard
      state={clientState}
      subtitle={`vs computer · ${players} players`}
      onExit={onExit}
      onPlay={onPlay}
      onPick={onPick}
    />
  )
}
