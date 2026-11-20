'use client'

import { useCallback, useEffect, useState } from 'react'
import { Eye } from 'lucide-react'
import { fetchLive, type HubLiveMatch } from '@/lib/game/games-hub-api'
import { gameById } from './game-catalog'
import { Empty, Face, Skeletons, naira } from './hub-ui'
import styles from './hub.module.css'

/** Matches in progress right now. Tap one to spectate, read-only, in real time. */
export function WatchTab({ onWatch, onTables }: { onWatch: (matchId: string) => void; onTables: () => void }) {
  const [matches, setMatches] = useState<HubLiveMatch[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetchLive()
    if (res.ok) setMatches(res.matches)
    else setError(res.error)
  }, [])

  useEffect(() => {
    void load()
    const id = window.setInterval(load, 6000)
    return () => window.clearInterval(id)
  }, [load])

  return (
    <>
      <p className={styles.hint}>Live matches, biggest pots first. Watching is read-only and updates as they play.</p>
      {error ? <p className={styles.err}>{error}</p> : null}
      {matches == null && !error ? <Skeletons /> : null}
      {matches?.length === 0 ? (
        <Empty
          icon="📺"
          title="Nothing live right now"
          text="When two players start a match it shows up here. Host a table to get one going."
          action={
            <button type="button" className={styles.btn} onClick={onTables}>
              See tables
            </button>
          }
        />
      ) : null}
      {matches?.map((m) => {
        const g = gameById(m.game)
        return (
          <div key={m.id} className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.gameTag}>
                <span aria-hidden="true">{g.emoji}</span> {g.name}
              </span>
              <span className={styles.who} />
              <span className={styles.watchBadge}>
                <span className={styles.live} aria-hidden="true" /> LIVE
              </span>
            </div>
            <div className={styles.vs}>
              <span className={styles.side}>
                <Face p={m.players[0]} size={52} />
                <span>@{m.players[0].username}</span>
              </span>
              <span className={styles.vsMark}>VS</span>
              <span className={styles.side}>
                <Face p={m.players[1]} size={52} />
                <span>@{m.players[1].username}</span>
              </span>
            </div>
            <div className={styles.cardFoot}>
              <span className={styles.money}>
                <small>{m.pot ? 'Pot' : 'Friendly'}</small>
                <b className={m.pot ? '' : styles.free}>{m.pot ? naira(m.pot) : 'No stake'}</b>
              </span>
              <button type="button" className={styles.btn} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => onWatch(m.id)}>
                <Eye size={16} aria-hidden="true" />
                Watch{m.watching ? ` · ${m.watching}` : ''}
              </button>
            </div>
          </div>
        )
      })}
    </>
  )
}
