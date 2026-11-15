'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BodyPortal } from '@/components/ui/body-portal'
import { apiSocketUrl, fetchMatch, matchTicket, rewardCpuWin, type GameMatch } from '@/lib/game/games-api'
import styles from '@/components/hud/phone/apps/games.module.css'

/*
 * Chess inside the phone: the game page (public/games/chess) draws the board; this holds the
 * live socket for online matches. The server validates every move and runs the clocks, so
 * this only passes moves up and the server's board down.
 */

export type ChessPlaySetup =
  | { opponent: 'cpu'; level: 'easy' | 'medium' | 'hard' }
  | { opponent: 'local' }
  | { opponent: 'online'; match: GameMatch }

const naira = (n: number) => `₦${n.toLocaleString()}`

export function ChessPlayView({ setup, onExit, notify }: { setup: ChessPlaySetup; onExit: () => void; notify: (text: string, ok?: boolean) => void }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const socket = useRef<WebSocket | null>(null)
  const lastState = useRef<Record<string, unknown> | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [opponentAway, setOpponentAway] = useState(false)
  const online = setup.opponent === 'online' ? setup.match : null

  const toGame = useCallback((msg: Record<string, unknown>) => {
    frame.current?.contentWindow?.postMessage({ target: 'ekpoma-chess', ...msg }, window.location.origin)
  }, [])

  const init = useCallback(() => {
    if (setup.opponent === 'cpu') {
      const level = setup.level[0]!.toUpperCase() + setup.level.slice(1)
      toGame({ type: 'init', mode: 'cpu', level: setup.level, names: ['You', 'Phone'], subtitle: `vs Phone · ${level}` })
    } else if (setup.opponent === 'local') {
      toGame({ type: 'init', mode: 'local', names: ['White', 'Black'], subtitle: 'Pass & play' })
    } else {
      const m = setup.match
      toGame({
        type: 'init',
        mode: 'online',
        seat: m.myIndex,
        names: m.names,
        subtitle: m.stake ? `Pot ${naira(m.stake * 2)} · 10 min each` : 'Friendly · 10 min each',
      })
      if (lastState.current) toGame({ type: 'state', state: lastState.current })
    }
  }, [setup, toGame])

  // Who won, as the server settled it
  const showResult = useCallback(async () => {
    if (!online) return
    for (let tries = 0; tries < 6; tries++) {
      const res = await fetchMatch(online.id)
      if (res.ok && res.match.status !== 'active') {
        const m = res.match
        setResult(
          m.status !== 'finished'
            ? 'This match has closed.'
            : m.won === null
              ? `Draw. ${m.stake ? `Your ${naira(m.stake)} is back in your wallet.` : ''}`
              : m.won
                ? `You won${m.stake ? ` ${naira(m.stake * 2)}` : ''}! 🏆`
                : `@${m.opponent} won this one.`,
        )
        return
      }
      await new Promise((r) => setTimeout(r, 800))
    }
  }, [online])

  // Live match: the server's board comes down this socket, our moves go up it
  useEffect(() => {
    if (!online) return
    let stopped = false
    let retry = 0
    let timer: number | undefined
    const connect = async () => {
      const res = await matchTicket(online.id)
      if (stopped) return
      if (!res.ok) {
        // Match already over (e.g. reopened after it ended): just show how it went
        if (res.error.toLowerCase().includes('not live')) return void showResult()
        timer = window.setTimeout(connect, Math.min(10_000, 1500 * ++retry))
        return
      }
      const ws = new WebSocket(apiSocketUrl(`/ws/game?ticket=${encodeURIComponent(res.ticket)}`))
      socket.current = ws
      ws.onopen = () => (retry = 0)
      ws.onmessage = (event) => {
        let msg: Record<string, unknown>
        try {
          msg = JSON.parse(String(event.data)) as Record<string, unknown>
        } catch {
          return
        }
        if (msg.t === 'chess') {
          const { t: _t, ...state } = msg
          void _t
          lastState.current = state
          toGame({ type: 'state', state })
          if (state.over) void showResult()
        } else if (msg.t === 'chess-error') toGame({ type: 'error', error: msg.error })
        else if (msg.t === 'presence' || msg.t === 'hello') {
          const here = Boolean(msg.t === 'hello' ? msg.opponentOnline : msg.online)
          setOpponentAway(!here)
        }
      }
      ws.onclose = () => {
        if (socket.current === ws) socket.current = null
        if (!stopped) timer = window.setTimeout(connect, Math.min(10_000, 1500 * ++retry))
      }
    }
    void connect()
    return () => {
      stopped = true
      window.clearTimeout(timer)
      socket.current?.close()
    }
  }, [online, toGame, showResult])

  // Messages from the game page
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return
      const m = event.data as Record<string, unknown>
      if (!m || m.source !== 'ekpoma-game' || m.game !== 'chess') return
      if (m.type === 'ready') init()
      else if (m.type === 'exit') onExit()
      else if (m.type === 'move') socket.current?.send(JSON.stringify({ t: 'move', from: m.from, to: m.to, promotion: m.promotion }))
      else if (m.type === 'resign') socket.current?.send(JSON.stringify({ t: 'resign' }))
      else if (m.type === 'sync') socket.current?.send(JSON.stringify({ t: 'sync' }))
      else if (m.type === 'over' && setup.opponent === 'cpu' && m.winner === 0) {
        void rewardCpuWin().then((res) => {
          if (res.ok && res.rewarded) notify(`You beat the phone! +${res.fun} Fun 🎉`, true)
          else notify('You beat the phone! 🎉', true)
        })
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [init, notify, onExit, setup.opponent])

  return (
    <BodyPortal>
      <div className={`${styles.playScreen} ${styles.fullScreen}`}>
        {online && opponentAway && !result ? (
          <div className={styles.banner}>@{online.opponent} is away. Their clock keeps running.</div>
        ) : null}
        {result ? <div className={styles.banner}>{result}</div> : null}
        <iframe ref={frame} className={styles.frame} src="/games/chess/index.html" title="Chess" onLoad={init} />
      </div>
    </BodyPortal>
  )
}
