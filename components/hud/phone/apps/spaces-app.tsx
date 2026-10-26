'use client'

import { ChevronLeft, Flag, Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  fetchSpaces,
  joinSpaceByCode,
  whenLabel,
  type SpaceCard,
  type SpaceJoin,
  type SpaceTab,
} from '@/lib/game/spaces-api'
import { OPEN_SPACES_EVENT, takePendingSpace } from '@/lib/game/open-spaces'
import { NewSpacePage } from './spaces-form'
import { SpaceRoom } from './spaces-room'
import { Avatar, ReportSheet, placeLabel } from './spaces-ui'
import styles from './spaces.module.css'

/*
 * Phone → Spaces. Campus voice rooms. The list talks to /spaces; a room opens in-app
 * (SpaceRoom) and connects to LiveKit only after the player taps Join.
 */

const TABS: { id: SpaceTab; label: string }[] = [
  { id: 'live', label: 'Live' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'mine', label: 'Mine' },
  { id: 'here', label: 'Here' },
]

const EMPTY: Record<SpaceTab, string> = {
  live: 'No Spaces live right now. Start one!',
  upcoming: 'Nothing scheduled yet.',
  mine: 'You haven’t started a Space.',
  here: 'No Space here right now.',
}

type View = { name: 'list' } | { name: 'new' } | { name: 'room'; spaceId: string; join?: SpaceJoin }

export function SpacesApp({ currentPlaceId, onHome }: { currentPlaceId: string | null; onHome: () => void }) {
  const [view, setView] = useState<View>({ name: 'list' })
  const [tab, setTab] = useState<SpaceTab>('live')
  const [spaces, setSpaces] = useState<SpaceCard[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reportId, setReportId] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (tab === 'here' && !currentPlaceId) {
      setSpaces([])
      return
    }
    const res = await fetchSpaces(tab, tab === 'here' ? currentPlaceId : null)
    if (!res.ok) {
      setError(res.error)
      setSpaces((cur) => cur ?? [])
      return
    }
    setError(null)
    setSpaces(res.spaces)
  }, [tab, currentPlaceId])

  // Opened from a shared link: go straight to the room (the code, if any, lets invite-only rooms in)
  useEffect(() => {
    const open = async () => {
      const link = takePendingSpace()
      if (!link) return
      if (link.code) {
        const res = await joinSpaceByCode(link.code)
        if (res.ok) return setView({ name: 'room', spaceId: res.spaceId, join: res })
      }
      if (link.spaceId) setView({ name: 'room', spaceId: link.spaceId })
      else setError('No live Space with that code.')
    }
    void open()
    const onEvent = () => void open()
    window.addEventListener(OPEN_SPACES_EVENT, onEvent)
    return () => window.removeEventListener(OPEN_SPACES_EVENT, onEvent)
  }, [])

  useEffect(() => {
    if (view.name !== 'list') return
    setSpaces(null)
    void load()
    const id = window.setInterval(() => void load(), 10_000)
    return () => window.clearInterval(id)
  }, [view.name, load])

  if (view.name === 'new') {
    return (
      <NewSpacePage
        presetPlaceId={tab === 'here' ? currentPlaceId : null}
        onBack={() => setView({ name: 'list' })}
        onStarted={(join) => setView({ name: 'room', spaceId: join.spaceId, join })}
        onScheduled={() => {
          setView({ name: 'list' })
          setTab('mine')
          setNote('Scheduled. You can start it from 10 minutes before.')
        }}
      />
    )
  }

  if (view.name === 'room') {
    return (
      <SpaceRoom
        spaceId={view.spaceId}
        initialJoin={view.join}
        onBack={() => setView({ name: 'list' })}
      />
    )
  }

  const here = placeLabel(currentPlaceId)

  return (
    <div className={styles.root}>
      <div className={styles.top}>
        <button type="button" className={styles.back} aria-label="Back home" onClick={onHome}>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <h2 className={styles.title}>
          <span className={styles.wordmark}>Spaces</span>
        </h2>
      </div>

      <div className={styles.screen}>
        <button type="button" className={styles.start} onClick={() => setView({ name: 'new' })}>
          <Plus size={18} aria-hidden="true" /> Start a Space
        </button>

        <div className={styles.tabs} role="tablist" aria-label="Spaces">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`${styles.tab} ${tab === t.id ? styles.tabOn : ''}`}
              onClick={() => {
                setTab(t.id)
                setNote(null)
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'mine' || tab === 'here' ? (
          <CodeBox
            onJoined={(join) => setView({ name: 'room', spaceId: join.spaceId, join })}
          />
        ) : null}

        {tab === 'here' ? (
          <div className={styles.hereBar}>
            <span>
              📍 <strong>{here ?? 'Somewhere on campus'}</strong>
            </span>
          </div>
        ) : null}

        {error ? <p className={styles.error}>{error}</p> : null}
        {note ? <p className={styles.note}>{note}</p> : null}

        {spaces === null ? (
          <p className={styles.empty}>Loading…</p>
        ) : spaces.length === 0 ? (
          <>
            <p className={styles.empty}>{EMPTY[tab]}</p>
            {tab === 'here' && currentPlaceId ? (
              <button type="button" className={styles.big} onClick={() => setView({ name: 'new' })}>
                Start
              </button>
            ) : null}
          </>
        ) : (
          <ul className={styles.list}>
            {spaces.map((s) => (
              <SpaceRow
                key={s.id}
                space={s}
                onOpen={() => setView({ name: 'room', spaceId: s.id })}
                onReport={() => setReportId(s.id)}
              />
            ))}
            {tab === 'here' && currentPlaceId ? (
              <li>
                <button type="button" className={styles.big} style={{ width: '100%' }} onClick={() => setView({ name: 'new' })}>
                  Start
                </button>
              </li>
            ) : null}
          </ul>
        )}
      </div>

      {reportId ? (
        <ReportSheet
          spaceId={reportId}
          onClose={(sent) => {
            setReportId(null)
            if (sent) setNote(sent)
          }}
        />
      ) : null}
    </div>
  )
}

