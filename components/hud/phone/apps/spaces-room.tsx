'use client'

import { ChevronLeft, Flag, Hand, LogOut, Mic, MicOff, PhoneOff, Send, Share2 } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  approveSpeaker,
  banFromSpace,
  COMMENT_MAX,
  countdown,
  fetchComments,
  fetchSpace,
  joinSpace,
  leaveSpace,
  postComment,
  requestToSpeak,
  whenLabel,
  type SpaceCard,
  type SpaceComment,
  type SpaceJoin,
  type SpacePerson,
} from '@/lib/game/spaces-api'
import { spaceLink } from '@/lib/game/open-spaces'
import { useLive } from './spaces-live-context'
import { Avatar, ReportSheet, Sheet, placeLabel } from './spaces-ui'
import styles from './spaces.module.css'

const SpaceLive = dynamic(() => import('./spaces-live'), { ssr: false })

const POLL_MS = 4000

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [active])
  return now
}

export function SpaceRoom({
  spaceId,
  initialJoin,
  onBack,
}: {
  spaceId: string
  /** Already joined (host who just started, or joined by code) */
  initialJoin?: SpaceJoin
  onBack: () => void
}) {
  const [space, setSpace] = useState<SpaceCard | null>(null)
  const [people, setPeople] = useState<SpacePerson[]>([])
  const [join, setJoin] = useState<SpaceJoin | null>(initialJoin ?? null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const joinedRef = useRef(false)
  const aliveRef = useRef(true)
  joinedRef.current = join !== null

  const load = useCallback(async () => {
    const res = await fetchSpace(spaceId)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setSpace(res.space)
    setPeople(res.people)
  }, [spaceId])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), POLL_MS)
    return () => window.clearInterval(id)
  }, [load])

  // Phone closed or app left while still in the room: leave (delayed so a dev re-mount doesn't count)
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      window.setTimeout(() => {
        if (!aliveRef.current && joinedRef.current) void leaveSpace(spaceId)
      }, 400)
    }
  }, [spaceId])

  async function doJoin() {
    setBusy(true)
    setError(null)
    const res = await joinSpace(spaceId)
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setJoin(res)
    void load()
  }

  async function doLeave() {
    setBusy(true)
    if (joinedRef.current) await leaveSpace(spaceId)
    joinedRef.current = false
    setJoin(null)
    setBusy(false)
    onBack()
  }

  const header = (
    <div className={styles.top}>
      <button
        type="button"
        className={styles.back}
        aria-label={join ? 'Leave Space' : 'Back'}
        onClick={() => (join ? void doLeave() : onBack())}
      >
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
      <h2 className={styles.title}>Space</h2>
    </div>
  )

  if (!space) {
    return (
      <div className={styles.root}>
        {header}
        <div className={styles.screen}>
          {error ? <p className={styles.error}>{error}</p> : <p className={styles.empty}>Loading…</p>}
        </div>
      </div>
    )
  }

  const body = (
    <RoomBody
      space={space}
      people={people}
      join={join}
      busy={busy}
      error={error}
      setError={setError}
      onJoin={() => void doJoin()}
      onLeave={() => void doLeave()}
      onRefresh={() => void load()}
    />
  )

  return (
    <div className={styles.root}>
      {header}
      {join ? (
        <SpaceLive
          url={join.livekit.url}
          token={join.livekit.token}
          onDisconnected={() => {
            // Dropped (kicked, room ended, network): back to "not joined" with a way to retry
            setJoin(null)
            setError('Disconnected. Tap Join to come back.')
            void load()
          }}
        >
          {body}
        </SpaceLive>
      ) : (
        body
      )}
    </div>
  )
}

