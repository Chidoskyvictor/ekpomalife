'use client'

import { ChevronLeft } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { BodyPortal } from '@/components/ui/body-portal'
import {
  apiSocketUrl,
  challengePlayer,
  fetchMatch,
  joinQuickMatch,
  matchTicket,
  reportMatch,
  rewardCpuWin,
  type GameMatch,
} from '@/lib/game/games-api'
import { fetchChats, type ChatSummary } from '@/lib/game/hostels-api'
import styles from '@/components/hud/phone/apps/games.module.css'

/*
 * Phone → Games → Ludo. Setup (vs phone / pass & play / online) and the player that hosts
 * /games/ludo/index.html. Online matches are run by the server: it rolls the dice and checks
 * every move, this component only passes "roll" / "move" to it and its board back to the page.
 */

export type LudoPlaySetup =
  | { mode: 'cpu' | 'local'; players: number }
  | { mode: 'online'; match: GameMatch }

const naira = (n: number) => `₦${n.toLocaleString()}`

export function LudoSetup({
  betLeft,
  onBack,
  onPlay,
  onWaiting,
}: {
  betLeft: number | null
  onBack: () => void
  onPlay: (setup: LudoPlaySetup) => void
  onWaiting: (match: GameMatch) => void
}) {
  const [mode, setMode] = useState<'cpu' | 'local' | 'online'>('cpu')
  const [players, setPlayers] = useState(2)
  const [username, setUsername] = useState('')
  const [bet, setBet] = useState(false)
  const [stake, setStake] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [friends, setFriends] = useState<ChatSummary[]>([])

  useEffect(() => {
    if (mode !== 'online') return
    void fetchChats().then((res) => {
      if (res.ok) setFriends(res.chats.filter((c) => c.kind === 'direct' && c.peer).slice(0, 8))
    })
  }, [mode])

  const amount = bet ? Math.floor(Number(stake.replace(/[^\d]/g, '')) || 0) : 0
  const betInvalid = bet && amount <= 0

  const challenge = async () => {
    if (!username.trim() || betInvalid) return
    setBusy(true)
    setError(null)
    const res = await challengePlayer(username.trim(), 'classic', amount, 'ludo')
    setBusy(false)
    if (!res.ok) return setError(res.error)
    onWaiting(res.match)
  }
  const quick = async () => {
    if (betInvalid) return
    setBusy(true)
    setError(null)
    const res = await joinQuickMatch('classic', amount, 'ludo')
    setBusy(false)
    if (!res.ok) return setError(res.error)
    onWaiting(res.match)
  }

  return (
    <div className={styles.screen}>
      <div className={styles.backBar}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="Back">
          <ChevronLeft size={18} />
        </button>
        <strong>🎲 Ludo</strong>
        <span className={styles.backSpacer} />
      </div>

      <p className={styles.section}>How to play</p>
      <div className={styles.chips}>
        {(
          [
            ['cpu', '🤖', 'Vs phone'],
            ['local', '👥', 'Pass & play'],
            ['online', '🌐', 'Online'],
          ] as const
        ).map(([id, emoji, label]) => (
          <button key={id} type="button" className={`${styles.chip} ${mode === id ? styles.chipOn : ''}`} onClick={() => setMode(id)}>
            <span>{emoji}</span>
            {label}
          </button>
        ))}
      </div>

      {mode !== 'online' ? (
        <>
          <p className={styles.section}>Players</p>
          <div className={styles.chips}>
            {[2, 3, 4].map((n) => (
              <button key={n} type="button" className={`${styles.chip} ${players === n ? styles.chipOn : ''}`} onClick={() => setPlayers(n)}>
                {n}
              </button>
            ))}
          </div>
          <p className={styles.fine}>
            {mode === 'cpu' ? 'You against the phone. Win for Fun (a few times a day).' : 'Everyone shares this phone. Pass it on after each turn.'}
          </p>
          <button type="button" className={styles.big} onClick={() => onPlay({ mode, players })}>
            {mode === 'cpu' ? 'Play vs phone' : 'Start pass & play'}
          </button>
        </>
      ) : (
        <>
          <p className={styles.section}>Stakes</p>
          <div className={styles.chips}>
            <button type="button" className={`${styles.chip} ${!bet ? styles.chipOn : ''}`} onClick={() => setBet(false)}>
              Friendly
            </button>
            <button type="button" className={`${styles.chip} ${bet ? styles.chipOn : ''}`} onClick={() => setBet(true)}>
              💰 Bet
            </button>
          </div>
          {bet ? (
            <>
              <input
                className={styles.input}
                inputMode="numeric"
                placeholder="Amount (₦)"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                aria-label="Bet amount"
              />
              <p className={styles.fine}>
                Both players put in the same amount; the winner takes the pot. The server rolls the dice.
                {betLeft != null ? ` ${betLeft} bet match${betLeft === 1 ? '' : 'es'} left today.` : ''}
              </p>
            </>
          ) : null}

          <p className={styles.section}>Challenge by username</p>
          <div className={styles.row}>
            <input
              className={styles.input}
              placeholder="@username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              aria-label="Username to challenge"
            />
            <button type="button" className={styles.primary} disabled={busy || !username.trim() || betInvalid} onClick={() => void challenge()}>
              Challenge
            </button>
          </div>
          {friends.length ? (
            <div className={styles.friends}>
              {friends.map((c) => (
                <button key={c.id} type="button" className={styles.friend} onClick={() => setUsername(c.peer!.username)}>
                  @{c.peer!.username}
                </button>
              ))}
            </div>
          ) : null}

          <p className={styles.section}>Or play anyone</p>
          <button type="button" className={styles.big} disabled={busy || betInvalid} onClick={() => void quick()}>
            Quick match
          </button>
        </>
      )}
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  )
}

