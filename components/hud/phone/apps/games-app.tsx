'use client'

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useGame } from '@/hooks/use-game'
import {
  SNOOKER_VARIANTS,
  acceptMatch,
  apiSocketUrl,
  challengePlayer,
  closeMatch,
  fetchMatch,
  fetchMatches,
  joinQuickMatch,
  matchTicket,
  reportMatch,
  rewardCpuWin,
  type GameMatch,
  type SnookerVariant,
} from '@/lib/game/games-api'
import { fetchChats, type ChatSummary } from '@/lib/game/hostels-api'
import { OPEN_GAMES_EVENT, takePendingGames } from '@/lib/game/open-games'
import { WhotCpuGame } from '@/components/games/whot/whot-cpu-game'
import { WhotOnlineGame } from '@/components/games/whot/whot-online-game'
import {
  createWhotTable,
  fetchWhotTable,
  joinWhotTable,
  leaveWhotTable,
  startWhotTable,
  type WhotTable,
} from '@/lib/game/whot-api'
import { BodyPortal } from '@/components/ui/body-portal'
import { ChessPlayView, type ChessPlaySetup } from '@/components/games/chess/chess-play'
import { ChessSetup } from '@/components/games/chess/chess-setup'
import { FullscreenGameFrame } from '@/components/games/fullscreen-game-frame'
import { TttOnlineGame } from '@/components/games/ttt-online-game'
import { TttSetup } from '@/components/games/ttt-setup'
import type { LudoTable } from '@/lib/game/ludo-api'
import { GameChatDock } from '@/components/games/game-chat/game-chat-dock'
import type { GameChatTarget } from '@/lib/game/game-chat-api'
import { EMBEDDED_GAMES, type EmbeddedGameId } from '@/lib/game/embedded-games'
import { LudoLobby, LudoPlay, LudoSetup, type LudoPlaySetup } from '@/components/games/ludo/ludo-game'
import { BackButton } from '../app-header'
import styles from './games.module.css'

/*
 * Phone → Games. One place to start any game: pick the game, how to play (computer,
 * pass & play, online), then for online pick a friend by username / recent chat or quick
 * match, friendly or a bet. Games run inside the phone frame (an iframe "mini browser").
 */

type Mode = 'cpu' | 'local' | 'online'
type Difficulty = 'easy' | 'medium' | 'hard'
type PlaySetup =
  | { opponent: 'cpu'; variant: SnookerVariant; difficulty: Difficulty }
  | { opponent: 'local'; variant: SnookerVariant }
  | { opponent: 'online'; match: GameMatch }

type WhotPlay =
  | { mode: 'cpu'; players: number }
  | { mode: 'online'; tableId: string; potLabel: string }

type View =
  | { name: 'home' }
  | { name: 'snooker'; username?: string }
  | { name: 'whot' }
  | { name: 'ttt' }
  | { name: 'whot-lobby'; table: WhotTable }
  | { name: 'whot-play'; play: WhotPlay }
  | { name: 'chess'; username?: string }
  | { name: 'chess-play'; setup: ChessPlaySetup }
  | { name: 'waiting'; match: GameMatch }
  | { name: 'play'; setup: PlaySetup }
  | { name: 'embed'; gameId: EmbeddedGameId }
  | { name: 'ludo' }
  | { name: 'ludo-play'; setup: LudoPlaySetup }
  | { name: 'ludo-lobby'; table: LudoTable }

const naira = (n: number) => `₦${n.toLocaleString()}`
const variantLabel = (v: string) => SNOOKER_VARIANTS.find((x) => x.id === v)?.label ?? (v === 'classic' ? 'Classic' : v)
const GAME_META: Record<string, { emoji: string; name: string }> = {
  snooker: { emoji: '🎱', name: '8 Ball Pool' },
  chess: { emoji: '♟️', name: 'Chess' },
  tictactoe: { emoji: '⭕', name: 'Tic tac toe' },
  ludo: { emoji: '🎲', name: 'Ludo' },
}
const metaOf = (game: string) => GAME_META[game] ?? GAME_META.snooker!
/** Where a live online match is played. */
const liveView = (m: GameMatch): View =>
  m.game === 'chess'
    ? { name: 'chess-play', setup: { opponent: 'online', match: m } }
    : m.game === 'ludo'
      ? { name: 'ludo-play', setup: { mode: 'online', match: m } }
      : { name: 'play', setup: { opponent: 'online', match: m } }

