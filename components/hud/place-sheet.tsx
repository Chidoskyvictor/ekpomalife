'use client'

import { ChevronDown, ChevronUp, Clock } from 'lucide-react'
import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { hapticTap } from './haptic'
import styles from './place-sheet.module.css'

/*
 * The card for the place you're in (a club, a building, your room): name and a short line, round
 * buttons on the right, and when you open it up: spots (chips), action cards and who's here.
 * One shape everywhere so every place feels the same. While one is on screen the HUD shrinks the
 * avatar card to a small ring at the top so the sheet has the bottom to itself.
 */

// —— Is a place sheet on screen? (the HUD reads this) ——
let mounted = 0
const listeners = new Set<() => void>()
export function usePlaceSheetActive() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => mounted > 0,
    () => false,
  )
}

export type PlaceButton = { icon: ReactNode; label: string; onClick: () => void; badge?: number | string; disabled?: boolean }

export function PlaceSheet({
  icon,
  title,
  subtitle,
  buttons = [],
  expanded,
  onExpandedChange,
  tone = 'light',
  children,
}: {
  icon: ReactNode
  title: string
  subtitle?: ReactNode
  buttons?: PlaceButton[]
  expanded: boolean
  onExpandedChange: (open: boolean) => void
  /** 'night' for clubs: dark glass. */
  tone?: 'light' | 'night'
  children?: ReactNode
}) {
  useEffect(() => {
    mounted += 1
    listeners.forEach((fn) => fn())
    return () => {
      mounted -= 1
      listeners.forEach((fn) => fn())
    }
  }, [])

  const toggle = () => {
    hapticTap()
    onExpandedChange(!expanded)
  }

  return (
    <section className={`${styles.sheet} ${tone === 'night' ? styles.night : ''}`} aria-label={title}>
      <button type="button" className={styles.handle} onClick={toggle} aria-label={expanded ? 'Show less' : 'Show more'}>
        <span />
      </button>
      <div className={styles.head}>
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
        <button type="button" className={styles.titles} onClick={toggle}>
          <strong>{title}</strong>
          {subtitle ? <span>{subtitle}</span> : null}
        </button>
        <div className={styles.buttons}>
          {buttons.map((b) => (
            <button key={b.label} type="button" className={styles.round} onClick={b.onClick} disabled={b.disabled} aria-label={b.label} title={b.label}>
              {b.icon}
              {b.badge ? <span className={styles.badge}>{b.badge}</span> : null}
            </button>
          ))}
          <button type="button" className={styles.round} onClick={toggle} aria-label={expanded ? 'Show less' : 'Show more'}>
            {expanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </button>
        </div>
      </div>
      {expanded && children ? <div className={styles.body}>{children}</div> : null}
    </section>
  )
}

/** "Spots here" chip row: tap one to go there / see what you can do. */
export function PlaceSpots<T extends string>({
  label = 'Spots here',
  hint,
  spots,
  value,
  onChange,
}: {
  label?: string
  hint?: string
  spots: { id: T; emoji: string; label: string }[]
  value: T | null
  onChange: (id: T) => void
}) {
  return (
    <div className={styles.block}>
      <div className={styles.blockHead}>
        <span>{label}</span>
        {hint ? <small>{hint}</small> : null}
      </div>
      <div className={styles.chips}>
        {spots.map((s) => (
          <button key={s.id} type="button" className={`${styles.chip} ${value === s.id ? styles.chipOn : ''}`} onClick={() => onChange(s.id)}>
            <span aria-hidden="true">{s.emoji}</span>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export type PlaceTag = { text: string; tone: 'good' | 'bad' | 'info' }

/** One thing you can do: emoji, how long (real seconds), price, name and what it does to you. */
export function PlaceAction({
  emoji,
  seconds,
  price,
  title,
  tags = [],
  note,
  disabled,
  onClick,
}: {
  emoji: string
  seconds?: number
  price?: string
  title: string
  tags?: PlaceTag[]
  note?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className={styles.action} disabled={disabled} onClick={onClick}>
      <span className={styles.actionTop}>
        <span className={styles.actionEmoji} aria-hidden="true">
          {emoji}
        </span>
        {seconds ? (
          <span className={styles.time}>
            <Clock size={12} aria-hidden="true" />
            {seconds}s
          </span>
        ) : null}
      </span>
      {price ? <span className={styles.price}>{price}</span> : null}
      <span className={styles.actionTitle}>{title}</span>
      {note ? <span className={styles.note}>{note}</span> : null}
      {tags.length ? (
        <span className={styles.tags}>
          {tags.map((t) => (
            <span key={t.text} className={`${styles.tag} ${styles[t.tone]}`}>
              {t.text}
            </span>
          ))}
        </span>
      ) : null}
    </button>
  )
}

export function PlaceActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>
}

/** "Players here · 24" row of round faces. */
export function PlacePeople({
  count,
  people,
  onPick,
  onMore,
}: {
  count: number
  /** Everyone but you; `count` includes you, shown first as "You". */
  people: { id: string; username: string; mark?: string }[]
  onPick: (id: string) => void
  onMore?: () => void
}) {
  const more = Math.max(0, count - 1 - people.length)
  return (
    <div className={styles.block}>
      <div className={styles.blockHead}>
        <span>Players here · {count.toLocaleString()}</span>
      </div>
      <div className={styles.people}>
        <span className={styles.person}>
          <span className={`${styles.face} ${styles.faceYou}`}>You</span>
          <span className={styles.handleName}>You</span>
        </span>
        {people.map((p) => (
          <button key={p.id} type="button" className={styles.person} onClick={() => onPick(p.id)}>
            <span className={styles.face}>{p.username.slice(0, 1).toUpperCase()}</span>
            <span className={styles.handleName}>@{p.username}</span>
            {p.mark ? <span className={styles.mark}>{p.mark}</span> : null}
          </button>
        ))}
        {more && onMore ? (
          <button type="button" className={styles.person} onClick={onMore}>
            <span className={`${styles.face} ${styles.faceMore}`}>+{more > 999 ? '999' : more}</span>
            <span className={styles.handleName}>more here</span>
          </button>
        ) : null}
      </div>
    </div>
  )
}
