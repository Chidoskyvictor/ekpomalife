'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { rewardWhotCpuWin, type WhotClientState } from '@/lib/game/whot-api'
import {
  autoMove,
  callLastCard,
  DEFAULT_RULES,
  newWhot,
  pick,
  play,
  viewFor,
  type Shape,
  type WhotEvent,
  type WhotRules,
  type WhotState,
} from '@/lib/game/whot-rules'
import { playSfx } from '@/lib/audio/sfx'
import { WhotBoard } from './whot-board'

type Props = {
  players: number
  rules?: WhotRules
  onExit: () => void
  notify: (text: string, ok?: boolean) => void
}

const TURN_SECONDS = 30

export function WhotCpuGame({ players, rules = DEFAULT_RULES, onExit, notify }: Props) {
  const game = useRef<WhotState | null>(null)
  if (!game.current) game.current = newWhot(players, rules)
  const [tick, setTick] = useState(0)
  const [events, setEvents] = useState<WhotEvent[]>([])
  const [left, setLeft] = useState(TURN_SECONDS)
  const rewarded = useRef(false)
  const s = game.current
  const names = ['You', ...Array.from({ length: players - 1 }, (_, i) => `Bot ${i + 1}`)]

  const commit = useCallback((evs: WhotEvent[]) => {
    setEvents(evs)
    setLeft(TURN_SECONDS)
    setTick((t) => t + 1)
  }, [])

  // The computer players take their turns
  useEffect(() => {
    const st = game.current!
    if (st.winner != null || st.turn === 0) return
    const seat = st.turn
    const t = window.setTimeout(() => {
      const res = autoMove(st, seat)
      if (res.ok) {
        playSfx(res.events.some((e) => e.kind === 'play') ? 'cardPlay' : 'cardDraw')
        commit(res.events)
      }
    }, 900)
    return () => window.clearTimeout(t)
  }, [tick, commit])

  // Your 30 seconds: out of time and the phone plays for you
  useEffect(() => {
    if (s.winner != null || s.turn !== 0) return
    const id = window.setInterval(() => {
      setLeft((v) => {
        if (v > 1) return v - 1
        const res = autoMove(game.current!, 0)
        if (res.ok) commit(res.events)
        return TURN_SECONDS
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [tick, s.winner, s.turn, commit])

  useEffect(() => {
    if (s.winner == null) return
    playSfx(s.winner === 0 ? 'win' : 'lose')
    if (s.winner !== 0 || rewarded.current) return
    rewarded.current = true
    void rewardWhotCpuWin().then((res) => {
      if (res.ok && res.rewarded) notify(`You won! +${res.fun} Fun 🎉`, true)
      else if (res.ok) notify('You won! 🎉', true)
    })
  }, [s.winner, notify])

  const client: WhotClientState = {
    ...viewFor(s, 0),
    names,
    pot: 0,
    mySeat: 0,
    turnSecondsLeft: left,
    events,
  }

  const act = (res: ReturnType<typeof play>) => {
    if (!res.ok) return notify(res.error, false)
    commit(res.events)
  }

  return (
    <WhotBoard
      key={0}
      state={client}
      subtitle={`vs computer · ${players} players`}
      onExit={onExit}
      onPlay={(cardId: number, shape?: Shape) => act(play(s, 0, cardId, shape))}
      onPick={() => act(pick(s, 0))}
      onCall={() => act(callLastCard(s, 0))}
    />
  )
}
