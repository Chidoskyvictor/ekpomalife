'use client'

import { useEffect, useMemo, useState } from 'react'
import { Eye, Gamepad2, Search, Trophy, Users } from 'lucide-react'
import { hapticTap } from '@/components/hud/haptic'
import { useGame } from '@/hooks/use-game'
import type { GameMatch } from '@/lib/game/games-api'
import { fetchLive, fetchSummary, fetchTables, type GameSummary, type HubLiveMatch, type HubTable } from '@/lib/game/games-hub-api'
import { BackButton } from '../../app-header'
import { ChartsTab } from './charts-tab'
import { HUB_GAMES, gameById, type HubGameId } from './game-catalog'
import { Empty, Face, naira } from './hub-ui'
import { TablesTab } from './tables-tab'
import { WatchTab } from './watch-tab'
import styles from './hub.module.css'

export type HubTabId = 'games' | 'charts' | 'tables' | 'watch' | 'search'

const TABS: { id: HubTabId; label: string; title?: string; Icon: typeof Gamepad2 }[] = [
  { id: 'games', label: 'Games', Icon: Gamepad2 },
  { id: 'charts', label: 'Charts', title: 'Top Charts', Icon: Trophy },
  { id: 'tables', label: 'Tables', Icon: Users },
  { id: 'watch', label: 'Watch', Icon: Eye },
  { id: 'search', label: 'Search', Icon: Search },
]

export type HubProps = {
  tab: HubTabId
  setTab: (tab: HubTabId) => void
  onBack: () => void
  /** Open a game's own start screen (computer, friends, online) */
  onPlay: (id: HubGameId) => void
  /** Jump into a live match you are in */
  onMatch: (matchId: string) => void
  onWatch: (matchId: string) => void
  onChallenge: (username: string) => void
  /** Challenges, live and waiting matches that belong to you */
  matches: GameMatch[]
  onAccept: (m: GameMatch) => void
  onDecline: (m: GameMatch) => void
  onOpenWaiting: (m: GameMatch) => void
  note: string | null
}

