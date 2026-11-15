'use client'

import { ChevronLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { challengePlayer, joinQuickMatch, type GameMatch } from '@/lib/game/games-api'
import { fetchChats, type ChatSummary } from '@/lib/game/hostels-api'
import styles from '@/components/hud/phone/apps/games.module.css'

/** Tic tac toe entry in the Games app: offline (friend / phone) or online with stakes. */
export function TttSetup({
  betLeft,
  onBack,
  onOffline,
  onWaiting,
}: {
  betLeft: number | null
  onBack: () => void
  onOffline: () => void
  onWaiting: (match: GameMatch) => void
}) {
  const [mode, setMode] = useState<'offline' | 'online'>('offline')
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

  const go = async (run: () => ReturnType<typeof challengePlayer>) => {
    if (betInvalid) return
    setBusy(true)
    setError(null)
    const res = await run()
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
        <strong>⭕ Tic tac toe</strong>
        <span className={styles.backSpacer} />
      </div>

      <p className={styles.section}>How to play</p>
      <div className={styles.chips}>
        <button type="button" className={`${styles.chip} ${mode === 'offline' ? styles.chipOn : ''}`} onClick={() => setMode('offline')}>
          <span>👥</span>
          Friend or phone
        </button>
        <button type="button" className={`${styles.chip} ${mode === 'online' ? styles.chipOn : ''}`} onClick={() => setMode('online')}>
          <span>🌐</span>
          Online
        </button>
      </div>

      {mode === 'offline' ? (
        <>
          <p className={styles.fine}>Pass &amp; play with a friend, or take on the phone.</p>
          <button type="button" className={styles.big} onClick={onOffline}>
            Play
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
                Both players put in the same amount; the winner takes the pot. A drawn round is replayed until someone wins.
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
            <button
              type="button"
              className={styles.primary}
              disabled={busy || !username.trim() || betInvalid}
              onClick={() => void go(() => challengePlayer(username.trim(), 'standard', amount, 'tictactoe'))}
            >
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
          <button type="button" className={styles.big} disabled={busy || betInvalid} onClick={() => void go(() => joinQuickMatch('standard', amount, 'tictactoe'))}>
            Quick match
          </button>
        </>
      )}
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  )
}
