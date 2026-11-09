'use client'

import { useEffect, useState } from 'react'
import { PlayerFace } from '@/components/look/player-face'
import { useGame } from '@/hooks/use-game'
import { fetchForbes, podiumOrder, updatedLabel, type ForbesBoard, type ForbesEntry } from '@/lib/game/forbes'
import { openDirectChat } from '@/lib/game/hostels-api'
import { compactNaira } from '@/lib/game/live'
import { requestOpenChat } from '@/lib/game/open-chat'
import styles from './forbes.module.css'

const BLOCK = { 1: styles.gold, 2: styles.silver, 3: styles.bronze } as const

/** Phone → Forbes: the richest players in Ekpoma Life (admins are never listed), your own rank pinned below. */
export function ForbesApp() {
  const { notifyToast } = useGame()
  const [board, setBoard] = useState<ForbesBoard | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void fetchForbes().then((res) => {
      if (!live) return
      if (res.ok) setBoard(res)
      else setError(res.error)
    })
    return () => {
      live = false
    }
  }, [])

  const message = async (entry: ForbesEntry) => {
    if (board?.me?.userId === entry.userId) return
    const res = await openDirectChat(entry.userId)
    if (!res.ok) {
      notifyToast(res.error)
      return
    }
    requestOpenChat(res.chat)
  }

  if (error) return <div className={styles.root}><p className={styles.note}>{error}</p></div>
  if (!board) return <div className={styles.root}><p className={styles.note}>Counting the money…</p></div>

  const rest = board.top.slice(3)
  return (
    <div className={styles.root}>
      <div className={styles.scroll}>
        <h2 className={styles.title}>Ekpoma Forbes</h2>
        <p className={styles.sub}>The richest in Ekpoma Life · {board.total.toLocaleString()} players ranked</p>
        <p className={styles.fresh}>{updatedLabel(board.updatedAt)}</p>
        {board.top.length === 0 ? <p className={styles.note}>Nobody is ranked yet.</p> : null}
        <div className={styles.podium}>
          {podiumOrder(board.top).map((e) => (
            <button key={e.userId} type="button" className={styles.pCol} onClick={() => void message(e)} aria-label={`#${e.rank} @${e.username}`}>
              {e.rank === 1 ? <span className={styles.crown} aria-hidden="true">👑</span> : null}
              <PlayerFace look={e.appearance} color={e.avatarColor} label={e.username} size={e.rank === 1 ? 64 : 52} />
              <span className={styles.pName}>@{e.username}</span>
              <span className={styles.pWorth}>{compactNaira(e.netWorth)}</span>
              <span className={`${styles.block} ${BLOCK[e.rank as 1 | 2 | 3]}`}>{e.rank}</span>
            </button>
          ))}
        </div>
        <ul className={styles.list}>
          {rest.map((e) => (
            <li key={e.userId}>
              <button type="button" className={styles.row} onClick={() => void message(e)}>
                <span className={styles.rank}>{e.rank}</span>
                <PlayerFace look={e.appearance} color={e.avatarColor} label={e.username} size={36} />
                <span className={styles.who}>
                  <span className={styles.name}>@{e.username}</span>
                  <span className={styles.detail}>{e.detail}</span>
                </span>
                <span className={styles.worth}>{compactNaira(e.netWorth)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {board.me ? (
        <div className={styles.me}>
          <span>Your rank #{board.me.rank} of {board.total.toLocaleString()}</span>
          <span className={styles.meWorth}>{compactNaira(board.me.netWorth)}</span>
        </div>
      ) : null}
    </div>
  )
}
