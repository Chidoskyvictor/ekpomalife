'use client'

import { ChevronLeft } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { BodyPortal } from '@/components/ui/body-portal'
import { apiSocketUrl, fetchMatch, matchTicket, reportMatch, type GameMatch } from '@/lib/game/games-api'
import styles from '@/components/hud/phone/apps/games.module.css'

/*
 * Online Tic tac toe inside the phone. The server keeps the board and decides the winner; this
 * component holds the socket and passes messages to /games/tic-tac-toe/play.html?online=1
 * (same bridge idea as Snooker's PlayView).
 */

type TttState = { winnerSeat: 0 | 1 | null; [k: string]: unknown }
const naira = (n: number) => `₦${n.toLocaleString()}`

export function TttOnlineGame({ match, onExit, notify }: { match: GameMatch; onExit: () => void; notify: (text: string, ok?: boolean) => void }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const socket = useRef<WebSocket | null>(null)
  const latest = useRef<TttState | null>(null)
  const reported = useRef(false)
  const [away, setAway] = useState<number | null>(null)
  const [seen, setSeen] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  const toGame = useCallback((msg: Record<string, unknown>) => {
    frame.current?.contentWindow?.postMessage({ target: 'ekpoma-ttt', ...msg }, window.location.origin)
  }, [])

  const init = useCallback(() => {
    toGame({
      type: 'init',
      mySeat: match.myIndex,
      names: match.names,
      subtitle: match.stake ? `Pot ${naira(match.stake * 2)} · Online` : 'Friendly · Online',
    })
    if (latest.current) toGame({ type: 'state', state: latest.current })
  }, [match, toGame])

  const describe = useCallback(
    (m: GameMatch) =>
      m.status === 'finished'
        ? m.won
          ? `You won${match.stake ? ` ${naira(match.stake * 2)}` : ''}! 🏆`
          : `@${match.opponent} won this one.`
        : 'Results didn’t match, so both stakes went back.',
    [match],
  )

  // The server's board decides; we only tell it the match is over so it can pay out
  const report = useCallback(
    async (forfeit = false) => {
      const res = await reportMatch(match.id, 'me', forfeit)
      if (!res.ok) {
        reported.current = false
        return notify(res.error, false)
      }
      if (res.status === 'finished') setResult(describe(res.match))
      else if (forfeit) notify('Your opponent is still here, or the minute isn’t up yet.', false)
    },
    [match.id, describe, notify],
  )

  useEffect(() => {
    let stopped = false
    let retry = 0
    let timer: number | undefined
    const connect = async () => {
      const res = await matchTicket(match.id)
      if (stopped) return
      if (!res.ok) {
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
        if (msg.t === 'ttt') {
          const { t: _t, error, ...state } = msg
          void _t
          latest.current = state as TttState
          toGame({ type: 'state', state })
          if (typeof error === 'string') notify(error, false)
          if (state.winnerSeat !== null && state.winnerSeat !== undefined && !reported.current) {
            reported.current = true
            void report()
          }
        } else if (msg.t === 'presence' || msg.t === 'hello') {
          const here = Boolean(msg.t === 'hello' ? msg.opponentOnline : msg.online)
          if (here) setSeen(true)
          setAway((was) => (here ? null : (was ?? Date.now())))
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
  }, [match.id, report, toGame, notify])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return
      const m = event.data as { source?: string; type?: string; cell?: unknown }
      if (!m || m.source !== 'ekpoma-ttt') return
      if (m.type === 'ready') init()
      else if (m.type === 'move') socket.current?.send(JSON.stringify({ t: 'move', cell: m.cell }))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [init])

  // The other phone may settle the match first: look every few seconds while we wait
  useEffect(() => {
    if (result) return
    const id = window.setInterval(async () => {
      const res = await fetchMatch(match.id)
      if (res.ok && res.match.status !== 'active') setResult(describe(res.match))
    }, 4000)
    return () => window.clearInterval(id)
  }, [match.id, result, describe])

  useEffect(() => {
    if (away == null) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [away])
  const awaySeconds = away == null ? 0 : Math.max(0, Math.floor((now - away) / 1000))

  return (
    <BodyPortal>
      <div className={`${styles.playScreen} ${styles.fullScreen}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', color: '#e8f0eb' }}>
          <button type="button" className={styles.back} style={{ width: 44, height: 44 }} onClick={onExit} aria-label="Leave the table">
            <ChevronLeft size={18} />
          </button>
          <strong style={{ fontSize: 15 }}>⭕ Tic tac toe · vs @{match.opponent}</strong>
        </div>
        {away != null && !result ? (
          <div className={styles.banner}>
            @{match.opponent} {seen ? 'left the table' : 'isn’t at the table yet'} · {awaySeconds < 60 ? `${60 - awaySeconds}s left` : 'you can claim the win'}
            {awaySeconds >= 60 ? (
              <button type="button" className={styles.primary} onClick={() => void report(true)}>
                Claim win
              </button>
            ) : null}
          </div>
        ) : null}
        {result ? <div className={styles.banner}>{result}</div> : null}
        <iframe ref={frame} className={styles.frame} src="/games/tic-tac-toe/play.html?online=1" title="Tic tac toe" onLoad={init} />
      </div>
    </BodyPortal>
  )
}
