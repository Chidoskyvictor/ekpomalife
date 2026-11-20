'use client'

import { Copy, Lock, MessagesSquare, Pencil, Search, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  WALL_EMOJI,
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
import { MaskAvatar, MaskGlyph } from './anonymous-mask'
import { AppHeader } from '../app-header'
import { AppError, AppLoading } from '../app-state'
import styles from './anonymous.module.css'

/*
 * Phone → Anonymous. A masked campus feed: every post and reply shows a random alias and mask, never a name.
 * Three tabs: Feed (colour cards + mood chips), Walls (public circles), Mine (private to you).
 * Draws its own header (bare app frame).
 */

type Tab = 'feed' | 'walls' | 'mine'

const TABS: { id: Tab; label: string; Icon: typeof MessagesSquare }[] = [
  { id: 'feed', label: 'Feed', Icon: MessagesSquare },
  { id: 'walls', label: 'Walls', Icon: Users },
  { id: 'mine', label: 'Mine', Icon: Lock },
]

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
  const subtitle = wall ? 'Wall · masks on' : tab === 'feed' ? 'Nobody knows it is you' : tab === 'walls' ? 'Public circles, still masked' : 'Only you can see this'

  return (
    <div className={styles.root}>
      <AppHeader
        title={title}
        subtitle={subtitle}
        onBack={wall ? () => setWall(null) : onHome}
        backLabel={wall ? 'Back to walls' : 'Back home'}
        right={
          <span className={styles.maskBadge} aria-hidden="true">
            <MaskGlyph size={22} />
          </span>
        }
        bar
      />

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
        {tab === 'mine' ? <Mine flash={flash} onCompose={() => setComposing(true)} /> : null}

        {tab !== 'mine' && !you?.banned && (tab === 'feed' || wall?.joined) ? (
          <button type="button" className={styles.fab} aria-label="New post" onClick={() => setComposing(true)}>
            <Pencil size={20} aria-hidden="true" />
            <span>Confess</span>
          </button>
        ) : null}
        {note ? <p className={styles.toast} role="status">{note}</p> : null}
      </div>

      <nav className={styles.tabs} aria-label="Anonymous sections">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`${styles.tab} ${tab === id ? styles.tabOn : ''}`}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => {
              setTab(id)
              setWall(null)
            }}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
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
            flash('Posted under a mask 🎭')
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
  const [query, setQuery] = useState('')
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

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!walls) return walls
    return q ? walls.filter((w) => w.name.toLowerCase().includes(q) || w.description.toLowerCase().includes(q)) : walls
  }, [walls, query])

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
      <div className={styles.hero}>
        <div className={styles.heroHead}>
          <span className={styles.heroArt}>
            <MaskGlyph size={30} />
          </span>
          <div>
            <strong>Got an invite code?</strong>
            <p className={styles.heroSub}>Private circles for your hostel, faculty or squad.</p>
          </div>
        </div>
        <div className={styles.codeRow}>
          <input
            className={styles.input}
            value={code}
            maxLength={8}
            placeholder="CODE"
            aria-label="Invite code"
            autoCapitalize="characters"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && void joinCode()}
          />
          <button type="button" className={styles.primary} disabled={code.trim().length < 6} onClick={() => void joinCode()}>
            Join
          </button>
        </div>
      </div>

      <div className={styles.actionRow}>
        <label className={styles.search}>
          <Search size={18} aria-hidden="true" />
          <input value={query} placeholder="Search walls" aria-label="Search walls" onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button type="button" className={styles.primary} onClick={() => setCreating(true)}>
          + Start a wall
        </button>
      </div>

      {walls === null && !error ? <AppLoading rows={2} /> : null}
      {error ? <AppError onRetry={() => void load()}>{error}</AppError> : null}
      {walls?.length === 0 && !error ? (
        <div className={styles.empty}>
          <span className={styles.emptyArt}>
            <Users size={40} aria-hidden="true" />
          </span>
          <strong>No walls yet</strong>
          <p>Be the first to open a wall for your hostel or department.</p>
          <button type="button" className={styles.primary} onClick={() => setCreating(true)}>
            Start the first wall
          </button>
        </div>
      ) : null}
      {walls && walls.length > 0 && shown?.length === 0 ? <p className={styles.fine}>No wall matches “{query}”.</p> : null}
      <ul className={styles.list}>
        {shown?.map((w) => (
          <li key={w.id} className={styles.wall}>
            <button type="button" className={styles.wallMain} onClick={() => onOpen(w)}>
              <span className={styles.wallTile} aria-hidden="true">
                {WALL_EMOJI[w.kind] ?? '💬'}
              </span>
              <span className={styles.wallText}>
                <strong>{w.name}</strong>
                <span className={styles.fine}>
                  {WALL_KINDS.find((k) => k.id === w.kind)?.label} · {w.members} member{w.members === 1 ? '' : 's'} · {w.posts} post{w.posts === 1 ? '' : 's'}
                </span>
                {w.description ? <span className={styles.wallDesc}>{w.description}</span> : null}
              </span>
            </button>
            {w.joined ? (
              <span className={styles.joined}>Joined</span>
            ) : (
              <button type="button" className={styles.ghostSm} onClick={() => void join(w)}>
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
      <p className={styles.fine}>Pick what it is for. You get an invite code to share.</p>
      <div className={styles.kindGrid} role="radiogroup" aria-label="Kind of wall">
        {WALL_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="radio"
            aria-checked={kind === k.id}
            className={`${styles.mood} ${kind === k.id ? styles.moodOn : ''}`}
            onClick={() => setKind(k.id)}
          >
            <span className={styles.moodEmoji}>{WALL_EMOJI[k.id]}</span>
            <span>{k.label}</span>
          </button>
        ))}
      </div>
      <input className={styles.input} value={name} maxLength={40} placeholder="Wall name, e.g. Block C girls" aria-label="Wall name" onChange={(e) => setName(e.target.value)} />
      <input className={styles.input} value={description} maxLength={140} placeholder="What is it about? (optional)" aria-label="Description" onChange={(e) => setDescription(e.target.value)} />
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
        <span className={styles.wallTileSm} aria-hidden="true">
          {WALL_EMOJI[wall.kind] ?? '💬'}
        </span>
        <span className={styles.fine}>{wall.members} member{wall.members === 1 ? "" : "s"}</span>
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

function Mine({ flash, onCompose }: { flash: (m: string) => void; onCompose: () => void }) {
  const [sub, setSub] = useState<'posts' | 'comments' | 'likes'>('posts')
  const [posts, setPosts] = useState<AnonPost[] | null>(null)
  const [comments, setComments] = useState<AnonComment[] | null>(null)

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
  const emptyText =
    sub === 'posts' ? ['Nothing confessed yet', 'Your posts live here, only visible to you.'] : sub === 'comments' ? ['No replies yet', 'Jump into a post and say something kind.'] : ['No likes yet', 'Posts you like show up here.']
  return (
    <div className={styles.page}>
      <div className={styles.private}>
        <Lock size={18} aria-hidden="true" />
        <p>Only you can see this page. You are hidden from other students, but not from the admins.</p>
      </div>
      <div className={styles.toggle} role="tablist" aria-label="Mine">
        {(['posts', 'comments', 'likes'] as const).map((s) => (
          <button key={s} type="button" role="tab" aria-selected={sub === s} className={sub === s ? styles.toggleOn : ''} onClick={() => setSub(s)}>
            {s === 'posts' ? 'Posts' : s === 'comments' ? 'Replies' : 'Likes'}
          </button>
        ))}
      </div>
      {(sub === 'comments' ? comments : posts) === null ? <AppLoading rows={2} /> : null}
      {empty ? (
        <div className={styles.empty}>
          <span className={styles.emptyArt}>
            <MaskGlyph size={56} />
          </span>
          <strong>{emptyText[0]}</strong>
          <p>{emptyText[1]}</p>
          {sub === 'posts' ? (
            <button type="button" className={styles.primary} onClick={onCompose}>
              Confess something
            </button>
          ) : null}
        </div>
      ) : null}
      <ul className={styles.list}>
        {sub !== 'comments'
          ? posts?.map((p) => (
              <li key={p.id}>
                <PostCard post={p} compact />
              </li>
            ))
          : comments?.map((c) => (
              <li key={c.id} className={styles.myComment}>
                <MaskAvatar id={c.id} size={28} />
                <div>
                  <span className={styles.fine}>On “{c.postPreview}” · {timeAgo(c.createdAt)}</span>
                  <p>{c.status === 'ok' ? c.body : 'Hidden pending review'}</p>
                </div>
              </li>
            ))}
      </ul>
    </div>
  )
}