function SpaceRow({ space, onOpen, onReport }: { space: SpaceCard; onOpen: () => void; onReport: () => void }) {
  const place = placeLabel(space.placeId)
  const faces = space.faces.length ? space.faces : [space.host.username]
  const speakers = space.speakers
  const listeners = Math.max(0, space.present - speakers)

  return (
    <li className={styles.card}>
      <button type="button" className={styles.cardMain} onClick={onOpen} aria-label={`Open ${space.title}`}>
        <span className={styles.row}>
          {space.status === 'live' ? (
            <span className={styles.live}>LIVE</span>
          ) : space.status === 'scheduled' && space.scheduledAt ? (
            <span className={styles.when}>{whenLabel(space.scheduledAt)}</span>
          ) : (
            <span className={styles.status}>Ended</span>
          )}
          {place ? <span className={styles.chip}>📍 {place}</span> : null}
        </span>
        <span className={styles.cardTitle}>{space.title}</span>
        <span className={styles.row}>
          <span className={styles.faces} aria-hidden="true">
            {faces.map((name) => (
              <Avatar key={name} name={name} size={24} />
            ))}
          </span>
          <span className={styles.host}>@{space.host.username}</span>
          <span className={styles.counts}>
            🎙️ {speakers} · 🎧 {listeners}
          </span>
        </span>
      </button>
      {space.mine ? null : (
        <button type="button" className={styles.flag} aria-label={`Report ${space.title}`} onClick={onReport}>
          <Flag size={17} aria-hidden="true" />
        </button>
      )}
    </li>
  )
}

function CodeBox({ onJoined }: { onJoined: (join: SpaceJoin) => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function go() {
    setBusy(true)
    setError(null)
    const res = await joinSpaceByCode(code.trim().toUpperCase())
    setBusy(false)
    if (!res.ok) return setError(res.error)
    onJoined(res)
  }

  return (
    <>
      <form
        className={styles.code}
        onSubmit={(e) => {
          e.preventDefault()
          void go()
        }}
      >
        <label className={styles.codeLabel} htmlFor="space-code">
          Have a code?
        </label>
        <input
          id="space-code"
          className={styles.codeInput}
          value={code}
          maxLength={6}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="ABC123"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <button type="submit" className={styles.codeGo} disabled={busy || code.trim().length !== 6}>
          {busy ? '…' : 'Go'}
        </button>
      </form>
      {error ? <p className={styles.error}>{error}</p> : null}
    </>
  )
}
