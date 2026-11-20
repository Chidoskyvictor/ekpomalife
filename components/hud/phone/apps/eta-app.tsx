'use client'

import { hapticTap } from '@/components/hud/haptic'
import { PlayerFace } from '@/components/look/player-face'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { playSfx } from '@/lib/audio/sfx'
import { BadgeCheck, BarChart2, Heart, ImagePlus, MessageCircle, Plus, Repeat2, X } from 'lucide-react'
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ETA_POST_MAX,
  createGist,
  fetchFeed,
  fetchProfile,
  fetchThread,
  loadGistPhoto,
  reportGist,
  sendViews,
  toggleFire,
  toggleFollow,
  toggleRepost,
  uploadGistPhoto,
  type EtaAuthor,
  type EtaPost,
  type EtaProfile,
  type FeedTab,
} from '@/lib/game/eta-api'
import { BackButton } from '../app-header'
import { AppEmpty, AppLoading } from '../app-state'
import { EtaLogo } from './eta-logo'
import styles from './eta.module.css'
import { shrinkPhoto, type PhotoDraft } from './photo-chat'

/* ẹta — Ekpoma's own X-style feed: For you / Following, post cards, compose sheet, post page, profiles. */

type View = { name: 'feed' } | { name: 'thread'; id: string } | { name: 'profile'; kind: 'user' | 'npc'; id: string }

const TABS: { id: FeedTab; label: string }[] = [
  { id: 'foryou', label: 'For you' },
  { id: 'following', label: 'Following' },
]

function ago(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

/** 1,234 → 1.2K · 1,500,000 → 1.5M */
export function compact(n: number) {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}K`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}

const prizeLabel = (n: number) => (n >= 1_000_000 ? `₦${n / 1_000_000}m` : `₦${Math.round(n / 1000)}k`)

function Avatar({ author, size = 40 }: { author: EtaAuthor; size?: number }) {
  return (
    <PlayerFace
      className={styles.avatar}
      look={author.npc ? null : author.avatar.look}
      color={author.avatar.color}
      emoji={author.avatar.emoji}
      label={author.name}
      size={size}
    />
  )
}

/** Display name + gold check for NPCs. Players show @username as their name (real names are private). */
export function AuthorName({ author }: { author: EtaAuthor }) {
  return (
    <span className={styles.nameRow}>
      <strong className={styles.name}>{author.npc ? author.name : author.handle}</strong>
      {author.npc ? (
        <>
          <BadgeCheck size={16} className={styles.gold} aria-label="Verified" />
          <span className={styles.npcTag}>NPC</span>
        </>
      ) : null}
    </span>
  )
}

/** $TICKER stands out in the text */
function Body({ text, large = false }: { text: string; large?: boolean }) {
  const parts = text.split(/(\$[A-Za-z][A-Za-z0-9]{1,9}\b)/g)
  return (
    <p className={`${styles.body} ${large ? styles.bodyLarge : ''}`}>
      {parts.map((part, i) =>
        /^\$[A-Za-z]/.test(part) ? (
          <span key={i} className={styles.ticker}>
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </p>
  )
}

function Countdown({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  const mins = Math.max(0, Math.round((new Date(endsAt).getTime() - now) / 60_000))
  return <>{mins > 0 ? `ends in ${mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`}` : 'picking a winner…'}</>
}

/** A gist photo: fetched with the login cookie, shown at its own shape (capped height). */
function PostPhoto({ photo }: { photo: NonNullable<EtaPost['photo']> }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void loadGistPhoto(photo.url).then((url) => alive && setSrc(url))
    return () => {
      alive = false
    }
  }, [photo.url])
  return (
    <div className={styles.photo} style={{ aspectRatio: `${Math.min(Math.max(photo.w / photo.h, 0.8), 2)}` }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob URL
        <img src={src} alt="Photo attached to the post" draggable={false} />
      ) : null}
    </div>
  )
}