/** Where the in-game chat + voice attaches: the live match or table you are seated at (not vs the computer). */
function chatTarget(view: View): GameChatTarget | null {
  if (view.name === 'play' && view.setup.opponent === 'online') return { kind: 'match', id: view.setup.match.id }
  if (view.name === 'chess-play' && view.setup.opponent === 'online') return { kind: 'match', id: view.setup.match.id }
  if (view.name === 'ludo-play') {
    if (view.setup.mode === 'online') return { kind: 'match', id: view.setup.match.id }
    if (view.setup.mode === 'table') return { kind: 'ludo', id: view.setup.tableId }
  }
  if (view.name === 'whot-play' && view.play.mode === 'online') return { kind: 'whot', id: view.play.tableId }
  if (view.name === 'whot-lobby') return { kind: 'whot', id: view.table.id }
  if (view.name === 'ludo-lobby') return { kind: 'ludo', id: view.table.id }
  return null
}

export function GamesApp({ onHome }: { onHome: () => void }) {
  const [view, setView] = useState<View>({ name: 'home' })
  const target = chatTarget(view)
  return (
    <>
      <GamesScreens onHome={onHome} view={view} setView={setView} />
      {target ? <GameChatDock key={`${target.kind}:${target.id}`} target={target} /> : null}
    </>
  )
}

