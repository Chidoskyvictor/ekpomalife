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
import {
  createLudoTable,
  fetchLudoTable,
  joinLudoTable,
  leaveLudoTable,
  ludoTableTicket,
  startLudoTable,
  type LudoTable,
} from '@/lib/game/ludo-api'
import styles from '@/components/hud/phone/apps/games.module.css'
import { LudoLocalGame } from './ludo-local-game'
import { LudoScreen, type LudoView } from './ludo-screen'

/*
 * Phone → Games → Ludo. Setup (vs phone / pass & play / online) and the player that hosts
 * the Ludo board. Online matches are run by the server: it rolls the dice and checks
 * every move, this component only passes "roll" / "move" to it and its board back to the page.
 */

export type LudoPlaySetup =
  | { mode: 'cpu' | 'local'; players: number }
  | { mode: 'online'; match: GameMatch }
  | { mode: 'table'; tableId: string; potLabel: string }

const naira = (n: number) => `₦${n.toLocaleString()}`

export function LudoSetup({
  betLeft,
  onBack,
  onPlay,
  onWaiting,
  onTable,
}: {
  betLeft: number | null
  onBack: () => void
  onPlay: (setup: LudoPlaySetup) => void
  onWaiting: (match: GameMatch) => void
  onTable: (table: LudoTable) => void
}) {
  const [mode, setMode] = useState<'cpu' | 'local' | 'online'>('cpu')
  const [players, setPlayers] = useState(2)
  const [username, setUsername] = useState('')
  const [bet, setBet] = useState(false)
  const [stake, setStake] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [friends, setFriends] = useState<ChatSummary[]>([])
  const [seats, setSeats] = useState(4)
  const [code, setCode] = useState('')

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

  const create = async () => {
    if (betInvalid) return
    setBusy(true)
    setError(null)
    const res = await createLudoTable(seats, amount)
    setBusy(false)
    if (!res.ok) return setError(res.error)
    onTable(res.table)
  }
  const join = async () => {
    if (!code.trim()) return
    setBusy(true)
    setError(null)
    const res = await joinLudoTable(code.trim())
    setBusy(false)
    if (!res.ok) return setError(res.error)
    onTable(res.table)
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

          <p className={styles.section}>Or play anyone (1v1)</p>
          <button type="button" className={styles.big} disabled={busy || betInvalid} onClick={() => void quick()}>
            Quick match
          </button>

          <p className={styles.section}>Friends table (2–4 players)</p>
          <div className={styles.chips}>
            {[2, 3, 4].map((n) => (
              <button key={n} type="button" className={`${styles.chip} ${seats === n ? styles.chipOn : ''}`} onClick={() => setSeats(n)}>
                Up to {n}
              </button>
            ))}
          </div>
          <p className={styles.fine}>Share the code. The host can start once two or more are in; the table doesn’t have to be full.</p>
          <button type="button" className={styles.big} disabled={busy || betInvalid} onClick={() => void create()}>
            Create table & get code
          </button>
          <div className={styles.row}>
            <input
              className={styles.input}
              placeholder="Table code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoCapitalize="characters"
              aria-label="Table code"
            />
            <button type="button" className={styles.primary} disabled={busy || !code.trim()} onClick={() => void join()}>
              Join
            </button>
          </div>
        </>
      )}
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  )
}