/** Reply / repost / like / views, with optimistic updates. */
function ActionBar({
  post,
  onReply,
  onChange,
  spread = false,
}: {
  post: EtaPost
  onReply?: () => void
  onChange?: (patch: Partial<EtaPost>) => void
  spread?: boolean
}) {
  const [busy, setBusy] = useState<'like' | 'repost' | null>(null)
  const [pop, setPop] = useState<'like' | 'repost' | null>(null)

  const like = async () => {
    if (busy || post.mine) return
    setBusy('like')
    if (!post.liked) {
      setPop('like')
      hapticTap()
      playSfx('grab')
    }
    onChange?.({ liked: !post.liked, likes: post.likes + (post.liked ? -1 : 1) })
    const res = await toggleFire(post.id)
    setBusy(null)
    onChange?.(res.ok ? { liked: res.liked, likes: res.likes } : { liked: post.liked, likes: post.likes })
  }
  const repost = async () => {
    if (busy) return
    setBusy('repost')
    if (!post.reposted) {
      setPop('repost')
      hapticTap()
    }
    onChange?.({ reposted: !post.reposted, reposts: post.reposts + (post.reposted ? -1 : 1) })
    const res = await toggleRepost(post.id)
    setBusy(null)
    onChange?.(res.ok ? { reposted: res.reposted, reposts: res.reposts } : { reposted: post.reposted, reposts: post.reposts })
  }

  return (
    <div className={`${styles.actions} ${spread ? styles.actionsSpread : ''}`}>
      <button type="button" className={`${styles.action} ${styles.actReply}`} onClick={onReply} aria-label={`Reply, ${post.replies} replies`}>
        <MessageCircle size={18} aria-hidden="true" />
        <span>{post.replies ? compact(post.replies) : ''}</span>
      </button>
      <button
        type="button"
        className={`${styles.action} ${styles.actRepost} ${post.reposted ? styles.on : ''}`}
        onClick={() => void repost()}
        aria-pressed={post.reposted}
        aria-label={`Repost, ${post.reposts} reposts`}
      >
        <Repeat2 key={pop === 'repost' ? post.reposts : 'r'} size={19} aria-hidden="true" className={pop === 'repost' && post.reposted ? styles.pop : ''} />
        <span>{post.reposts ? compact(post.reposts) : ''}</span>
      </button>
      <button
        type="button"
        className={`${styles.action} ${styles.actLike} ${post.liked ? styles.on : ''}`}
        onClick={() => void like()}
        aria-pressed={post.liked}
        aria-label={post.mine ? `Likes on your post, ${post.likes}` : `Like, ${post.likes} likes`}
      >
        <Heart key={pop === 'like' ? post.likes : 'l'} size={18} aria-hidden="true" fill={post.liked ? 'currentColor' : 'none'} className={pop === 'like' && post.liked ? styles.pop : ''} />
        <span>{post.likes ? compact(post.likes) : ''}</span>
      </button>
      <span className={`${styles.action} ${styles.actViews}`} aria-label={`${post.views} views`}>
        <BarChart2 size={18} aria-hidden="true" />
        <span>{post.views ? compact(post.views) : ''}</span>
      </span>
    </div>
  )
}

