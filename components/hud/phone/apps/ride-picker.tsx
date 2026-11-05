'use client'

import { ChevronLeft, Clock, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import { placeInfo } from '@/lib/game/place-info'
import { isPlaceOpen, PLACES, type Place } from '@/lib/game/places'
import styles from './ride-picker.module.css'

const TYPE: Record<string, { emoji: string; title: string; order: number; tint: string }> = {
  home: { emoji: '🏠', title: 'Home', order: 0, tint: '#e0ecff' },
  campus: { emoji: '🎓', title: 'Campus', order: 1, tint: '#e8e6ff' },
  hostel: { emoji: '🛏️', title: 'Hostels', order: 2, tint: '#e6f4ff' },
  food: { emoji: '🍲', title: 'Food', order: 3, tint: '#fff1e0' },
  shop: { emoji: '🛒', title: 'Shops', order: 4, tint: '#ffe8f0' },
  leisure: { emoji: '🎉', title: 'Fun', order: 5, tint: '#f3e8ff' },
  worship: { emoji: '⛪', title: 'Worship', order: 6, tint: '#eef2f7' },
  community: { emoji: '🏥', title: 'Around town', order: 7, tint: '#e7f8ef' },
  transport: { emoji: '🛺', title: 'Around town', order: 7, tint: '#e7f8ef' },
}
const typeOf = (p: Place) => (p.id === 'home' ? TYPE.home! : (TYPE[p.type] ?? TYPE.community!))

const RECENT_KEY = 'ekpoma-ride-recent-v1'

function readRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string').slice(0, 3) : []
  } catch {
    return []
  }
}

/** Remember a destination (newest first, three kept). */
export function rememberRide(placeId: string) {
  try {
    const next = [placeId, ...readRecent().filter((id) => id !== placeId)].slice(0, 3)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* storage blocked */
  }
}

type Row = { place: Place; name: string; sub: string; open: boolean }

/** Places with the same name get a number ("Shop 2") so every row is its own place. */
export function rideRows(gameTime: number): Row[] {
  const seen = new Map<string, number>()
  return PLACES.map((place) => {
    const n = (seen.get(place.label) ?? 0) + 1
    seen.set(place.label, n)
    const name = n > 1 ? `${place.label} ${n}` : place.label
    const area = place.id === 'home' ? 'Your place' : (placeInfo(place.id)?.area ?? 'Ekpoma')
    return { place, name, sub: area, open: isPlaceOpen(place, gameTime) }
  })
}

/**
 * "Where to?": a full page inside the phone with search, Recent at the top and every place in
 * sections (Campus, Hostels, Food…), each with whether it's open now. Tap a row to pick it.
 */
export function RidePicker({ value, onPick, onClose }: { value: string; onPick: (placeId: string) => void; onClose: () => void }) {
  const { state } = useGame()
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const rows = useMemo(() => rideRows(state?.gameTime ?? 12 * 60), [state?.gameTime])
  const recent = useMemo(() => readRecent().map((id) => rows.find((r) => r.place.id === id)).filter((r): r is Row => !!r), [rows])

  useEffect(() => {
    // Focus after the slide-in so the keyboard doesn't jump the page on phones
    const id = window.setTimeout(() => input.current?.focus({ preventScroll: true }), 220)
    return () => window.clearTimeout(id)
  }, [])

  const q = query.trim().toLowerCase()
  const matches = q ? rows.filter((r) => `${r.name} ${r.sub} ${typeOf(r.place).title}`.toLowerCase().includes(q)) : rows
  const sections = useMemo(() => {
    const by = new Map<string, Row[]>()
    for (const r of matches) {
      const t = typeOf(r.place).title
      by.set(t, [...(by.get(t) ?? []), r])
    }
    return [...by.entries()].sort((a, b) => (typeOf(a[1][0]!.place).order ?? 9) - (typeOf(b[1][0]!.place).order ?? 9))
  }, [matches])

  const pick = (id: string) => {
    rememberRide(id)
    onPick(id)
  }

  const row = (r: Row, recentRow = false) => {
    const t = typeOf(r.place)
    return (
      <li key={(recentRow ? 'r-' : '') + r.place.id}>
        <button type="button" className={`${styles.row} ${value === r.place.id ? styles.rowOn : ''}`} onClick={() => pick(r.place.id)}>
          <span className={styles.tile} style={{ background: t.tint }} aria-hidden="true">
            {recentRow ? <Clock size={18} color="#64748b" /> : t.emoji}
          </span>
          <span className={styles.text}>
            <strong>{r.name}</strong>
            <span>{r.sub}</span>
          </span>
          {r.place.openHours ? <span className={`${styles.tag} ${r.open ? styles.tagOpen : styles.tagShut}`}>{r.open ? 'Open' : 'Closed'}</span> : null}
        </button>
      </li>
    )
  }

  return (
    <div className={styles.page} role="dialog" aria-label="Where to?">
      <div className={styles.top}>
        <button type="button" className={styles.back} onClick={onClose} aria-label="Back">
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <label className={styles.search}>
          <Search size={18} aria-hidden="true" className={styles.searchIcon} />
          <input
            ref={input}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            placeholder="Where to?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search places"
          />
          {query ? (
            <button type="button" className={styles.clear} onClick={() => setQuery('')} aria-label="Clear search">
              <X size={16} aria-hidden="true" />
            </button>
          ) : null}
        </label>
      </div>

      <div className={styles.list}>
        {!q && recent.length ? (
          <section>
            <h3 className={styles.head}>Recent</h3>
            <ul>{recent.map((r) => row(r, true))}</ul>
          </section>
        ) : null}
        {sections.map(([title, list]) => (
          <section key={title}>
            <h3 className={styles.head}>{title}</h3>
            <ul>{list.map((r) => row(r))}</ul>
          </section>
        ))}
        {matches.length === 0 ? <p className={styles.empty}>No place called “{query}”. Try another name.</p> : null}
      </div>
    </div>
  )
}