export function LudoLobby({
  table: initial,
  onBack,
  onLive,
}: {
  table: LudoTable
  onBack: () => void
  onLive: (t: LudoTable, label: string) => void
}) {
  const [table, setTable] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const label = (t: LudoTable) => (t.stake ? `Pot ${naira(t.pot)}` : 'Friendly · Online')
  useEffect(() => {
    const id = window.setInterval(async () => {
      const res = await fetchLudoTable(table.id)
      if (!res.ok) return
      setTable(res.table)
      if (res.table.status === 'active') onLive(res.table, label(res.table))
    }, 2500)
    return () => window.clearInterval(id)
  }, [table.id, onLive])

  return (
    <div className={styles.screen}>
      <div className={styles.backBar}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="Back">
          <ChevronLeft size={18} />
        </button>
        <strong>🎲 Ludo table</strong>
        <span className={styles.backSpacer} />
      </div>
      <div className={styles.waiting}>
        <strong>Code: {table.code}</strong>
        <span>{table.stake ? `${naira(table.stake)} each · pot ${naira(table.pot)}` : 'Friendly'}</span>
        <span>
          {table.players.length}/{table.maxPlayers} seated
        </span>
        {table.players.map((p) => (
          <span key={p.seat}>Seat {p.seat + 1}: @{p.username}</span>
        ))}
        {table.isHost ? (
          <button
            type="button"
            className={styles.big}
            disabled={table.players.length < 2}
            onClick={async () => {
              const res = await startLudoTable(table.id)
              if (!res.ok) return setError(res.error)
              onLive(res.table, label(res.table))
            }}
          >
            {table.players.length < 2 ? 'Waiting for a second player…' : `Start with ${table.players.length}`}
          </button>
        ) : (
          <span>Waiting for the host to start…</span>
        )}
        <button
          type="button"
          className={styles.ghost}
          onClick={async () => {
            await leaveLudoTable(table.id)
            onBack()
          }}
        >
          Leave table
        </button>
        {error ? <span className={styles.error}>{error}</span> : null}
      </div>
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
  const socket = useRef<WebSocket | null>(null)
  const online = setup.mode === 'online' ? setup.match : null
  const tableId = setup.mode === 'table' ? setup.tableId : null
  const [view, setView] = useState<LudoView | null>(null)
  const [tableInfo, setTableInfo] = useState<{ seat: number; names: string[]; pot: number; stake: number } | null>(null)
  const [opponentAway, setOpponentAway] = useState<number | null>(null)
  const [opponentSeen, setOpponentSeen] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const overSent = useRef(false)

  // Live match: the server sends the board, we send "roll" / "move"
  useEffect(() => {
    if (!online && !tableId) return
    let stopped = false
    let retry = 0
    let timer: number | undefined
    const connect = async () => {
      const res = online ? await matchTicket(online.id) : await ludoTableTicket(tableId!)
      if (stopped) return
      if (!res.ok) {
        timer = window.setTimeout(connect, Math.min(10_000, 1500 * ++retry))
        return
      }
      const ws = new WebSocket(apiSocketUrl(`${online ? '/ws/game' : '/ws/ludo'}?ticket=${encodeURIComponent(res.ticket)}`))
      socket.current = ws
      ws.onopen = () => (retry = 0)
      ws.onmessage = (event) => {
        let msg: Record<string, unknown>
        try {
          msg = JSON.parse(String(event.data)) as Record<string, unknown>
        } catch {
          return
        }
        if (msg.t === 'table') {
          setTableInfo({ seat: Number(msg.seat), names: msg.names as string[], pot: Number(msg.pot), stake: Number(msg.stake) })
        } else if (msg.t === 'ludo') {
          setView(msg as unknown as LudoView)
        } else if (msg.t === 'error' && typeof msg.error === 'string') notify(msg.error, false)
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
  }, [online, tableId, notify])

  // The server settles the match itself; look it up once it is over
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

  const handleOver = useCallback(
    (winner: number) => {
      if (overSent.current) return
      overSent.current = true
      if (setup.mode === 'cpu' && winner === 0) {
        void rewardCpuWin().then((res) => {
          if (res.ok && res.rewarded) notify(`You beat the phone! +${res.fun} Fun 🎉`, true)
          else notify('You beat the phone! 🎉', true)
        })
      } else if (online) void showOutcome()
      else if (tableId && tableInfo) {
        const won = winner === tableInfo.seat
        setResult(won ? `You won${tableInfo.stake ? ` ${naira(tableInfo.pot)}` : ''}! 🏆` : `${tableInfo.names[winner]} won this one.`)
      }
    },
    [setup.mode, online, tableId, tableInfo, notify, showOutcome],
  )

  useEffect(() => {
    if (view?.winner != null) handleOver(view.winner)
  }, [view?.winner, handleOver])

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

  const send = (payload: object) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(payload))
  }

  const mySeat = online ? online.myIndex : (tableInfo?.seat ?? 0)
  const names = online ? online.names : (tableInfo?.names ?? [])
  const subtitle = online
    ? online.stake
      ? `Pot ${naira(online.stake * 2)} · Online`
      : 'Friendly · Online'
    : tableInfo
      ? `${tableInfo.names.length} players · ${tableInfo.stake ? `Pot ${naira(tableInfo.pot)}` : 'Friendly'}`
      : 'Online'

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
        {setup.mode === 'cpu' || setup.mode === 'local' ? (
          <LudoLocalGame mode={setup.mode} players={setup.players} onExit={onExit} onOver={handleOver} />
        ) : (
          <LudoScreen
            view={view}
            names={names}
            mySeat={mySeat}
            subtitle={subtitle}
            onRoll={() => send({ t: 'roll' })}
            onMove={(m) => send({ t: 'move', token: m.token, die: m.die })}
            onExit={onExit}
          />
        )}
      </div>
    </BodyPortal>
  )
}