const countText = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`

export function GamesHub(props: HubProps) {
  const { tab, setTab, onBack } = props
  const { notifyToast, state } = useGame()
  const [hostOpen, setHostOpen] = useState(false)
  const [chartGame, setChartGame] = useState<string>('snooker')
  const incoming = props.matches.filter((m) => m.incoming).length

  return (
    <div className={styles.hub}>
      <header className={styles.top}>
        <BackButton onBack={onBack} label="Back home" />
        <h2 className={styles.title}>{TABS.find((t) => t.id === tab)?.title ?? TABS.find((t) => t.id === tab)?.label}</h2>
        {state?.cash != null ? <span className={styles.chip}>{naira(state.cash)}</span> : null}
      </header>
      <div className={styles.body}>
        {props.note ? <p className={styles.err}>{props.note}</p> : null}
        {tab === 'games' ? <GamesTab {...props} onHost={() => { setTab('tables'); setHostOpen(true) }} /> : null}
        {tab === 'charts' ? <ChartsTab initialGame={chartGame} onGame={setChartGame} /> : null}
        {tab === 'tables' ? <TablesTab onMatch={props.onMatch} notify={notifyToast} hostOpen={hostOpen} setHostOpen={setHostOpen} /> : null}
        {tab === 'watch' ? <WatchTab onWatch={props.onWatch} onTables={() => setTab('tables')} /> : null}
        {tab === 'search' ? <SearchTab {...props} /> : null}
      </div>
      <nav className={styles.nav} aria-label="Games sections">
        {TABS.map(({ id, label, title, Icon }) => (
          <button
            key={id}
            type="button"
            className={`${styles.navBtn} ${tab === id ? styles.navOn : ''}`}
            aria-label={title}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => {
              hapticTap()
              setTab(id)
            }}
          >
            <Icon size={22} strokeWidth={tab === id ? 2.6 : 2} aria-hidden="true" />
            {label}
            {id === 'games' && incoming ? <span className={styles.dot}>{incoming}</span> : null}
          </button>
        ))}
      </nav>
    </div>
  )
}

function useSummary() {
  const [summary, setSummary] = useState<Record<string, GameSummary>>({})
  useEffect(() => {
    let alive = true
    const load = () =>
      void fetchSummary().then((res) => {
        if (alive && res.ok) setSummary(res.games)
      })
    load()
    const id = window.setInterval(load, 15_000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [])
  return summary
}

const metaOf = (game: string) => gameById(game)

function GamesTab({ matches, onPlay, onHost, onMatch, onAccept, onDecline, onOpenWaiting }: HubProps & { onHost: () => void }) {
  const summary = useSummary()
  const incoming = matches.filter((m) => m.incoming)
  const live = matches.filter((m) => m.status === 'active')
  const waiting = matches.filter((m) => m.status === 'pending' && !m.incoming)

  return (
    <>
      {incoming.map((m) => (
        <div key={m.id} className={styles.mine}>
          <span className={styles.mineEmoji} aria-hidden="true">{metaOf(m.game).emoji}</span>
          <span className={styles.mineText}>
            <strong>{m.names[0]} challenged you</strong>
            <span>{metaOf(m.game).name} · {m.stake ? `${naira(m.stake)} bet` : 'Friendly'}</span>
          </span>
          <button type="button" className={styles.btnGhost} onClick={() => onDecline(m)}>No</button>
          <button type="button" className={styles.btnOk} onClick={() => onAccept(m)}>Accept</button>
        </div>
      ))}
      {live.map((m) => (
        <div key={m.id} className={styles.mine}>
          <span className={styles.live} aria-hidden="true" />
          <span className={styles.mineText}>
            <strong>Your match vs @{m.opponent}</strong>
            <span>{metaOf(m.game).name} · {m.stake ? `${naira(m.stake * 2)} pot` : 'Friendly'}</span>
          </span>
          <button type="button" className={styles.btn} onClick={() => onMatch(m.id)}>Play</button>
        </div>
      ))}
      {waiting.map((m) => (
        <div key={m.id} className={styles.mine}>
          <span className={styles.mineEmoji} aria-hidden="true">⏳</span>
          <span className={styles.mineText}>
            <strong>{m.opponent ? `Waiting for @${m.opponent}` : m.kind === 'hosted' ? 'Your table is posted' : 'Finding a player…'}</strong>
            <span>{metaOf(m.game).name} · {m.stake ? naira(m.stake) : 'Friendly'}</span>
          </span>
          <button type="button" className={styles.btnGhost} onClick={() => onOpenWaiting(m)}>Open</button>
        </div>
      ))}
      {HUB_GAMES.map((g) => {
        const s = summary[g.id]
        const online = s?.playing ?? 0
        return (
          <article key={g.id} className={styles.gameCard} style={{ ['--card-bg' as string]: `linear-gradient(160deg, ${g.from}, ${g.to})` }}>
            <div className={styles.gameArt}>{g.art()}</div>
            {g.hostable ? (
              <button type="button" className={styles.hostLink} onClick={onHost}>
                + Host table
              </button>
            ) : null}
            <div className={styles.gameInfo}>
              <span className={styles.gameText}>
                <span className={styles.gameName}>{g.name}</span>
                <span className={styles.gameStat}>
                  {online ? <span className={styles.live} aria-hidden="true" /> : null}
                  {online ? countText(online, 'playing', 'playing') : g.tagline}
                  {s?.tables ? ` · ${countText(s.tables, 'table')}` : ''}
                </span>
                {s?.players ? <span className={styles.gameStat}>{countText(s.players, 'player')} this week</span> : null}
              </span>
              <button type="button" className={styles.playBtn} onClick={() => { hapticTap(); onPlay(g.id) }}>
                Play
              </button>
            </div>
          </article>
        )
      })}
    </>
  )
}

function SearchTab({ onPlay, onWatch, onChallenge, onMatch, setTab }: HubProps) {
  const [q, setQ] = useState('')
  const [tables, setTables] = useState<HubTable[]>([])
  const [live, setLive] = useState<HubLiveMatch[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const { notifyToast } = useGame()

  useEffect(() => {
    void fetchTables().then((r) => r.ok && setTables(r.tables))
    void fetchLive().then((r) => r.ok && setLive(r.matches))
  }, [])

  const term = q.trim().toLowerCase().replace(/^@/, '')
  const games = useMemo(() => HUB_GAMES.filter((g) => !term || g.name.toLowerCase().includes(term) || g.tagline.toLowerCase().includes(term)), [term])
  const tableHits = tables.filter((t) => term && (t.host.username.toLowerCase().includes(term) || t.host.displayName.toLowerCase().includes(term) || gameById(t.game).name.toLowerCase().includes(term)))
  const liveHits = live.filter((m) => term && (m.players.some((p) => p.username.toLowerCase().includes(term)) || gameById(m.game).name.toLowerCase().includes(term)))

  const sit = async (t: HubTable) => {
    setBusy(t.id)
    const { sitAtTable } = await import('@/lib/game/games-hub-api')
    const res = await sitAtTable(t.id)
    setBusy(null)
    if (!res.ok) return notifyToast(res.error, false)
    onMatch(res.matchId)
  }

  return (
    <>
      <label className={styles.search}>
        <Search size={20} aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search games, players, tables" aria-label="Search games, players and tables" autoComplete="off" />
      </label>
      {!term ? (
        <>
          <p className={styles.label}>Popular</p>
          <div className={styles.chips}>
            {HUB_GAMES.map((g) => (
              <button key={g.id} type="button" className={styles.pill} onClick={() => setQ(g.name)}>
                <span aria-hidden="true">{g.emoji}</span> {g.name}
              </button>
            ))}
          </div>
          <p className={styles.hint}>Type a game, or a player’s @handle to find their tables, their live match, or to challenge them.</p>
        </>
      ) : null}
      {term && (q.trim().startsWith('@') || !games.length) ? (
        <button type="button" className={styles.mine} onClick={() => onChallenge(term)} style={{ textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer' }}>
          <span className={styles.mineEmoji} aria-hidden="true">⚔️</span>
          <span className={styles.mineText}>
            <strong>Challenge @{term}</strong>
            <span>Send a match request, friendly or with a stake</span>
          </span>
        </button>
      ) : null}
      {games.length ? (
        <>
          <h3 className={styles.section}>Games</h3>
          {games.map((g) => (
            <button key={g.id} type="button" className={styles.rank} style={{ border: 0, font: 'inherit', color: 'inherit', textAlign: 'left' }} onClick={() => onPlay(g.id)}>
              <span style={{ fontSize: 28 }} aria-hidden="true">{g.emoji}</span>
              <span className={styles.who}>
                <strong>{g.name}</strong>
                <span>{g.tagline}</span>
              </span>
              <span className={styles.gameTag}>Play</span>
            </button>
          ))}
        </>
      ) : null}
      {tableHits.length ? (
        <>
          <h3 className={styles.section}>Open tables</h3>
          {tableHits.map((t) => (
            <div key={t.id} className={styles.rank}>
              <Face p={t.host} size={40} />
              <span className={styles.who}>
                <strong>@{t.host.username}</strong>
                <span>{gameById(t.game).name} · {t.stake ? `winner takes ${naira(t.pot)}` : 'friendly'}</span>
              </span>
              {t.mine ? null : (
                <button type="button" className={styles.btnOk} disabled={busy === t.id} onClick={() => void sit(t)}>
                  Sit
                </button>
              )}
            </div>
          ))}
        </>
      ) : null}
      {liveHits.length ? (
        <>
          <h3 className={styles.section}>Live now</h3>
          {liveHits.map((m) => (
            <div key={m.id} className={styles.rank}>
              <Face p={m.players[0]} size={36} />
              <span className={styles.who}>
                <strong>@{m.players[0].username} vs @{m.players[1].username}</strong>
                <span>{gameById(m.game).name} · {m.pot ? naira(m.pot) : 'friendly'}</span>
              </span>
              <button type="button" className={styles.btn} onClick={() => onWatch(m.id)}>Watch</button>
            </div>
          ))}
        </>
      ) : null}
      {term && !games.length && !tableHits.length && !liveHits.length ? (
        <Empty
          icon="🔍"
          title="Nothing found"
          text="No game, table or live match matches that. Try a game name, or challenge them directly above."
          action={
            <button type="button" className={styles.btn} onClick={() => setTab('tables')}>
              Host a table
            </button>
          }
        />
      ) : null}
    </>
  )
}
