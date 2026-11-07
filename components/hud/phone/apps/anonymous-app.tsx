'use client'

import { ChevronLeft, Copy, Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  WALL_KINDS,
  createWall,
  fetchMine,
  fetchWalls,
  joinWall,
  joinWallByCode,
  leaveWall,
  type AnonComment,
  type AnonPost,
  type AnonWall,
  type AnonYou,
  type WallKind,
} from '@/lib/game/anonymous-api'
import { Composer, Feed, PostCard, timeAgo } from './anonymous-feed'
import styles from './anonymous.module.css'

/*
 * Phone → Anonymous. A Whisper-style anonymous campus feed. Everyone shows as "Anonymous".
 * Three tabs: Feed (full-card posts), Walls (public communities), Mine (your own, private).
 * Draws its own header (bare app frame).
 */

type Tab = 'feed' | 'walls' | 'mine'

export function AnonymousApp({ onHome }: { onHome: () => void }) {
  const [tab, setTab] = useState<Tab>('feed')
  const [wall, setWall] = useState<AnonWall | null>(null)
  const [composing, setComposing] = useState(false)
  const [feedKey, setFeedKey] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const [you, setYou] = useState<AnonYou | null>(null)

  const flash = useCallback((message: string) => {
    setNote(message)
    window.setTimeout(() => setNote((n) => (n === message ? null : n)), 2600)
  }, [])

  const title = wall ? wall.name : tab === 'feed' ? 'Anonymous' : tab === 'walls' ? 'Walls' : 'Mine'

  return (
    <div className={styles.root}>
      <header className={styles.top}>
        <button type="button" className={styles.iconBtn} aria-label={wall ? 'Back to walls' : 'Back home'} onClick={wall ? () => setWall(null) : onHome}>
          <ChevronLeft size={26} />
        </button>
        <h2 className={styles.title}>{title}</h2>
        <span className={styles.spacer} />
        <span className={styles.mask} aria-hidden="true">🎭</span>
      </header>

      {you?.banned ? <p className={styles.warn}>You can no longer post in Anonymous. You can still read.</p> : null}
      {you && !you.banned && you.warnings > 0 ? (
        <p className={styles.warn}>An admin warned you about a post. Keep it kind or you may lose posting.</p>
      ) : null}

      <div className={styles.body}>
        {tab === 'feed' && !wall ? (
          <Feed key={feedKey} flash={flash} onYou={setYou} onCompose={() => setComposing(true)} />
        ) : null}
        {tab === 'walls' && !wall ? <Walls onOpen={setWall} flash={flash} /> : null}
        {tab === 'walls' && wall ? (
          <WallView key={`${wall.id}:${feedKey}`} wall={wall} flash={flash} onChange={setWall} onLeft={() => setWall(null)} onCompose={() => setComposing(true)} />
        ) : null}
        {tab === 'mine' ? <Mine flash={flash} /> : null}

        {tab !== 'mine' && !you?.banned && (tab === 'feed' || wall?.joined) ? (
          <button type="button" className={styles.fab} aria-label="New post" onClick={() => setComposing(true)}>
            <Plus size={28} />
          </button>
        ) : null}
        {note ? <p className={styles.toast} role="status">{note}</p> : null}
      </div>

      <nav className={styles.tabs} aria-label="Anonymous sections">
        {(['feed', 'walls', 'mine'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`${styles.tab} ${tab === t ? styles.tabOn : ''}`}
            aria-current={tab === t ? 'page' : undefined}
            onClick={() => {
              setTab(t)
              setWall(null)
            }}
          >
            {t === 'feed' ? 'Feed' : t === 'walls' ? 'Walls' : 'Mine'}
          </button>
        ))}
      </nav>

      {composing ? (
        <Composer
          wallId={tab === 'walls' ? wall?.id : undefined}
          wallName={tab === 'walls' ? wall?.name : undefined}
          onClose={() => setComposing(false)}
          onPosted={() => {
            setComposing(false)
            setFeedKey((k) => k + 1)
            flash('Posted as Anonymous')
          }}
        />
      ) : null}
    </div>
  )
}