function GamesScreens({ onHome, view, setView }: { onHome: () => void; view: View; setView: Dispatch<SetStateAction<View>> }) {
  const [matches, setMatches] = useState<GameMatch[]>([])
  const [betLeft, setBetLeft] = useState<number | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const { notifyToast, refreshServer } = useGame()

  const load = useCallback(async () => {
    const res = await fetchMatches()
    if (res.ok) {
      setMatches(res.matches)
      setBetLeft(res.betMatchesLeft)
    }
  }, [])

  const openMatch = useCallback(async (id: string) => {
    const res = await fetchMatch(id)
    if (!res.ok) return setNote(res.error)
    if (res.match.status === 'active') setView(liveView(res.match))
    else if (res.match.status === 'pending') setView({ name: 'waiting', match: res.match })
  }, [])

  // Opened from a pop-up / chat note / profile while the app is already showing
  useEffect(() => {
    const onOpen = () => {
      const open = takePendingGames()
      if (open?.matchId) void openMatch(open.matchId)
      else if (open?.username) setView({ name: 'snooker', username: open.username })
      else setView({ name: 'home' })
    }
    // Whatever asked for the app before it mounted (pop-up Accept, profile Challenge)
    const first = takePendingGames()
    if (first?.matchId) void openMatch(first.matchId)
    else if (first?.username) setView({ name: 'snooker', username: first.username })
    window.addEventListener(OPEN_GAMES_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_GAMES_EVENT, onOpen)
  }, [openMatch])

  useEffect(() => {
    if (view.name !== 'home') return
    void load()
    const id = window.setInterval(load, 10_000)
    return () => window.clearInterval(id)
  }, [view.name, load])

  if (view.name === 'play' && view.setup.opponent === 'online' && view.setup.match.game === 'tictactoe') {
    return (
      <TttOnlineGame
        match={view.setup.match}
        onExit={() => {
          setView({ name: 'home' })
          void refreshServer()
        }}
        notify={notifyToast}
      />
    )
  }
  if (view.name === 'play') {
    return (
      <PlayView
        setup={view.setup}
        onExit={() => {
          setView({ name: 'home' })
          void refreshServer()
        }}
        notify={notifyToast}
      />
    )
  }
  if (view.name === 'chess-play') {
    return (
      <ChessPlayView
        setup={view.setup}
        onExit={() => {
          setView({ name: 'home' })
          void refreshServer()
        }}
        notify={notifyToast}
      />
    )
  }
  if (view.name === 'chess') {
    return (
      <ChessSetup
        key={view.username ?? ''}
        initialUsername={view.username}
        betLeft={betLeft}
        onBack={() => setView({ name: 'home' })}
        onPlay={(setup) => setView({ name: 'chess-play', setup })}
        onWaiting={(m) => setView(m.status === 'active' ? liveView(m) : { name: 'waiting', match: m })}
      />
    )
  }
  if (view.name === 'waiting') {
    return (
      <WaitingView
        match={view.match}
        onBack={() => setView({ name: 'home' })}
        onLive={(m) => setView(liveView(m))}
      />
    )
  }
  if (view.name === 'ludo') {
    return (
      <LudoSetup
        betLeft={betLeft}
        onBack={() => setView({ name: 'home' })}
        onPlay={(setup) => setView({ name: 'ludo-play', setup })}
        onWaiting={(m) => setView(m.status === 'active' ? liveView(m) : { name: 'waiting', match: m })}
        onTable={(table) => setView({ name: 'ludo-lobby', table })}
      />
    )
  }
  if (view.name === 'ludo-lobby') {
    return (
      <LudoLobby
        table={view.table}
        onBack={() => setView({ name: 'ludo' })}
        onLive={(t, label) => setView({ name: 'ludo-play', setup: { mode: 'table', tableId: t.id, potLabel: label } })}
      />
    )
  }
  if (view.name === 'ludo-play') {
    return (
      <LudoPlay
        setup={view.setup}
        onExit={() => {
          setView({ name: 'home' })
          void refreshServer()
        }}
        notify={notifyToast}
      />
    )
  }
  if (view.name === 'embed') {
    const game = EMBEDDED_GAMES.find((g) => g.id === view.gameId)
    if (!game) return null
    return <FullscreenGameFrame game={game} onExit={() => setView({ name: 'home' })} />
  }
  if (view.name === 'whot-play') {
    if (view.play.mode === 'cpu') {
      return (
        <BodyPortal>
          <div className={`${styles.playScreen} ${styles.fullScreen}`}>
            <WhotCpuGame players={view.play.players} onExit={() => setView({ name: 'home' })} notify={notifyToast} />
          </div>
        </BodyPortal>
      )
    }
    return (
      <BodyPortal>
        <div className={`${styles.playScreen} ${styles.fullScreen}`}>
          <WhotOnlineGame
            tableId={view.play.tableId}
            potLabel={view.play.potLabel}
            onExit={() => setView({ name: 'home' })}
            notify={notifyToast}
          />
        </div>
      </BodyPortal>
    )
  }
  if (view.name === 'whot-lobby') {
    return (
      <WhotLobbyView
        table={view.table}
        onBack={() => setView({ name: 'home' })}
        onLive={(t, label) => setView({ name: 'whot-play', play: { mode: 'online', tableId: t.id, potLabel: label } })}
        onTable={setView}
      />
    )
  }
  if (view.name === 'whot') {
    return (
      <WhotSetup
        betLeft={betLeft}
        onBack={() => setView({ name: 'home' })}
        onCpu={(players) => setView({ name: 'whot-play', play: { mode: 'cpu', players } })}
        onLobby={(table) => setView({ name: 'whot-lobby', table })}
      />
    )
  }
  if (view.name === 'ttt') {
    return (
      <TttSetup
        betLeft={betLeft}
        onBack={() => setView({ name: 'home' })}
        onOffline={() => setView({ name: 'embed', gameId: 'tic-tac-toe' })}
        onWaiting={(m) => (m.status === 'active' ? setView({ name: 'play', setup: { opponent: 'online', match: m } }) : setView({ name: 'waiting', match: m }))}
      />
    )
  }
  if (view.name === 'snooker') {
    return (
      <SnookerSetup
        key={view.username ?? ''}
        initialUsername={view.username}
        betLeft={betLeft}
        onBack={() => setView({ name: 'home' })}
        onPlay={(setup) => setView({ name: 'play', setup })}
        onWaiting={(m) => (m.status === 'active' ? setView({ name: 'play', setup: { opponent: 'online', match: m } }) : setView({ name: 'waiting', match: m }))}
      />
    )
  }

  const incoming = matches.filter((m) => m.incoming)
  const sent = matches.filter((m) => m.status === 'pending' && !m.incoming)
  const live = matches.filter((m) => m.status === 'active')

  return (
    <div className={styles.screen}>
      <header className={styles.brand}>
        <BackButton onBack={onHome} label="Back home" />
        <span className={styles.wordmark}>Games</span>
        <span className={styles.tagline}>Play in your phone</span>
      </header>
      {note ? <p className={styles.error}>{note}</p> : null}

      {incoming.length || sent.length || live.length ? (
        <section className={styles.group}>
          <p className={styles.section}>Challenges</p>
          {incoming.map((m) => (
            <div key={m.id} className={styles.card}>
              <span className={styles.cardIcon}>{metaOf(m.game).emoji}</span>
              <span className={styles.cardText}>
                <strong>{m.names[0]} challenged you</strong>
                <span>
                  {metaOf(m.game).name} · {m.game === 'snooker' ? `${variantLabel(m.variant)} · ` : ''}{m.stake ? `${naira(m.stake)} bet` : 'Friendly'}
                </span>
              </span>
              <span className={styles.cardActions}>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={async () => {
                    const res = await acceptMatch(m.id)
                    if (!res.ok) return setNote(res.error)
                    setView(liveView(res.match))
                  }}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={async () => {
                    await closeMatch(m.id)
                    void load()
                  }}
                >
                  Decline
                </button>
              </span>
            </div>
          ))}
          {live.map((m) => (
            <div key={m.id} className={styles.card}>
              <span className={styles.cardIcon}>🟢</span>
              <span className={styles.cardText}>
                <strong>vs @{m.opponent}</strong>
                <span>{metaOf(m.game).name} · {m.stake ? `${naira(m.stake * 2)} pot` : 'Friendly'} · live</span>
              </span>
              <button type="button" className={styles.primary} onClick={() => setView(liveView(m))}>
                Resume
              </button>
            </div>
          ))}
          {sent.map((m) => (
            <div key={m.id} className={styles.card}>
              <span className={styles.cardIcon}>⏳</span>
              <span className={styles.cardText}>
                <strong>{m.opponent ? `Waiting for @${m.opponent}` : 'Finding a player…'}</strong>
                <span>{metaOf(m.game).name} · {m.stake ? `${naira(m.stake)} bet` : 'Friendly'}</span>
              </span>
              <button type="button" className={styles.ghost} onClick={() => setView({ name: 'waiting', match: m })}>
                Open
              </button>
            </div>
          ))}
        </section>
      ) : null}

      <section className={styles.group}>
        <p className={styles.section}>All games</p>
        <button type="button" className={styles.game} onClick={() => setView({ name: 'snooker' })}>
          <span className={styles.gameArt}>🎱</span>
          <span className={styles.cardText}>
            <strong>8 Ball Pool</strong>
            <span>vs computer · pass & play · online</span>
          </span>
          <span className={styles.play}>Play</span>
        </button>
        <button type="button" className={styles.game} onClick={() => setView({ name: 'whot' })}>
          <span className={styles.gameArt}>🃏</span>
          <span className={styles.cardText}>
            <strong>Naija Whot!</strong>
            <span>vs computer · friends · 2–4 players</span>
          </span>
          <span className={styles.play}>Play</span>
        </button>
        {EMBEDDED_GAMES.map((g) => (
          <button
            key={g.id}
            type="button"
            className={styles.game}
            onClick={() => setView(g.id === 'tic-tac-toe' ? { name: 'ttt' } : g.id === 'chess' ? { name: 'chess' } : g.id === 'ludo' ? { name: 'ludo' } : { name: 'embed', gameId: g.id })}
          >
            <span className={styles.gameArt}>{g.emoji}</span>
            <span className={styles.cardText}>
              <strong>{g.name}</strong>
              <span>{g.subtitle}</span>
            </span>
            <span className={styles.play}>Play</span>
          </button>
        ))}
      </section>
    </div>
  )
}

