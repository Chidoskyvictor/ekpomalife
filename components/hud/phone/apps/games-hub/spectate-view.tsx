'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiSocketUrl } from '@/lib/game/games-api'
import { watchTicket } from '@/lib/game/games-hub-api'
import { AppHeader } from '../../app-header'
import { gameById } from './game-catalog'
import { naira } from './hub-ui'
import styles from './hub.module.css'

type Info = { id: string; game: string; variant: string; stake: number; names: [string, string] }

const PIECES: Record<string, string> = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚', P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕', K: '♔' }
const LUDO_COLORS = ['#e23d4a', '#16a34a', '#f5b50a', '#1d6fe0']
const LUDO_HOME = 56

type ChessSnap = { fen: string; turn: number; check: boolean; last: { from: string; to: string } | null; over: unknown; clocks?: { w?: number; b?: number } | number[] }
type TttSnap = { board: (string | null)[]; turn: string; round: number; winnerSeat: number | null; line: number[] }
type LudoSnap = { colors: number[]; pos: number[][]; turn: number; dice: number | null; winner: number | null }

function fenBoard(fen: string) {
  const rows = fen.split(' ')[0]!.split('/')
  return rows.map((r) => [...r].flatMap((ch) => (/\d/.test(ch) ? Array<string>(Number(ch)).fill('') : [ch])))
}
const sqName = (r: number, c: number) => `${'abcdefgh'[c]}${8 - r}`

/** Read-only live view of someone else's match. The socket only listens: nothing is ever sent. */
export function SpectateView({ matchId, onBack }: { matchId: string; onBack: () => void }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [online, setOnline] = useState(false)
  const [chess, setChess] = useState<ChessSnap | null>(null)
  const [ttt, setTtt] = useState<TttSnap | null>(null)
  const [ludo, setLudo] = useState<LudoSnap | null>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const lastSnap = useRef<unknown>(null)
  const infoRef = useRef<Info | null>(null)
  const pending = useRef<Record<string, unknown>[]>([])

  const toGame = useCallback((msg: Record<string, unknown>) => {
    frame.current?.contentWindow?.postMessage({ target: 'ekpoma-snooker', ...msg }, window.location.origin)
  }, [])

  const initSnooker = useCallback(() => {
    const m = infoRef.current
    if (!m) return
    toGame({ type: 'init', opponent: 'online', variant: m.variant, myIndex: 1, names: m.names, shotSeconds: 30, subtitle: 'Watching live' })
    if (lastSnap.current) toGame({ type: 'sync', snap: lastSnap.current })
    for (const msg of pending.current.splice(0)) toGame(msg)
  }, [toGame])

  useEffect(() => {
    let stopped = false
    let retry = 0
    let timer: number | undefined
    let ws: WebSocket | null = null
    const connect = async () => {
      const res = await watchTicket(matchId)
      if (stopped) return
      if (!res.ok) {
        // Finished or not found: stop retrying
        setError(res.error)
        return
      }
      infoRef.current = res.match
      setInfo(res.match)
      ws = new WebSocket(apiSocketUrl(`/ws/game?ticket=${encodeURIComponent(res.ticket)}`))
      ws.onopen = () => {
        retry = 0
        setOnline(true)
      }
      ws.onmessage = (event) => {
        let msg: Record<string, unknown>
        try {
          msg = JSON.parse(String(event.data)) as Record<string, unknown>
        } catch {
          return
        }
        if (msg.t === 'chess') setChess(msg as unknown as ChessSnap)
        else if (msg.t === 'ttt') setTtt(msg as unknown as TttSnap)
        else if (msg.t === 'ludo') setLudo(msg as unknown as LudoSnap)
        else if (msg.t === 'settled') {
          lastSnap.current = msg.snap
          toGame({ type: 'sync', snap: msg.snap })
        } else if (msg.t === 'shot') toGame({ type: 'remoteShot', shot: msg.shot })
        else if (msg.t === 'timeout') toGame({ type: 'remoteTimeout' })
      }
      ws.onclose = () => {
        setOnline(false)
        if (!stopped) timer = window.setTimeout(connect, Math.min(10_000, 1500 * ++retry))
      }
    }
    void connect()
    return () => {
      stopped = true
      window.clearTimeout(timer)
      ws?.close()
    }
  }, [matchId, toGame])

  // The snooker table is the real game in an iframe, with a shield over it so nothing can be tapped
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return
      const m = event.data as Record<string, unknown>
      if (m?.source === 'ekpoma-snooker' && m.type === 'ready') initSnooker()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [initSnooker])

  const g = info ? gameById(info.game) : null
  return (
    <div className={styles.spec}>
      <AppHeader
        title={info ? `${info.names[0]} vs ${info.names[1]}` : 'Watch'}
        subtitle={info ? `${g?.name}${info.stake ? ` · pot ${naira(info.stake * 2)}` : ' · friendly'}` : undefined}
        onBack={onBack}
        right={
          online ? (
            <span className={styles.watchBadge}>
              <span className={styles.live} aria-hidden="true" /> LIVE
            </span>
          ) : null
        }
        bar
      />
      <div className={styles.specBody}>
        {error ? (
          <p className={styles.err}>{error}</p>
        ) : !info ? (
          <p className={styles.hint}>Finding the table…</p>
        ) : info.game === 'chess' ? (
          chess ? <ChessBoard snap={chess} names={info.names} /> : <p className={styles.hint}>Waiting for the board…</p>
        ) : info.game === 'tictactoe' ? (
          ttt ? <TttBoard snap={ttt} names={info.names} /> : <p className={styles.hint}>Waiting for the board…</p>
        ) : info.game === 'ludo' ? (
          ludo ? <LudoProgress snap={ludo} names={info.names} /> : <p className={styles.hint}>Waiting for the board…</p>
        ) : (
          <div className={styles.snookerFrame}>
            <iframe ref={frame} src="/games/pool/index.html" title="Live 8 ball pool table" onLoad={initSnooker} />
            <div className={styles.snookerBlock} aria-hidden="true" />
          </div>
        )}
        <p className={styles.hint}>You’re watching. You can’t move pieces or see anyone’s private chat.</p>
      </div>
    </div>
  )
}