/* ---------- walls ---------- */

function Walls({ onOpen, flash }: { onOpen: (w: AnonWall) => void; flash: (m: string) => void }) {
  const [walls, setWalls] = useState<AnonWall[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    const res = await fetchWalls()
    if (!res.ok) {
      setError(res.status && res.status >= 404 ? "Anonymous isn't switched on yet. Check back soon." : res.error)
      setWalls([])
      return
    }
    setError(null)
    setWalls(res.walls)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function join(w: AnonWall) {
    const res = await joinWall(w.id)
    if (!res.ok) return flash(res.error)
    flash(`Joined ${w.name}`)
    onOpen(res.wall)
  }

  async function joinCode() {
    const res = await joinWallByCode(code.trim())
    if (!res.ok) return flash(res.error)
    setCode('')
    onOpen(res.wall)
  }

  if (creating) {
    return (
      <NewWall
        onCancel={() => setCreating(false)}
        onCreated={(w) => {
          setCreating(false)
          onOpen(w)
        }}
      />
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.codeRow}>
        <input
          className={styles.input}
          value={code}
          maxLength={8}
          placeholder="Invite code"
          autoCapitalize="characters"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && void joinCode()}
        />
        <button type="button" className={styles.ghost} disabled={code.trim().length < 6} onClick={() => void joinCode()}>
          Join
        </button>
      </div>
      <button type="button" className={styles.primary} onClick={() => setCreating(true)}>
        Start a wall
      </button>
      {walls === null ? <p className={styles.fine}>Loading…</p> : null}
      {error ? <p className={styles.fine}>{error}</p> : null}
      {walls?.length === 0 && !error ? <p className={styles.fine}>No walls yet. Start the first one for your hostel or department.</p> : null}
      <ul className={styles.list}>
        {walls?.map((w) => (
          <li key={w.id} className={styles.wall}>
            <button type="button" className={styles.wallMain} onClick={() => onOpen(w)}>
              <strong>{w.name}</strong>
              <span className={styles.fine}>
                {WALL_KINDS.find((k) => k.id === w.kind)?.label} · {w.members} member{w.members === 1 ? '' : 's'} · {w.posts} post{w.posts === 1 ? '' : 's'}
              </span>
              {w.description ? <span className={styles.wallDesc}>{w.description}</span> : null}
            </button>
            {w.joined ? <span className={styles.joined}>Joined</span> : (
              <button type="button" className={styles.ghost} onClick={() => void join(w)}>
                Join
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className={styles.fine}>Walls are public. Anyone can find and join them. Posts on a wall do not show in the main Feed.</p>
    </div>
  )
}

function NewWall({ onCancel, onCreated }: { onCancel: () => void; onCreated: (w: AnonWall) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<WallKind>('hostel')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    const res = await createWall({ name, description, kind })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    onCreated(res.wall)
  }

  return (
    <div className={styles.page}>
      <h3 className={styles.h3}>Start a wall</h3>
      <div className={styles.chips}>
        {WALL_KINDS.map((k) => (
          <button key={k.id} type="button" className={`${styles.chip} ${kind === k.id ? styles.chipOn : ''}`} onClick={() => setKind(k.id)}>
            {k.label}
          </button>
        ))}
      </div>
      <input className={styles.input} value={name} maxLength={40} placeholder="Wall name, e.g. Block C girls" onChange={(e) => setName(e.target.value)} />
      <input className={styles.input} value={description} maxLength={140} placeholder="What is it about? (optional)" onChange={(e) => setDescription(e.target.value)} />
      {error ? <p className={styles.error}>{error}</p> : null}
      <button type="button" className={styles.primary} disabled={busy || name.trim().length < 3} onClick={() => void submit()}>
        {busy ? 'Creating…' : 'Create wall'}
      </button>
      <button type="button" className={styles.ghost} onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}

function WallView({
  wall,
  flash,
  onChange,
  onLeft,
  onCompose,
}: {
  wall: AnonWall
  flash: (m: string) => void
  onChange: (w: AnonWall) => void
  onLeft: () => void
  onCompose: () => void
}) {
  async function join() {
    const res = await joinWall(wall.id)
    if (!res.ok) return flash(res.error)
    onChange(res.wall)
  }
  async function leave() {
    const res = await leaveWall(wall.id)
    if (!res.ok) return flash(res.error)
    flash(`Left ${wall.name}`)
    onLeft()
  }
  async function copyCode() {
    if (!wall.inviteCode) return
    try {
      await navigator.clipboard.writeText(wall.inviteCode)
      flash(`Code ${wall.inviteCode} copied`)
    } catch {
      flash(`Invite code: ${wall.inviteCode}`)
    }
  }
  return (
    <div className={styles.wallView}>
      <div className={styles.wallBar}>
        <span className={styles.fine}>{wall.members} members</span>
        <span className={styles.spacer} />
        {wall.joined && wall.inviteCode ? (
          <button type="button" className={styles.ghostSm} onClick={() => void copyCode()}>
            <Copy size={14} /> {wall.inviteCode}
          </button>
        ) : null}
        {wall.joined ? (
          <button type="button" className={styles.ghostSm} onClick={() => void leave()}>
            Leave
          </button>
        ) : (
          <button type="button" className={styles.ghostSm} onClick={() => void join()}>
            Join to post
          </button>
        )}
      </div>
      <Feed wallId={wall.id} wallName={wall.name} flash={flash} onCompose={onCompose} />
    </div>
  )
}

/* ---------- mine ---------- */

function Mine({ flash }: { flash: (m: string) => void }) {
  const [sub, setSub] = useState<'posts' | 'comments' | 'likes'>('posts')
  const [posts, setPosts] = useState<AnonPost[] | null>(null)
  const [comments, setComments] = useState<(AnonComment)[] | null>(null)

  useEffect(() => {
    setPosts(null)
    setComments(null)
    void fetchMine(sub).then((res) => {
      if (!res.ok) {
        flash(res.status && res.status >= 404 ? "Anonymous isn't switched on yet." : res.error)
        setPosts([])
        setComments([])
        return
      }
      setPosts(res.posts ?? [])
      setComments(res.comments ?? [])
    })
  }, [sub, flash])

  const empty = sub === 'comments' ? comments?.length === 0 : posts?.length === 0
  return (
    <div className={styles.page}>
      <p className={styles.private}>🔒 Only you can see this page. It is anonymous to other students, but not to the admins.</p>
      <div className={styles.toggle} role="tablist" aria-label="Mine">
        {(['posts', 'comments', 'likes'] as const).map((s) => (
          <button key={s} type="button" role="tab" aria-selected={sub === s} className={sub === s ? styles.toggleOn : ''} onClick={() => setSub(s)}>
            {s === 'posts' ? 'Posts' : s === 'comments' ? 'Comments' : 'Likes'}
          </button>
        ))}
      </div>
      {(sub === 'comments' ? comments : posts) === null ? <p className={styles.fine}>Loading…</p> : null}
      {empty ? <p className={styles.fine}>{sub === 'posts' ? "You haven't posted yet." : sub === 'comments' ? 'No comments yet.' : 'Posts you like show up here.'}</p> : null}
      <ul className={styles.list}>
        {sub !== 'comments'
          ? posts?.map((p) => (
              <li key={p.id}>
                <PostCard post={p} compact />
              </li>
            ))
          : comments?.map((c) => (
              <li key={c.id} className={styles.myComment}>
                <span className={styles.fine}>On “{c.postPreview}” · {timeAgo(c.createdAt)}</span>
                <p>{c.status === 'ok' ? c.body : 'Hidden pending review'}</p>
              </li>
            ))}
      </ul>
    </div>
  )
}