function WhotSetup({
  betLeft,
  onBack,
  onCpu,
  onLobby,
}: {
  betLeft: number | null
  onBack: () => void
  onCpu: (players: number) => void
  onLobby: (table: WhotTable) => void
}) {
  const [mode, setMode] = useState<'cpu' | 'friends'>('cpu')
  const [players, setPlayers] = useState(4)
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [bet, setBet] = useState(false)
  const [stake, setStake] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const amount = bet ? Math.floor(Number(stake.replace(/[^\d]/g, '')) || 0) : 0
  const betInvalid = bet && amount <= 0

  const create = async () => {
    if (betInvalid) return
    setBusy(true)
    setError(null)
    const res = await createWhotTable(maxPlayers, amount)
    setBusy(false)
    if (!res.ok) return setError(res.error)
    onLobby(res.table)
  }
  const join = async () => {
    if (!code.trim()) return
    setBusy(true)
    setError(null)
    const res = await joinWhotTable(code.trim())
    setBusy(false)
    if (!res.ok) return setError(res.error)
    onLobby(res.table)
  }

  return (
    <div className={styles.screen}>
      <div className={styles.backBar}>
        <BackButton onBack={onBack} label="Back" />
        <strong>🃏 Naija Whot!</strong>
        <span className={styles.backSpacer} />
      </div>
      <p className={styles.section}>Mode</p>
      <div className={styles.chips}>
        <button type="button" className={`${styles.chip} ${mode === 'cpu' ? styles.chipOn : ''}`} onClick={() => setMode('cpu')}>
          🤖 Computer
        </button>
        <button type="button" className={`${styles.chip} ${mode === 'friends' ? styles.chipOn : ''}`} onClick={() => setMode('friends')}>
          👥 Friends
        </button>
      </div>
      {mode === 'cpu' ? (
        <>
          <p className={styles.section}>Players</p>
          <div className={styles.chips}>
            {[2, 3, 4].map((n) => (
              <button key={n} type="button" className={`${styles.chip} ${players === n ? styles.chipOn : ''}`} onClick={() => setPlayers(n)}>
                {n}
              </button>
            ))}
          </div>
          <button type="button" className={styles.big} onClick={() => onCpu(players)}>Play vs computer</button>
        </>
      ) : (
        <>
          <p className={styles.section}>Stakes</p>
          <div className={styles.chips}>
            <button type="button" className={`${styles.chip} ${!bet ? styles.chipOn : ''}`} onClick={() => setBet(false)}>Friendly</button>
            <button type="button" className={`${styles.chip} ${bet ? styles.chipOn : ''}`} onClick={() => setBet(true)}>💰 Bet</button>
          </div>
          {bet ? (
            <>
              <input className={styles.input} inputMode="numeric" placeholder="Amount (₦)" value={stake} onChange={(e) => setStake(e.target.value)} />
              <p className={styles.fine}>
                Everyone puts in the same amount; winner takes the full pot.
                {betLeft != null ? ` ${betLeft} bet tables left today.` : ''}
              </p>
            </>
          ) : null}
          <p className={styles.section}>Create table</p>
          <div className={styles.chips}>
            {[2, 3, 4].map((n) => (
              <button key={n} type="button" className={`${styles.chip} ${maxPlayers === n ? styles.chipOn : ''}`} onClick={() => setMaxPlayers(n)}>
                Up to {n}
              </button>
            ))}
          </div>
          <button type="button" className={styles.big} disabled={busy || betInvalid} onClick={() => void create()}>Create & get code</button>
          <p className={styles.section}>Join with code</p>
          <div className={styles.row}>
            <input className={styles.input} placeholder="Code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" />
            <button type="button" className={styles.primary} disabled={busy || !code.trim()} onClick={() => void join()}>Join</button>
          </div>
        </>
      )}
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  )
}