export function GistCard({
  post,
  onOpen,
  onAuthor,
  onChange,
  onReply,
  reply = false,
}: {
  post: EtaPost
  onOpen?: () => void
  onAuthor?: (author: EtaAuthor) => void
  onChange?: (patch: Partial<EtaPost>) => void
  onReply?: () => void
  /** Smaller card used for replies in a post page. */
  reply?: boolean
}) {
  return (
    <article className={`${styles.gist} ${post.giveaway && !post.giveaway.settled ? styles.gistGiveaway : ''} ${reply ? styles.gistReply : ''}`}>
      <button type="button" className={styles.avatarBtn} onClick={() => onAuthor?.(post.author)} aria-label={`${post.author.name}'s profile`}>
        <Avatar author={post.author} />
      </button>
      <div className={styles.gistMain}>
        <div className={styles.meta}>
          <button type="button" className={styles.metaBtn} onClick={() => onAuthor?.(post.author)}>
            <AuthorName author={post.author} />
          </button>
          <span className={styles.handle}>
            @{post.author.handle} · {ago(post.createdAt)}
          </span>
        </div>
        <div className={styles.clickable} onClick={onOpen} role={onOpen ? 'link' : undefined} tabIndex={onOpen ? 0 : undefined} onKeyDown={(e) => e.key === 'Enter' && onOpen?.()}>
          {post.body ? <Body text={post.body} /> : null}
          {post.photo ? <PostPhoto photo={post.photo} /> : null}
          {post.giveaway ? (
            <span className={styles.giveaway}>
              🎁 {prizeLabel(post.giveaway.prize)} · {post.giveaway.settled ? 'ended' : <Countdown endsAt={post.giveaway.endsAt} />}
              {!post.giveaway.settled ? ' · reply to enter' : null}
            </span>
          ) : null}
        </div>
        <ActionBar post={post} onChange={onChange} onReply={onReply ?? onOpen} />
      </div>
    </article>
  )
}

/** Compose sheet: text, optional photo, character count, Post button. Used for new posts and replies. */
function ComposeSheet({
  open,
  replyTo,
  replyingTo,
  onClose,
  onPosted,
}: {
  open: boolean
  replyTo?: string
  replyingTo?: string
  onClose: () => void
  onPosted: (post: EtaPost) => void
}) {
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState<PhotoDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const left = ETA_POST_MAX - text.length

  const reset = () => {
    setText('')
    setPhoto(null)
    setError(null)
  }
  const pick = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    const draft = await shrinkPhoto(file)
    if (!draft || draft.blob.size > 300_000) return setError('That photo is too big. Try another.')
    setPhoto(draft)
  }
  const submit = async () => {
    if ((!text.trim() && !photo) || busy) return
    setBusy(true)
    setError(null)
    let photoId: string | undefined
    if (photo) {
      const up = await uploadGistPhoto(photo.blob, photo.w, photo.h)
      if (!up.ok) {
        setBusy(false)
        return setError(up.error)
      }
      photoId = up.id
    }
    const res = await createGist(text, replyTo, photoId)
    setBusy(false)
    if (!res.ok) return setError(res.error)
    hapticTap()
    reset()
    onPosted(res.post)
  }
  const ring = Math.min(1, text.length / ETA_POST_MAX)

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={replyTo ? 'Reply' : 'New post'}
      subtitle={replyingTo ? `Replying to @${replyingTo}` : undefined}
      icon={<EtaLogo size={22} />}
      startExpanded
      className={styles.sheet}
      footer={
        <div className={styles.composeFoot}>
          <button type="button" className={styles.tool} onClick={() => fileRef.current?.click()} aria-label="Add a photo" disabled={busy}>
            <ImagePlus size={22} aria-hidden="true" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0]).then(() => (e.target.value = ''))} />
          <span className={styles.spacer} />
          <svg className={styles.ring} viewBox="0 0 24 24" width={26} height={26} aria-hidden="true">
            <circle cx="12" cy="12" r="9" className={styles.ringTrack} />
            <circle cx="12" cy="12" r="9" className={left < 20 ? styles.ringLow : styles.ringFill} strokeDasharray={`${ring * 56.5} 56.5`} transform="rotate(-90 12 12)" />
          </svg>
          {left < 20 ? <span className={styles.countLow}>{left}</span> : null}
          <button type="button" className={styles.postBtn} onClick={() => void submit()} disabled={(!text.trim() && !photo) || busy}>
            {busy ? '…' : replyTo ? 'Reply' : 'Post'}
          </button>
        </div>
      }
    >
      <textarea
        className={styles.input}
        value={text}
        maxLength={ETA_POST_MAX}
        rows={5}
        autoFocus
        placeholder={replyTo ? 'Post your reply' : 'What’s the gist in Ekpoma? Tag coins with $TICKER'}
        onChange={(e) => setText(e.target.value)}
      />
      {photo ? (
        <div className={styles.preview}>
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
          <img src={photo.url} alt="Photo to post" />
          <button type="button" className={styles.previewX} onClick={() => setPhoto(null)} aria-label="Remove photo">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}
    </BottomSheet>
  )
}

