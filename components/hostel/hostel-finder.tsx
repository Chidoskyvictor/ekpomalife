'use client'

import { Search, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import { addAndJoin, joinAndAnnounce, useHostelSearch, useMyHostel } from '@/hooks/use-hostel'
import { isHostelExists, type HostelSearchHit, type HostelSummary } from '@/lib/game/hostels-api'
import styles from './hostel-finder.module.css'

const DISMISS_KEY = 'ekpoma-hostel-finder-dismissed'

function readDismissed() {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

function writeDismissed(value: boolean) {
  try {
    window.localStorage.setItem(DISMISS_KEY, value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

const members = (n: number) => (n === 1 ? '1 member' : `${n} members`)

/** Bar ⇄ 🏠 icon share this id, so motion morphs one into the other. */
const MORPH_ID = 'hostel-finder-morph'
const SPRING = { type: 'spring' as const, stiffness: 420, damping: 36, mass: 0.8 }

/**
 * Home screen: slim "Find your hostel" search for players without a hostel.
 * Non-blocking, dismissible, re-openable from a small icon.
 */
export function HostelFinder() {
  const { notifyToast } = useGame()
  const { hostel, loading } = useMyHostel()
  const [dismissed, setDismissed] = useState(false)
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // "Already on the list": the hostel(s) to join instead of adding a duplicate
  const [exists, setExists] = useState<{ message: string; matches: HostelSummary[] } | null>(null)
  const { results, exactMatch, searching } = useHostelSearch(query)
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const reduced = useReducedMotion() ?? false
  const morph = reduced ? { duration: 0 } : SPRING
  const fade = reduced ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' as const }

  useEffect(() => setDismissed(readDismissed()), [])

  const typed = query.trim()
  const showAdd = typed.length >= 2 && !searching && !exactMatch
  const open = typed.length >= 2

  const done = (name: string) => {
    setQuery('')
    notifyToast?.(`Welcome to ${name}! Your hostel chat is in Messages.`, true)
  }

  const join = async (hit: HostelSummary) => {
    setBusyId(hit.id)
    setError(null)
    const res = await joinAndAnnounce(hit.id)
    setBusyId(null)
    if (res.ok) done(res.hostel.name)
    else setError(res.error)
  }

  const add = async () => {
    setBusyId('add')
    setError(null)
    const res = await addAndJoin(typed)
    setBusyId(null)
    if (res.ok) return done(res.hostel.name)
    if (isHostelExists(res) && res.matches?.length) {
      setExists({ message: res.error, matches: res.matches })
      return
    }
    setError(res.error)
  }

  const tryAnother = () => {
    setExists(null)
    setQuery('')
    inputRef.current?.focus()
  }

  const visible = !loading && !hostel

  return (
    <AnimatePresence initial={false} mode="popLayout">
      {!visible ? null : dismissed ? (
        <motion.button
          key="icon"
          type="button"
          layoutId={MORPH_ID}
          className={styles.reopen}
          style={{ borderRadius: 999 }}
          transition={morph}
          exit={{ opacity: 0, transition: fade }}
          aria-label="Find your hostel"
          onClick={() => {
            writeDismissed(false)
            setDismissed(false)
          }}
        >
          <motion.span aria-hidden="true" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...fade, delay: reduced ? 0 : 0.08 }}>
            🏠
          </motion.span>
        </motion.button>
      ) : (
    <motion.div
      key="bar"
      className={styles.finder}
      exit={{ opacity: 0, y: -6, transition: fade }}
    >
      <motion.div layoutId={MORPH_ID} className={styles.bar} style={{ borderRadius: 999 }} transition={morph}>
        <motion.div
          className={styles.barInner}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...fade, delay: reduced ? 0 : 0.1 }}
        >
        <Search className={styles.icon} size={16} aria-hidden="true" />
        <input
          className={styles.input}
          type="search"
          value={query}
          ref={inputRef}
          onChange={(e) => {
            setQuery(e.target.value.slice(0, 60))
            setExists(null)
            setError(null)
          }}
          placeholder="Find your hostel"
          aria-label="Find your hostel"
          aria-expanded={open}
          aria-controls={listId}
          autoComplete="off"
          enterKeyHint="search"
        />
        <button
          type="button"
          className={styles.close}
          aria-label="Hide hostel search"
          onClick={() => {
            writeDismissed(true)
            setDismissed(true)
          }}
        >
          <X size={16} aria-hidden="true" />
        </button>
        </motion.div>
      </motion.div>

      <AnimatePresence initial={false}>
      {exists ? (
        <motion.div
          key="exists"
          className={styles.dropdown}
          role="alertdialog"
          aria-label="Hostel already exists"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={fade}
        >
          <div className={styles.exists}>
            <p className={styles.existsTitle}>Already on the list</p>
            <p className={styles.existsText}>{exists.message}</p>
          </div>
          {exists.matches.map((hit) => (
            <div key={hit.id} className={styles.row}>
              <span className={styles.rowText}>
                <span className={styles.name}>{hit.name}</span>
                <span className={styles.meta}>{members(hit.members)}</span>
              </span>
              <button
                type="button"
                className={styles.join}
                disabled={busyId != null}
                onClick={() => void join(hit)}
              >
                {busyId === hit.id ? 'Joining…' : 'Join'}
              </button>
            </div>
          ))}
          <button type="button" className={styles.another} onClick={tryAnother}>
            Try a different name
          </button>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </motion.div>
      ) : open ? (
        <motion.div
          key="results"
          className={styles.dropdown}
          id={listId}
          role="listbox"
          aria-label="Hostels"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={fade}
        >
          {searching && results.length === 0 ? <p className={styles.hint}>Searching…</p> : null}
          {results.length > 0 && !exactMatch ? <p className={styles.section}>Did you mean…</p> : null}
          {results.map((hit) => (
            <div key={hit.id} className={styles.row} role="option" aria-selected={false}>
              <span className={styles.rowText}>
                <span className={styles.name}>{hit.name}</span>
                <span className={styles.meta}>{members(hit.members)}</span>
              </span>
              <button
                type="button"
                className={styles.join}
                disabled={busyId != null}
                onClick={() => void join(hit)}
              >
                {busyId === hit.id ? 'Joining…' : 'Join'}
              </button>
            </div>
          ))}
          {showAdd ? (
            <button type="button" className={styles.add} disabled={busyId != null} onClick={() => void add()}>
              {busyId === 'add' ? 'Adding…' : <>Add “{typed}”</>}
            </button>
          ) : null}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </motion.div>
      ) : null}
      </AnimatePresence>
    </motion.div>
      )}
    </AnimatePresence>
  )
}