function WhotLobbyView({
  table: initial,
  onBack,
  onLive,
  onTable,
}: {
  table: WhotTable
  onBack: () => void
  onLive: (t: WhotTable, label: string) => void
  onTable: (v: View) => void
}) {
  const [table, setTable] = useState(initial)
  const naira = (n: number) => `₦${n.toLocaleString()}`
  useEffect(() => {
    const id = window.setInterval(async () => {
      const res = await fetchWhotTable(table.id)
      if (!res.ok) return
      setTable(res.table)
      if (res.table.status === 'active') {
        onLive(
          res.table,
          res.table.stake ? `Pot ${naira(res.table.pot)}` : 'Friendly · Online',
        )
      }
    }, 2500)
    return () => window.clearInterval(id)
  }, [table.id, onLive])

  const label = table.stake ? `${naira(table.stake)} each · pot ${naira(table.pot)}` : 'Friendly'
  return (
    <div className={styles.screen}>
      <div className={styles.backBar}>
        <BackButton onBack={onBack} label="Back" />
        <strong>🃏 Lobby</strong>
        <span className={styles.backSpacer} />
      </div>
      <div className={styles.waiting}>
        <strong>Code: {table.code}</strong>
        <span>{label}</span>
        <span>{table.players.length}/{table.maxPlayers} seated</span>
        {table.players.map((p) => (
          <span key={p.seat}>Seat {p.seat + 1}: {p.username}</span>
        ))}
        {table.isHost ? (
          <button
            type="button"
            className={styles.big}
            disabled={table.players.length < 2}
            onClick={async () => {
              const res = await startWhotTable(table.id)
              if (!res.ok) return
              onLive(res.table, res.table.stake ? `Pot ${naira(res.table.pot)}` : 'Friendly · Online')
            }}
          >
            Start game
          </button>
        ) : (
          <span>Waiting for host to start…</span>
        )}
        <button
          type="button"
          className={styles.ghost}
          onClick={async () => {
            await leaveWhotTable(table.id)
            onTable({ name: 'home' })
          }}
        >
          Leave table
        </button>
      </div>
    </div>
  )
}