/** Post list that keeps its own like/repost updates. */
export function GistList({
  posts,
  setPosts,
  onOpen,
  onAuthor,
  empty,
  replies = false,
}: {
  posts: EtaPost[]
  setPosts: (update: (posts: EtaPost[]) => EtaPost[]) => void
  onOpen?: (post: EtaPost) => void
  onAuthor?: (author: EtaAuthor) => void
  empty: ReactNode
  replies?: boolean
}) {
  if (!posts.length) return <AppEmpty icon={<EtaLogo size={34} />}>{empty}</AppEmpty>
  return (
    <div className={styles.list}>
      {posts.map((post) => (
        <GistCard
          key={post.id}
          post={post}
          onOpen={onOpen ? () => onOpen(post) : undefined}
          onAuthor={onAuthor}
          reply={replies}
          onChange={(patch) => setPosts((all) => all.map((p) => (p.id === post.id ? { ...p, ...patch } : p)))}
        />
      ))}
    </div>
  )
}

export function EtaApp({ onHome }: { onHome?: () => void } = {}) {
  const [view, setView] = useState<View>({ name: 'feed' })
  const [tab, setTab] = useState<FeedTab>('foryou')
  const [composing, setComposing] = useState(false)
  const [feedKey, setFeedKey] = useState(0)
  const openAuthor = (author: EtaAuthor) => setView({ name: 'profile', kind: author.kind, id: author.kind === 'npc' ? author.id : author.handle })
  const openPost = (post: EtaPost) => setView({ name: 'thread', id: post.id })

  if (view.name === 'thread') return <Thread id={view.id} onBack={() => setView({ name: 'feed' })} onAuthor={openAuthor} />
  if (view.name === 'profile') {
    return <Profile kind={view.kind} id={view.id} onBack={() => setView({ name: 'feed' })} />
  }

  return (
    <div className={styles.screen}>
      <header className={styles.top}>
        <div className={styles.brand}>
          {onHome ? <BackButton onBack={onHome} label="Back home" /> : <span className={styles.brandSide} />}
          <EtaLogo size={22} className={styles.logo} title="ẹta" />
          <span className={styles.brandSide} />
        </div>
        <div className={styles.tabs} role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`${styles.tab} ${tab === t.id ? styles.tabOn : ''}`} onClick={() => setTab(t.id)}>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </header>
      <Feed key={`${tab}-${feedKey}`} tab={tab} onOpen={openPost} onAuthor={openAuthor} onCompose={() => setComposing(true)} />
      <button type="button" className={styles.fab} onClick={() => setComposing(true)} aria-label="New post">
        <Plus size={26} strokeWidth={2.4} aria-hidden="true" />
      </button>
      <ComposeSheet
        open={composing}
        onClose={() => setComposing(false)}
        onPosted={(post) => {
          setComposing(false)
          setTab('foryou')
          setFeedKey((n) => n + 1)
          setView({ name: 'thread', id: post.id })
        }}
      />
    </div>
  )
}

/** Posts the player has already scrolled past are counted once per session. */
const seen = new Set<string>()
function countViews(posts: EtaPost[]) {
  const fresh = posts.filter((p) => !seen.has(p.id)).map((p) => p.id)
  if (!fresh.length) return
  fresh.forEach((id) => seen.add(id))
  void sendViews(fresh.slice(0, 30))
}