function ChessBoard({ snap, names }: { snap: ChessSnap; names: [string, string] }) {
  const rows = fenBoard(snap.fen)
  const last = snap.last ? new Set([snap.last.from, snap.last.to]) : null
  const turnName = names[snap.turn === 0 ? 0 : 1]
  return (
    <>
      <p className={styles.clock}>{snap.over ? 'Game over' : `${turnName} to move${snap.check ? ' · check!' : ''}`}</p>
      <div className={styles.chessBoard} role="img" aria-label="Chess board">
        {rows.flatMap((row, r) =>
          row.map((p, c) => (
            <span
              key={`${r}${c}`}
              className={`${styles.sq} ${(r + c) % 2 ? styles.sqDark : styles.sqLight} ${last?.has(sqName(r, c)) ? styles.sqLast : ''}`}
              style={{ color: p && p === p.toUpperCase() ? '#fff' : '#1a1a1a', textShadow: p && p === p.toUpperCase() ? '0 0 2px #000, 0 1px 1px #000' : 'none' }}
            >
              {p ? PIECES[p.toLowerCase()] : ''}
            </span>
          )),
        )}
      </div>
    </>
  )
}

function TttBoard({ snap, names }: { snap: TttSnap; names: [string, string] }) {
  const win = new Set(snap.line)
  return (
    <>
      <p className={styles.clock}>
        {snap.winnerSeat != null ? `${names[snap.winnerSeat]} wins round ${snap.round}` : `Round ${snap.round} · ${snap.turn === 'X' ? names[0] : names[1]} to play`}
      </p>
      <div className={styles.tttBoard} role="img" aria-label="Tic tac toe board">
        {snap.board.map((c, i) => (
          <span key={i} className={styles.tttCell} style={{ color: c === 'X' ? '#e23d4a' : '#1d6fe0', background: win.has(i) ? 'color-mix(in oklab, var(--ok) 25%, var(--paper))' : undefined }}>
            {c}
          </span>
        ))}
      </div>
    </>
  )
}

function LudoProgress({ snap, names }: { snap: LudoSnap; names: [string, string] }) {
  return (
    <>
      <p className={styles.clock}>
        {snap.winner != null ? `${names[snap.winner] ?? 'Someone'} wins!` : `${names[snap.turn] ?? `Player ${snap.turn + 1}`} to play${snap.dice ? ` · rolled ${snap.dice}` : ''}`}
      </p>
      {snap.pos.map((tokens, seat) => {
        const done = tokens.filter((p) => p === LUDO_HOME).length
        const pct = Math.round((tokens.reduce((s, p) => s + Math.max(0, p + 1), 0) / (4 * (LUDO_HOME + 1))) * 100)
        const color = LUDO_COLORS[snap.colors[seat] ?? seat] ?? '#888'
        return (
          <div key={seat} className={styles.ludoRow}>
            <strong style={{ width: 96, fontSize: 'var(--fs-14)' }}>{names[seat] ?? `Player ${seat + 1}`}</strong>
            <span className={styles.ludoBar}>
              <span className={styles.ludoFill} style={{ width: `${pct}%`, background: color }} />
            </span>
            <span className={styles.hint}>{done}/4 home</span>
          </div>
        )
      })}
    </>
  )
}