/* —— Setup: how you want to play —— */
function SnookerSetup({
  initialUsername,
  betLeft,
  onBack,
  onPlay,
  onWaiting,
}: {
  initialUsername?: string
  betLeft: number | null
  onBack: () => void
  onPlay: (setup: PlaySetup) => void
  onWaiting: (match: GameMatch) => void
}) {
  const [mode, setMode] = useState<Mode>(initialUsername ? 'online' : 'cpu')
  const [variant, setVariant] = useState<SnookerVariant>('eight')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [username, setUsername] = useState(initialUsername ?? '')
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
    const res = await challengePlayer(username.trim(), variant, amount)
    setBusy(false)
    if (!res.ok) return setError(res.error)
    onWaiting(res.match)
  }
  const quick = async () => {
    if (betInvalid) return
    setBusy(true)
    setError(null)
    const res = await joinQuickMatch(variant, amount)
    setBusy(false)
    if (!res.ok) return setError(res.error)
    onWaiting(res.match)
  }

  return (
    <div className={styles.screen}>
      <div className={styles.backBar}>
        <BackButton onBack={onBack} label="Back" />
        <strong>🎱 8 Ball Pool</strong>
        <span className={styles.backSpacer} />
      </div>

      <p className={styles.section}>How to play</p>
      <div className={styles.chips}>
        {(
          [
            ['cpu', '🤖', 'Computer'],
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

      <p className={styles.section}>Frame</p>
      <div className={styles.chips}>
        {SNOOKER_VARIANTS.map((v) => (
          <button key={v.id} type="button" className={`${styles.chip} ${variant === v.id ? styles.chipOn : ''}`} onClick={() => setVariant(v.id)}>
            {v.label}
            <small>{v.note}</small>
          </button>
        ))}
      </div>

      {mode === 'cpu' ? (
        <>
          <p className={styles.section}>Computer</p>
          <div className={styles.chips}>
            {(['easy', 'medium', 'hard'] as const).map((d) => (
              <button key={d} type="button" className={`${styles.chip} ${difficulty === d ? styles.chipOn : ''}`} onClick={() => setDifficulty(d)}>
                {d[0]!.toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
          <p className={styles.fine}>Win against the computer for Fun (a few times a day).</p>
          <button type="button" className={styles.big} onClick={() => onPlay({ opponent: 'cpu', variant, difficulty })}>
            Play vs computer
          </button>
        </>
      ) : null}

      {mode === 'local' ? (
        <>
          <p className={styles.fine}>Two players, one phone. Pass it after each turn.</p>
          <button type="button" className={styles.big} onClick={() => onPlay({ opponent: 'local', variant })}>
            Start pass & play
          </button>
        </>
      ) : null}

      {mode === 'online' ? (
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
                Both players put in the same amount; the winner takes the pot.
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
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  )
}

/* —— Waiting for the other player —— */
function WaitingView({ match, onBack, onLive }: { match: GameMatch; onBack: () => void; onLive: (m: GameMatch) => void }) {
  const [current, setCurrent] = useState(match)
  useEffect(() => {
    const id = window.setInterval(async () => {
      const res = await fetchMatch(match.id)
      if (!res.ok) return
      setCurrent(res.match)
      if (res.match.status === 'active') onLive(res.match)
    }, 2500)
    return () => window.clearInterval(id)
  }, [match.id, onLive])
  const closed = current.status !== 'pending' && current.status !== 'active'
  return (
    <div className={styles.screen}>
      <div className={styles.backBar}>
        <BackButton onBack={onBack} label="Back" />
        <strong>{metaOf(current.game).emoji} {metaOf(current.game).name}</strong>
        <span className={styles.backSpacer} />
      </div>
      <div className={styles.waiting}>
        <span className={styles.spinner} aria-hidden="true" />
        <strong>
          {closed
            ? current.status === 'declined'
              ? `@${current.opponent} said no this time`
              : 'This challenge has closed'
            : current.opponent
              ? `Waiting for @${current.opponent}…`
              : 'Finding a player…'}
        </strong>
        <span>
          {current.game === 'snooker' ? `${variantLabel(current.variant)} · ` : ''}{current.stake ? `${naira(current.stake)} bet (held safely)` : 'Friendly'}
        </span>
        {closed && current.stake ? <span>Your {naira(current.stake)} is back in your wallet.</span> : null}
        {!closed ? (
          <button
            type="button"
            className={styles.ghost}
            onClick={async () => {
              await closeMatch(current.id)
              onBack()
            }}
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  )
}

/* —— The game, inside the phone frame —— */
function PlayView({ setup, onExit, notify }: { setup: PlaySetup; onExit: () => void; notify: (text: string, ok?: boolean) => void }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const socket = useRef<WebSocket | null>(null)
  const [opponentAway, setOpponentAway] = useState<number | null>(null)
  const [opponentSeen, setOpponentSeen] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const reported = useRef(false)
  // Latest settled table (ours or theirs), replayed into the game after it (re)loads
  const lastSnap = useRef<unknown>(null)
  const online = setup.opponent === 'online' ? setup.match : null
  const gameVariant = setup.opponent === 'online' ? setup.match.variant : setup.variant

  const toGame = useCallback((msg: Record<string, unknown>) => {
    frame.current?.contentWindow?.postMessage({ target: 'ekpoma-snooker', ...msg }, window.location.origin)
  }, [])

  const init = useCallback(() => {
    if (setup.opponent === 'cpu') {
      const level = setup.difficulty[0]!.toUpperCase() + setup.difficulty.slice(1)
      toGame({ type: 'init', opponent: 'cpu', variant: setup.variant, difficulty: setup.difficulty, names: ['You', 'Computer'], subtitle: `vs Computer · ${level}` })
    } else if (setup.opponent === 'local') {
      toGame({ type: 'init', opponent: 'local', variant: setup.variant, names: ['Player 1', 'Player 2'], subtitle: 'Pass & play' })
    } else {
      const m = setup.match
      toGame({
        type: 'init',
        opponent: 'online',
        variant: m.variant,
        myIndex: m.myIndex,
        names: m.names,
        shotSeconds: 30,
        subtitle: m.stake ? `Pot ${naira(m.stake * 2)} · Online` : 'Friendly · Online',
        seed: m.id,
      })
      if (lastSnap.current) toGame({ type: 'sync', snap: lastSnap.current })
    }
  }, [setup, toGame])

  // Live match: relay shots between the two phones
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
        if (msg.t === 'shot') toGame({ type: 'remoteShot', shot: msg.shot })
        else if (msg.t === 'settled') {
          lastSnap.current = msg.snap
          toGame({ type: 'sync', snap: msg.snap })
        }
        else if (msg.t === 'timeout') toGame({ type: 'remoteTimeout' })
        else if (msg.t === 'presence' || msg.t === 'hello') {
          const here = Boolean(msg.t === 'hello' ? msg.opponentOnline : msg.online)
          if (here) setOpponentSeen(true)
          // They (re)joined while we stayed: our table is the one to follow
          if (here && msg.t === 'presence') toGame({ type: 'snap' })
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

  const report = useCallback(
    async (winner: 'me' | 'opponent', forfeit = false) => {
      if (!online) return
      const res = await reportMatch(online.id, winner, forfeit)
      if (!res.ok) return notify(res.error, false)
      if (res.status === 'finished') {
        const won = res.match.won
        setResult(won ? `You won${online.stake ? ` ${naira(online.stake * 2)}` : ''}! 🏆` : `@${online.opponent} won this one.`)
      } else if (res.status === 'disputed') {
        setResult('Results didn’t match, so both stakes went back.')
      } else {
        setResult('Waiting for the other phone to confirm…')
      }
    },
    [online, notify],
  )

  // Messages from the game
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return
      const m = event.data as Record<string, unknown>
      if (!m || m.source !== 'ekpoma-snooker') return
      if (m.type === 'ready') init()
      else if (m.type === 'exit') onExit()
      else if (m.type === 'shot') socket.current?.send(JSON.stringify({ t: 'shot', shot: m.shot }))
      else if (m.type === 'settled') {
        lastSnap.current = m.snap
        socket.current?.send(JSON.stringify({ t: 'settled', snap: m.snap }))
      }
      else if (m.type === 'timeout') socket.current?.send(JSON.stringify({ t: 'timeout' }))
      else if (m.type === 'over') {
        const winner = Number(m.winner)
        if (setup.opponent === 'cpu') {
          if (winner === 0) {
            void rewardCpuWin().then((res) => {
              if (res.ok && res.rewarded) notify(`You beat the computer! +${res.fun} Fun 🎉`, true)
              else notify('You beat the computer! 🎉', true)
            })
          }
        } else if (online && !reported.current) {
          reported.current = true
          void report(winner === online.myIndex ? 'me' : 'opponent')
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [init, notify, onExit, online, report, setup.opponent])

  // While waiting for the other phone's confirmation, check every few seconds
  useEffect(() => {
    if (!online || !result?.startsWith('Waiting')) return
    const id = window.setInterval(async () => {
      const res = await fetchMatch(online.id)
      if (!res.ok || res.match.status === 'active') return
      setResult(
        res.match.status === 'finished'
          ? res.match.won
            ? `You won${online.stake ? ` ${naira(online.stake * 2)}` : ''}! 🏆`
            : `@${online.opponent} won this one.`
          : 'Results didn’t match, so both stakes went back.',
      )
    }, 3000)
    return () => window.clearInterval(id)
  }, [online, result])

  // Opponent gone: count the seconds; after a minute you can claim the win
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (opponentAway == null) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [opponentAway])
  const awaySeconds = opponentAway == null ? 0 : Math.max(0, Math.floor((now - opponentAway) / 1000))

  // The game draws its own header (title, pot, close / restart). It leaves the phone frame and
  // fills the whole screen while you play, so the table is as big as it can be.
  return (
    <BodyPortal>
    <div className={`${styles.playScreen} ${styles.fullScreen}`}>
      {online && opponentAway != null && !result ? (
        <div className={styles.banner}>
          @{online.opponent} {opponentSeen ? 'left the table' : 'isn’t at the table yet'} ·{' '}
          {awaySeconds < 60 ? `${60 - awaySeconds}s left` : 'you can claim the win'}
          {awaySeconds >= 60 ? (
            <button type="button" className={styles.primary} onClick={() => void report('me', true)}>
              Claim win
            </button>
          ) : null}
        </div>
      ) : null}
      {result ? <div className={styles.banner}>{result}</div> : null}
      <iframe ref={frame} className={styles.frame} src={gameVariant === 'eight' ? '/games/pool/index.html' : '/games/snooker/index.html'} title={gameVariant === 'eight' ? '8 Ball Pool' : 'Snooker'} onLoad={init} />
    </div>
    </BodyPortal>
  )
}