function Feed({ tab, onOpen, onAuthor, onCompose }: { tab: FeedTab; onOpen: (post: EtaPost) => void; onAuthor: (a: EtaAuthor) => void; onCompose: () => void }) {
  const [posts, setPosts] = useState<EtaPost[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (before?: string) => {
      setLoading(true)
      const res = await fetchFeed(tab, before)
      setLoading(false)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setError(null)
      countViews(res.posts)
      // Keep the player's own like/repost taps when the 30s refresh lands
      setPosts((current) => (before ? [...current, ...res.posts] : res.posts))
      setHasMore(res.hasMore)
    },
    [tab],
  )

  useEffect(() => {
    void load()
    const id = window.setInterval(() => {
      if (!document.hidden) void load()
    }, 30_000)
    return () => window.clearInterval(id)
  }, [load])

  if (error && !posts.length) return <p className={styles.error}>{error}</p>
  if (loading && !posts.length) return <AppLoading label="Loading the gist…" rows={4} />
  return (
    <>
      <GistList
        posts={posts}
        setPosts={setPosts}
        onOpen={onOpen}
        onAuthor={onAuthor}
        empty={
          tab === 'following' ? (
            <>
              You’re not following anyone yet. Open a profile from For you and tap Follow.
            </>
          ) : (
            <>
              No posts yet. <button type="button" className={styles.linkBtn} onClick={onCompose}>Write the first one</button>
            </>
          )
        }
      />
      {hasMore ? (
        <button type="button" className={styles.more} onClick={() => void load(posts.at(-1)?.id)} disabled={loading}>
          {loading ? 'Loading…' : 'Show more'}
        </button>
      ) : null}
    </>
  )
}

function BackBar({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <div className={styles.backBar}>
      <BackButton onBack={onBack} label="Back" />
      <div className={styles.backTitle}>
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
    </div>
  )
}

const fullDate = (iso: string) => {
  const d = new Date(iso)
  return `${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

function Thread({ id, onBack, onAuthor }: { id: string; onBack: () => void; onAuthor: (a: EtaAuthor) => void }) {
  const [post, setPost] = useState<EtaPost | null>(null)
  const [replies, setReplies] = useState<EtaPost[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reported, setReported] = useState(false)
  const [replying, setReplying] = useState(false)

  const load = useCallback(async () => {
    const res = await fetchThread(id)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setPost(res.post)
    setReplies(res.replies)
    countViews([res.post])
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className={styles.screen}>
      <BackBar title="Post" onBack={onBack} />
      {error ? <p className={styles.error}>{error}</p> : null}
      {post ? (
        <>
          <article className={styles.detail}>
            <div className={styles.detailHead}>
              <button type="button" className={styles.avatarBtn} onClick={() => onAuthor(post.author)} aria-label={`${post.author.name}'s profile`}>
                <Avatar author={post.author} size={46} />
              </button>
              <button type="button" className={styles.detailWho} onClick={() => onAuthor(post.author)}>
                <AuthorName author={post.author} />
                <span className={styles.handle}>@{post.author.handle}</span>
              </button>
            </div>
            {post.body ? <Body text={post.body} large /> : null}
            {post.photo ? <PostPhoto photo={post.photo} /> : null}
            {post.giveaway ? (
              <span className={styles.giveaway}>
                🎁 {prizeLabel(post.giveaway.prize)} · {post.giveaway.settled ? 'ended' : <Countdown endsAt={post.giveaway.endsAt} />}
                {!post.giveaway.settled ? ' · reply to enter. Most likes wins' : null}
              </span>
            ) : null}
            <p className={styles.stamp}>
              {fullDate(post.createdAt)} · <strong>{compact(post.views)}</strong> Views
            </p>
            <div className={styles.stats}>
              <span>
                <strong>{compact(post.reposts)}</strong> Reposts
              </span>
              <span>
                <strong>{compact(post.likes)}</strong> Likes
              </span>
              <span>
                <strong>{compact(post.replies)}</strong> Replies
              </span>
            </div>
            <ActionBar post={post} onChange={(patch) => setPost((p) => (p ? { ...p, ...patch } : p))} onReply={() => setReplying(true)} spread />
          </article>
          <button type="button" className={styles.replyRow} onClick={() => setReplying(true)}>
            <EtaLogo size={22} />
            <span>Post your reply</span>
            <b>Reply</b>
          </button>
          {replies.length ? (
            <GistList posts={replies} setPosts={setReplies} onAuthor={onAuthor} empty="" replies />
          ) : (
            <AppEmpty icon={<MessageCircle size={32} />}>No replies yet. Say something first.</AppEmpty>
          )}
          {!post.mine && !post.author.npc ? (
            <button
              type="button"
              className={styles.report}
              disabled={reported}
              onClick={async () => {
                const res = await reportGist(post.id)
                if (res.ok) setReported(true)
              }}
            >
              {reported ? 'Reported. Thanks.' : 'Report this post'}
            </button>
          ) : null}
          <ComposeSheet
            open={replying}
            replyTo={post.id}
            replyingTo={post.author.handle}
            onClose={() => setReplying(false)}
            onPosted={(reply) => {
              setReplying(false)
              setReplies((all) => [...all, reply])
              setPost({ ...post, replies: post.replies + 1 })
            }}
          />
        </>
      ) : !error ? (
        <AppLoading rows={4} />
      ) : null}
    </div>
  )
}