export function LudoPlay({
  setup,
  onExit,
  notify,
}: {
  setup: LudoPlaySetup
  onExit: () => void
  notify: (text: string, ok?: boolean) => void
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const socket = useRef<WebSocket | null>(null)
  const lastState = useRef<unknown>(null)
  const online = setup.mode === 'online' ? setup.match : null
  const [opponentAway, setOpponentAway] = useState<number | null>(null)
  const [opponentSeen, setOpponentSeen] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  const toGame = useCallback((msg: Record<string, unknown>) => {
    frame.current?.contentWindow?.postMessage({ target: 'ekpoma-ludo', ...msg }, window.location.origin)
  }, [])

  const init = useCallback(() => {
    if (setup.mode === 'online') {
      const m = setup.match
      toGame({
        type: 'init',
        mode: 'online',
        myIndex: m.myIndex,
        names: m.names,
        subtitle: m.stake ? `Pot ${naira(m.stake * 2)} · Online` : 'Friendly · Online',
      })
      if (lastState.current) toGame({ type: 'state', state: lastState.current })
    } else {
      toGame({
        type: 'init',
        mode: setup.mode,
        players: setup.players,
        subtitle: setup.mode === 'cpu' ? `vs Phone · ${setup.players} players` : `Pass & play · ${setup.players} players`,
      })
    }
  }, [setup, toGame])

  // Live match: the server sends the board, we send "roll" / "move"
  useEffect(() => {
    if (!online) return
    let stopped = false
    let retry = 0
    let timer: number | undefined
    const connect = async () => {
      const res = await matchTicket(online.id)
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
        if (msg.t === 'ludo') {
          lastState.current = msg
          toGame({ type: 'state', state: msg })
        } else if (msg.t === 'error') toGame({ type: 'error', error: msg.error })
        else if (msg.t === 'presence' || msg.t === 'hello') {
          const here = Boolean(msg.t === 'hello' ? msg.opponentOnline : msg.online)
          if (here) setOpponentSeen(true)
          setOpponentAway((was) => (here ? null : (was ?? Date.now())))
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
  }, [online, toGame])

  // The server settles the match itself; look it up once the page says it's over
  const showOutcome = useCallback(async () => {
    if (!online) return
    for (let i = 0; i < 6; i++) {
      const res = await fetchMatch(online.id)
      if (res.ok && res.match.status !== 'active') {
        setResult(res.match.won ? `You won${online.stake ? ` ${naira(online.stake * 2)}` : ''}! 🏆` : `@${online.opponent} won this one.`)
        return
      }
      await new Promise((r) => window.setTimeout(r, 1500))
    }
  }, [online])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return
      const m = event.data as Record<string, unknown>
      if (!m || m.source !== 'ekpoma-ludo') return
      if (m.type === 'ready') init()
      else if (m.type === 'exit') onExit()
      else if (m.type === 'roll') socket.current?.send(JSON.stringify({ t: 'roll' }))
      else if (m.type === 'move') socket.current?.send(JSON.stringify({ t: 'move', token: Number(m.token) }))
      else if (m.type === 'over') {
        if (setup.mode === 'cpu' && Number(m.winner) === 0) {
          void rewardCpuWin().then((res) => {
            if (res.ok && res.rewarded) notify(`You beat the phone! +${res.fun} Fun 🎉`, true)
            else notify('You beat the phone! 🎉', true)
          })
        } else if (online) void showOutcome()
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [init, notify, onExit, online, setup.mode, showOutcome])

  useEffect(() => {
    if (opponentAway == null) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [opponentAway])
  const awaySeconds = opponentAway == null ? 0 : Math.max(0, Math.floor((now - opponentAway) / 1000))

  const claim = async () => {
    if (!online) return
    const res = await reportMatch(online.id, 'me', true)
    if (!res.ok) return notify(res.error, false)
    if (res.status === 'finished') setResult(`You won${online.stake ? ` ${naira(online.stake * 2)}` : ''}! 🏆`)
  }

  return (
    <BodyPortal>
      <div className={`${styles.playScreen} ${styles.fullScreen}`}>
        {online && opponentAway != null && !result ? (
          <div className={styles.banner}>
            @{online.opponent} {opponentSeen ? 'left the table' : 'isn’t at the table yet'} ·{' '}
            {awaySeconds < 60 ? `${60 - awaySeconds}s left` : 'you can claim the win'}
            {awaySeconds >= 60 ? (
              <button type="button" className={styles.primary} onClick={() => void claim()}>
                Claim win
              </button>
            ) : null}
          </div>
        ) : null}
        {result ? <div className={styles.banner}>{result}</div> : null}
        <iframe ref={frame} className={styles.frame} src="/games/ludo/index.html" title="Ludo" onLoad={init} />
      </div>
    </BodyPortal>
  )
}