function RoomBody({
  space,
  people,
  join,
  busy,
  error,
  setError,
  onJoin,
  onLeave,
  onRefresh,
}: {
  space: SpaceCard
  people: SpacePerson[]
  join: SpaceJoin | null
  busy: boolean
  error: string | null
  setError: (e: string | null) => void
  onJoin: () => void
  onLeave: () => void
  onRefresh: () => void
}) {
  const live = useLive()
  const now = useNow(space.status !== 'ended')
  const [note, setNote] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [handUp, setHandUp] = useState(false)
  const [picked, setPicked] = useState<SpacePerson | null>(null)

  const isHost = space.mine
  const me = people.find((p) => p.userId === live.localId)
  const role = me?.role ?? join?.role ?? (isHost ? 'host' : 'listener')
  const canSpeak = role === 'host' || role === 'speaker'
  const mic = live.localId ? live.micOn.has(live.localId) : false

  const speakers = people.filter((p) => p.role !== 'listener')
  const listeners = people.filter((p) => p.role === 'listener')
  // Raised hands first so the host sees them
  listeners.sort((a, b) => (b.askedToSpeak ? 1 : 0) - (a.askedToSpeak ? 1 : 0))

  const ended = space.status === 'ended'
  const place = placeLabel(space.placeId)
  const clock =
    space.status === 'scheduled' && space.scheduledAt
      ? { label: 'Starts in', value: countdown(space.scheduledAt, now), pct: null }
      : space.status === 'live' && space.endsBy && space.startedAt
        ? {
            label: 'Ends in',
            value: countdown(space.endsBy, now),
            pct: Math.min(100, Math.max(0, ((now - Date.parse(space.startedAt)) / (Date.parse(space.endsBy) - Date.parse(space.startedAt))) * 100)),
          }
        : null

  async function toggleMic() {
    const problem = await live.setMic(!mic)
    setNote(problem)
  }

  async function raiseHand() {
    const res = await requestToSpeak(space.id)
    if (!res.ok) return setError(res.error)
    if (res.role === 'listener') {
      setHandUp(true)
      setNote('Hand raised. The host will see it.')
    } else setNote('You can speak now.')
    onRefresh()
  }

  // Only the host knows the code; the short /s/CODE link lets people into invite-only rooms
  async function share() {
    const text = `Join “${space.title}” on Ekpoma Life Spaces\n${spaceLink(space.id, space.joinCode)}`
    try {
      await navigator.clipboard.writeText(text)
      setNote('Link copied. Paste it anywhere to share.')
    } catch {
      setNote(text)
    }
  }

  async function hostAct(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    const res = await fn()
    if (!res.ok) setError(res.error)
    setPicked(null)
    onRefresh()
  }

  const person = (p: SpacePerson, size: number) => {
    const askedHand = p.role === 'listener' && Boolean(p.askedToSpeak)
    const tappable = isHost && p.userId !== live.localId && p.role !== 'host'
    const inner = (
      <>
        <span className={styles.face}>
          <Avatar name={p.username} size={size} />
          {p.role === 'host' ? <span className={styles.crown} aria-label="Host">👑</span> : null}
          {p.role !== 'listener' ? (
            <span className={`${styles.micBadge} ${live.micOn.has(p.userId) ? styles.micBadgeOn : ''}`} aria-hidden="true">
              {live.micOn.has(p.userId) ? <Mic size={11} /> : <MicOff size={11} />}
            </span>
          ) : null}
          {askedHand ? <span className={styles.handBadge} aria-label="Hand raised">✋</span> : null}
        </span>
        <span className={styles.personName}>{p.username}</span>
      </>
    )
    const cls = `${styles.person} ${live.speaking.has(p.userId) ? styles.personSpeaking : ''}`
    return tappable ? (
      <button key={p.userId} type="button" className={cls} aria-label={`${p.username}: host options`} onClick={() => setPicked(p)}>
        {inner}
      </button>
    ) : (
      <div key={p.userId} className={cls}>
        {inner}
      </div>
    )
  }

  const top = (
    <>
      <div className={styles.roomHead}>
        <h3 className={styles.roomTitle}>{space.title}</h3>
        <button type="button" className={styles.iconBtn} aria-label="Copy share link" onClick={() => void share()}>
          <Share2 size={18} aria-hidden="true" />
        </button>
        {!isHost ? (
          <button type="button" className={styles.iconBtn} aria-label="Report Space" onClick={() => setReporting(true)}>
            <Flag size={18} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className={styles.metaRow}>
        {space.status === 'live' ? (
          <span className={styles.live}>LIVE</span>
        ) : space.scheduledAt && !ended ? (
          <span className={styles.when}>{whenLabel(space.scheduledAt)}</span>
        ) : (
          <span className={styles.status}>Ended</span>
        )}
        <span className={styles.host}>@{space.host.username}</span>
        <span className={styles.metaCount}>
          🎙 {space.speakers} · 🎧 {Math.max(0, space.present - space.speakers)}
        </span>
        {place ? <span className={styles.chip}>📍 {place}</span> : null}
        {isHost && space.joinCode ? <span className={styles.codeChip}>{space.joinCode}</span> : null}
      </div>
      {clock?.value ? (
        <div className={styles.timer}>
          {clock.pct !== null ? (
            <span className={styles.timerBar} aria-hidden="true">
              <span className={styles.timerFill} style={{ width: `${clock.pct}%` }} />
            </span>
          ) : null}
          <span className={styles.timerText}>
            {clock.label} {clock.value}
          </span>
        </div>
      ) : null}
    </>
  )

  return (
    <>
      <div className={styles.roomScroll}>
        {top}
        {ended ? <p className={styles.empty}>This Space has ended.</p> : null}
        {!ended && space.status === 'scheduled' && !isHost ? (
          <p className={styles.empty}>This Space hasn’t started. Come back when the countdown ends.</p>
        ) : null}

        {!ended && speakers.length > 0 ? <div className={styles.speakers}>{speakers.map((p) => person(p, 52))}</div> : null}

        {!ended && listeners.length > 0 ? (
          <>
            <div className={styles.group}>Listening · {listeners.length}</div>
            <div className={styles.listeners}>{listeners.map((p) => person(p, 38))}</div>
          </>
        ) : null}
      </div>

      {error || note ? (
        <p className={error ? styles.toastError : styles.toastNote} role="status">
          {error ?? note}
        </p>
      ) : null}

      {!ended && join ? <Comments spaceId={space.id} /> : null}

      {!ended ? (
        <div className={styles.dock}>
          {!join && space.status === 'live' ? (
            <button type="button" className={styles.big} disabled={busy} onClick={onJoin}>
              {busy ? 'Joining…' : 'Join'}
            </button>
          ) : null}
          {!join && space.status === 'scheduled' && isHost ? (
            <button type="button" className={styles.big} disabled={busy} onClick={onJoin}>
              {busy ? 'Starting…' : 'Start now'}
            </button>
          ) : null}
          {!join && space.status === 'live' ? <p className={styles.fine} style={{ textAlign: 'center' }}>You join muted · up to 1 hour</p> : null}

          {join ? (
            <div className={styles.dockRow}>
              {canSpeak ? (
                <button type="button" className={styles.dockBtn} aria-label={mic ? 'Mute mic' : 'Unmute mic'} onClick={() => void toggleMic()}>
                  {mic ? <Mic size={20} aria-hidden="true" /> : <MicOff size={20} aria-hidden="true" />}
                </button>
              ) : (
                <button type="button" className={styles.dockBtn} aria-label={handUp ? 'Hand raised' : 'Raise hand'} disabled={handUp} onClick={() => void raiseHand()}>
                  <Hand size={20} aria-hidden="true" />
                </button>
              )}
              {confirmEnd ? (
                <>
                  <button type="button" className={styles.danger} disabled={busy} onClick={onLeave}>
                    End for all
                  </button>
                  <button type="button" className={styles.ghost} onClick={() => setConfirmEnd(false)}>
                    Keep going
                  </button>
                </>
              ) : (
                <CommentBox spaceId={space.id} name={me?.username ?? 'You'} onError={setError} />
              )}
              {!confirmEnd ? (
                <button
                  type="button"
                  className={`${styles.dockBtn} ${styles.dockLeave}`}
                  aria-label={isHost ? 'End Space' : 'Leave Space'}
                  disabled={busy}
                  onClick={() => (isHost ? setConfirmEnd(true) : onLeave())}
                >
                  {isHost ? <PhoneOff size={20} aria-hidden="true" /> : <LogOut size={20} aria-hidden="true" />}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {picked ? (
        <Sheet title={`@${picked.username}`} onClose={() => setPicked(null)}>
          <div className={styles.pickActions}>
            {picked.role === 'listener' && picked.askedToSpeak ? (
              <button type="button" className={styles.big} onClick={() => void hostAct(() => approveSpeaker(space.id, picked.userId, true))}>
                ✋ Let them speak
              </button>
            ) : null}
            {picked.role === 'speaker' ? (
              <button type="button" className={styles.ghost} onClick={() => void hostAct(() => approveSpeaker(space.id, picked.userId, false))}>
                Mute (back to listener)
              </button>
            ) : null}
            <button type="button" className={styles.danger} onClick={() => void hostAct(() => banFromSpace(space.id, picked.userId))}>
              Remove from Space
            </button>
          </div>
        </Sheet>
      ) : null}

      {reporting ? (
        <ReportSheet
          spaceId={space.id}
          onClose={(sent) => {
            setReporting(false)
            if (sent) setNote(sent)
          }}
        />
      ) : null}
    </>
  )
}

/* ---- comments: floating bubbles above the dock, polled every 2.5 s while you're in the room ---- */

function Comments({ spaceId }: { spaceId: string }) {
  const [items, setItems] = useState<SpaceComment[]>([])
  const listRef = useRef<HTMLDivElement>(null)
  const sinceRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const pull = async () => {
      const res = await fetchComments(spaceId, sinceRef.current)
      if (cancelled || !res.ok || res.comments.length === 0) return
      sinceRef.current = res.comments[res.comments.length - 1]!.createdAt
      setItems((cur) => {
        const seen = new Set(cur.map((c) => c.id))
        const fresh = res.comments.filter((c) => !seen.has(c.id))
        return fresh.length ? [...cur, ...fresh].slice(-60) : cur
      })
    }
    void pull()
    const id = window.setInterval(() => void pull(), 2500)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [spaceId])

  // Keep the newest comment in view
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items])

  // Own comments show at once, before the next poll
  useEffect(() => {
    const onMine = (event: Event) => {
      const c = (event as CustomEvent<SpaceComment>).detail
      setItems((cur) => (cur.some((x) => x.id === c.id) ? cur : [...cur, c].slice(-60)))
    }
    window.addEventListener(MINE_EVENT, onMine)
    return () => window.removeEventListener(MINE_EVENT, onMine)
  }, [])

  if (items.length === 0) return <div className={styles.commentsEmpty}>No comments yet</div>
  return (
    <div className={styles.comments} ref={listRef} aria-live="polite" aria-label="Comments">
      {items.slice(-5).map((c) => (
        <div key={c.id} className={styles.comment}>
          <Avatar name={c.username} size={22} />
          <span className={styles.bubble}>
            <strong>{c.username}</strong> {c.body}
          </span>
        </div>
      ))}
    </div>
  )
}

const MINE_EVENT = 'ekpoma:space-comment'

function CommentBox({ spaceId, name, onError }: { spaceId: string; name: string; onError: (e: string | null) => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  async function send() {
    const body = text.trim()
    if (!body || busy) return
    setBusy(true)
    onError(null)
    const res = await postComment(spaceId, body)
    setBusy(false)
    if (!res.ok) return onError(res.error)
    setText('')
    window.dispatchEvent(new CustomEvent(MINE_EVENT, { detail: { ...res.comment, username: name } }))
  }

  return (
    <form
      className={styles.composer}
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
    >
      <input
        className={styles.composerInput}
        value={text}
        maxLength={COMMENT_MAX}
        placeholder="Add a comment…"
        aria-label="Add a comment"
        autoComplete="off"
        enterKeyHint="send"
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" className={`${styles.send} ${text.trim() ? styles.sendOn : ''}`} disabled={!text.trim() || busy} aria-label="Send comment">
        <Send size={16} aria-hidden="true" />
      </button>
    </form>
  )
}