function Profile({ kind, id, onBack }: { kind: 'user' | 'npc'; id: string; onBack: () => void }) {
  const [profile, setProfile] = useState<EtaProfile | null>(null)
  const [posts, setPosts] = useState<EtaPost[]>([])
  const [error, setError] = useState<string | null>(null)
  const [openThread, setOpenThread] = useState<string | null>(null)

  useEffect(() => {
    void fetchProfile(kind, id).then((res) => {
      if (!res.ok) return setError(res.error)
      setProfile(res.profile)
      setPosts(res.posts)
      countViews(res.posts)
    })
  }, [kind, id])

  const follow = async () => {
    if (!profile) return
    const res = await toggleFollow(profile.author.kind, profile.author.id)
    if (res.ok) {
      setProfile({
        ...profile,
        isFollowing: res.following,
        followers: profile.followers === null ? null : profile.followers + (res.following ? 1 : -1),
      })
    }
  }

  if (openThread) return <Thread id={openThread} onBack={() => setOpenThread(null)} onAuthor={() => setOpenThread(null)} />

  return (
    <div className={styles.screen}>
      <BackBar title={profile ? profile.author.name : 'Profile'} subtitle={profile ? `${posts.length} posts` : undefined} onBack={onBack} />
      {error ? <p className={styles.error}>{error}</p> : null}
      {profile ? (
        <>
          <section className={styles.profileHead}>
            <div className={styles.banner} style={{ ['--c' as string]: profile.author.avatar.color }} />
            <div className={styles.profileRow}>
              <span className={styles.profileAvatar}>
                <Avatar author={profile.author} size={76} />
              </span>
              {!profile.isMe ? (
                <button type="button" className={profile.isFollowing ? styles.followingBtn : styles.followBtn} onClick={() => void follow()} aria-pressed={profile.isFollowing}>
                  {profile.isFollowing ? 'Following' : 'Follow'}
                </button>
              ) : null}
            </div>
            <div className={styles.profileText}>
              <AuthorName author={profile.author} />
              <span className={styles.handle}>@{profile.author.handle}</span>
              {profile.bio ? <p className={styles.bio}>{profile.bio}</p> : null}
              {profile.author.npc ? <p className={styles.npcNote}>Game character. Its calls raise the odds, they never guarantee a win.</p> : null}
              <p className={styles.counts}>
                <span>
                  <strong>{compact(profile.following ?? 0)}</strong> Following
                </span>
                <span>
                  <strong>{compact(profile.followers ?? 0)}</strong> Followers
                </span>
              </p>
            </div>
          </section>
          <div className={styles.tabs} role="tablist">
            <button type="button" role="tab" aria-selected className={`${styles.tab} ${styles.tabOn}`}>
              <span>Posts</span>
            </button>
          </div>
          <GistList posts={posts} setPosts={setPosts} onOpen={(post) => setOpenThread(post.id)} empty="No posts yet." />
        </>
      ) : !error ? (
        <AppLoading rows={4} />
      ) : null}
    </div>
  )
}
