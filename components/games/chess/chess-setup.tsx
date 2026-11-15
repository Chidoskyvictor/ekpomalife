'use client'

import { ChevronLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { challengePlayer, joinQuickMatch, type GameMatch } from '@/lib/game/games-api'
import { fetchChats, type ChatSummary } from '@/lib/game/hostels-api'
import type { ChessPlaySetup } from './chess-play'
import styles from '@/components/hud/phone/apps/games.module.css'

type Mode = 'learn' | 'cpu' | 'local' | 'online'

/** Chess entry: vs the phone, pass & play, or online (challenge by username / quick match, friendly or a bet). */
export function ChessSetup({
  initialUsername,
  betLeft,
  onBack,
  onPlay,
  onWaiting,
}: {
  initialUsername?: string
  betLeft: number | null
  onBack: () => void
  onPlay: (setup: ChessPlaySetup) => void
  onWaiting: (match: GameMatch) => void
}) {
  const [mode, setMode] = useState<Mode>(initialUsername ? 'online' : 'cpu')
  const [level, setLevel] = useState<'easy' | 'medium' | 'hard'>('medium')
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
    const res = await challengePlayer(username.trim(), 'standard', amount, 'chess')
    setBusy(false)
    if (!res.ok) return setError(res.error)
    onWaiting(res.match)
  }
  const quick = async () => {
    if (betInvalid) return
    setBusy(true)
    setError(null)
    const res = await joinQuickMatch('standard', amount, 'chess')
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
        <strong>♟️ Chess</strong>
        <span className={styles.backSpacer} />
      </div>

      <p className={styles.section}>How to play</p>
      <div className={styles.chips}>
        {(
          [
            ['learn', '🎓', 'Learn'],
            ['cpu', '🤖', 'Phone'],
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

      {mode === 'learn' ? (
        <>
          <p className={styles.fine}>
            New to chess? Short hands-on lessons show how every piece moves, then play a game with a coach who gives hints.
          </p>
          <button type="button" className={styles.big} onClick={() => onPlay({ opponent: 'learn' })}>
            Start learning
          </button>
        </>
      ) : null}

      {mode === 'cpu' ? (
        <>
          <p className={styles.section}>Phone strength</p>
          <div className={styles.chips}>
            {(['easy', 'medium', 'hard'] as const).map((d) => (
              <button key={d} type="button" className={`${styles.chip} ${level === d ? styles.chipOn : ''}`} onClick={() => setLevel(d)}>
                {d[0]!.toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
          <p className={styles.fine}>You play white. Win against the phone for Fun (a few times a day).</p>
          <button type="button" className={styles.big} onClick={() => onPlay({ opponent: 'cpu', level })}>
            Play vs phone
          </button>
        </>
      ) : null}

      {mode === 'local' ? (
        <>
          <p className={styles.fine}>Two players, one phone. Pass it after each move.</p>
          <button type="button" className={styles.big} onClick={() => onPlay({ opponent: 'local' })}>
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
                Both players put in the same amount; the winner takes the pot (a draw gives both back).
                {betLeft != null ? ` ${betLeft} bet match${betLeft === 1 ? '' : 'es'} left today.` : ''}
              </p>
            </>
          ) : null}
          <p className={styles.fine}>10 minutes each on the clock. Run out of time and you lose. Host plays white.</p>

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
