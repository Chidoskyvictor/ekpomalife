'use client'

import { useEffect, useState } from 'react'
import { fetchChart, type ChartEntry, type ChartPeriod } from '@/lib/game/games-hub-api'
import { HUB_GAMES } from './game-catalog'
import { Empty, Face, Skeletons, naira } from './hub-ui'
import styles from './hub.module.css'

type Chart = { entries: ChartEntry[]; me: ChartEntry | null; myGames: number; minGames: number }

const medal = (rank: number) => (rank === 1 ? styles.gold : rank === 2 ? styles.silver : rank === 3 ? styles.bronze : '')

function Row({ e, pinned }: { e: ChartEntry; pinned?: boolean }) {
  return (
    <div className={`${styles.rank} ${e.me ? styles.rankMe : ''}`}>
      <span className={`${styles.rankNo} ${pinned ? '' : medal(e.rank)}`}>{e.rank}</span>
      <Face p={e} size={40} />
      <span className={styles.who}>
        <strong>{e.me ? 'You' : e.displayName}</strong>
        <span>
          {e.winRate}% win · {e.games} played
        </span>
      </span>
      <span className={styles.stats}>
        <b>{e.wins} {e.wins === 1 ? 'win' : 'wins'}</b>
        <span>{e.won ? naira(e.won) : `${e.games} played`}</span>
      </span>
    </div>
  )
}

/** Per-game leaderboards: wins against real players, tiebreak money won. */
export function ChartsTab({ initialGame, onGame }: { initialGame: string; onGame: (id: string) => void }) {
  const [game, setGame] = useState(initialGame)
  const [period, setPeriod] = useState<ChartPeriod>('week')
  const [chart, setChart] = useState<Chart | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setChart(null)
    setError(null)
    void fetchChart(game, period).then((res) => {
      if (!alive) return
      if (res.ok) setChart(res)
      else setError(res.error)
    })
    return () => {
      alive = false
    }
  }, [game, period])

  const meOnList = chart?.me
  return (
    <>
      <div className={styles.chips} role="tablist" aria-label="Game">
        {HUB_GAMES.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={game === g.id}
            className={`${styles.pill} ${game === g.id ? styles.pillOn : ''}`}
            onClick={() => {
              setGame(g.id)
              onGame(g.id)
            }}
          >
            <span aria-hidden="true">{g.emoji}</span> {g.name}
          </button>
        ))}
      </div>
      <div className={styles.seg} role="tablist" aria-label="Period">
        <button type="button" role="tab" aria-selected={period === 'week'} className={`${styles.segBtn} ${period === 'week' ? styles.segOn : ''}`} onClick={() => setPeriod('week')}>
          This week
        </button>
        <button type="button" role="tab" aria-selected={period === 'all'} className={`${styles.segBtn} ${period === 'all' ? styles.segOn : ''}`} onClick={() => setPeriod('all')}>
          All time
        </button>
      </div>
      <p className={styles.hint}>
        Ranked by wins against real players, then money won. {period === 'week' ? 'Resets every Monday 12am (Lagos). ' : ''}
        Play {chart?.minGames ?? 5}+ games to appear. Only 3 wins a day over the same player count.
      </p>
      {error ? <p className={styles.err}>{error}</p> : null}
      {!chart && !error ? <Skeletons n={4} /> : null}
      {chart && !chart.entries.length ? (
        <Empty
          icon="🏆"
          title={period === 'week' ? 'Nobody ranked yet this week' : 'No ranked players yet'}
          text={`Win games against real players to take the top spot. You need ${chart.minGames} games to appear.`}
        />
      ) : null}
      {chart?.entries.map((e) => <Row key={e.username} e={e} />)}
      {chart ? (
        <div className={styles.pinned}>
          {meOnList ? (
            <Row e={meOnList} pinned />
          ) : (
            <div className={`${styles.rank} ${styles.rankMe}`}>
              <span className={styles.rankNo}>–</span>
              <span className={styles.who}>
                <strong>Your rank</strong>
                <span>
                  {chart.myGames >= chart.minGames
                    ? 'Win a game to get on the board'
                    : `Play ${chart.minGames - chart.myGames} more game${chart.minGames - chart.myGames === 1 ? '' : 's'} to get ranked`}
                </span>
              </span>
              <span className={styles.stats}>
                <b>
                  {Math.min(chart.myGames, chart.minGames)}/{chart.minGames}
                </b>
                <span>games</span>
              </span>
            </div>
          )}
        </div>
      ) : null}
    </>
  )
}
