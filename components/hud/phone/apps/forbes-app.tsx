'use client'

import { X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { BodyPortal } from '@/components/ui/body-portal'
import { PlayerFace } from '@/components/look/player-face'
import { useGame } from '@/hooks/use-game'
import { fetchForbes, FORBES_PAGE, meLabel, mergePage, podiumOrder, updatedLabel, type ForbesEntry } from '@/lib/game/forbes'
import { openDirectChat } from '@/lib/game/hostels-api'
import { compactNaira } from '@/lib/game/live'
import { requestOpenChat } from '@/lib/game/open-chat'
import styles from './forbes.module.css'

const RING = { 1: styles.gold, 2: styles.silver, 3: styles.bronze } as const

/** Draws the real face only while the row is near the screen; a letter circle otherwise (keeps 1,000+ rows light). */
function LazyFace({ e, size }: { e: ForbesEntry; size: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setNear(true)
      return
    }
    const io = new IntersectionObserver(([hit]) => setNear(!!hit?.isIntersecting), { rootMargin: '300px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <span ref={ref} className={styles.faceSlot} style={{ width: size, height: size }}>
      <PlayerFace look={near ? e.appearance : null} color={e.avatarColor} label={e.username} size={size} />
    </span>
  )
}

/** Phone → Forbes: full-screen scoreboard of every ranked player (admins are never listed). */
export function ForbesApp({ onClose }: { onClose: () => void }) {
  const { notifyToast } = useGame()
  const [entries, setEntries] = useState<ForbesEntry[]>([])
  const [total, setTotal] = useState(0)
  const [me, setMe] = useState<ForbesEntry | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [scrollTo, setScrollTo] = useState<string | null>(null)
  const busy = useRef(false)
  const nextOffset = useRef(0)
  const sentinel = useRef<HTMLDivElement>(null)
  const alive = useRef(true)

  const loadMore = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    const res = await fetchForbes(nextOffset.current)
    busy.current = false
    if (!alive.current) return
    if (!res.ok) {
      setError(res.error)
      return
    }
    nextOffset.current += FORBES_PAGE
    setEntries((shown) => mergePage(shown, res.entries))
    setTotal(res.total)
    setMe(res.me)
    setUpdatedAt(res.updatedAt)
    setLoaded(true)
  }, [])

  useEffect(() => {
    alive.current = true
    void loadMore()
    return () => {
      alive.current = false
    }
  }, [loadMore])

  const hasMore = loaded && entries.length < total

  // Next page when the bottom comes near
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasMore) return
    const io = new IntersectionObserver(([hit]) => hit?.isIntersecting && void loadMore(), { rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, loadMore, entries.length])

  // "You" bar: load pages until our row exists, then scroll to it
  useEffect(() => {
    if (!scrollTo) return
    const row = document.getElementById(`forbes-${scrollTo}`)
    if (row) {
      row.scrollIntoView({ block: 'center', behavior: 'smooth' })
      setScrollTo(null)
    } else if (hasMore) void loadMore()
    else setScrollTo(null)
  }, [scrollTo, entries, hasMore, loadMore])

  const message = async (entry: ForbesEntry) => {
    if (me?.userId === entry.userId) return
    const res = await openDirectChat(entry.userId)
    if (!res.ok) {
      notifyToast(res.error)
      return
    }
    onClose()
    requestOpenChat(res.chat)
  }

  const top3 = entries.slice(0, 3)
  const rest = entries.slice(3)

  return (
    <BodyPortal>
      <div className={styles.root} role="dialog" aria-label="Richest in Ekpoma">
        <header className={styles.head}>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <X size={22} />
          </button>
          <div className={styles.headText}>
            <h2 className={styles.title}>Richest in Ekpoma</h2>
            <p className={styles.sub}>
              {loaded ? `${total.toLocaleString()} players · ${updatedLabel(updatedAt).replace('Updated ', 'updated ')}` : 'Counting the money…'}
            </p>
          </div>
        </header>
        <div className={styles.scroll}>
          {error ? <p className={styles.note}>{error}</p> : null}
          {loaded && entries.length === 0 ? <p className={styles.note}>Nobody is ranked yet.</p> : null}
          <div className={styles.top3}>
            {podiumOrder(top3).map((e) => (
              <button key={e.userId} id={`forbes-${e.userId}`} type="button" className={`${styles.card} ${e.rank === 1 ? styles.first : ''}`} onClick={() => void message(e)} aria-label={`#${e.rank} @${e.username}`}>
                {e.rank === 1 ? <span className={styles.crown} aria-hidden="true">👑</span> : null}
                <span className={`${styles.ring} ${RING[e.rank as 1 | 2 | 3]}`}>
                  <PlayerFace look={e.appearance} color={e.avatarColor} label={e.username} size={e.rank === 1 ? 72 : 60} />
                </span>
                <span className={styles.cName}>@{e.username}</span>
                <span className={styles.cDetail}>{e.detail}</span>
                <span className={styles.cWorth}>{compactNaira(e.netWorth)}</span>
              </button>
            ))}
          </div>
          <ul className={styles.list}>
            {rest.map((e) => (
              <li key={e.userId} id={`forbes-${e.userId}`}>
                <button type="button" className={`${styles.row} ${me?.userId === e.userId ? styles.mine : ''}`} onClick={() => void message(e)}>
                  <span className={styles.rank}>{e.rank}</span>
                  <LazyFace e={e} size={40} />
                  <span className={styles.who}>
                    <span className={styles.name}>@{e.username}</span>
                    <span className={styles.detail}>{e.detail}</span>
                  </span>
                  <span className={styles.worth}>{compactNaira(e.netWorth)}</span>
                </button>
              </li>
            ))}
          </ul>
          <div ref={sentinel} className={styles.sentinel}>{hasMore ? 'Loading more…' : ''}</div>
        </div>
        {me ? (
          <button type="button" className={styles.me} onClick={() => setScrollTo(me.userId)}>
            {meLabel(me.rank, total, compactNaira(me.netWorth))}
          </button>
        ) : null}
      </div>
    </BodyPortal>
  )
}
