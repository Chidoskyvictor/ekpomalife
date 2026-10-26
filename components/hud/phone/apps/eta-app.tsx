'use client'

import { BadgeCheck, ChevronLeft, Flame, MessageCircle, Plus } from 'lucide-react'
import { Fragment, useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  ETA_POST_MAX,
  createGist,
  fetchFeed,
  fetchProfile,
  fetchThread,
  fetchTopVoices,
  reportGist,
  toggleFire,
  toggleFollow,
  type EtaAuthor,
  type EtaPost,
  type EtaProfile,
  type EtaVoice,
  type FeedTab,
} from '@/lib/game/eta-api'
import styles from './eta.module.css'

type Tab = FeedTab | 'voices'
type View = { name: 'feed' } | { name: 'thread'; id: string } | { name: 'profile'; kind: 'user' | 'npc'; id: string }

const TABS: { id: Tab; label: string }[] = [
  { id: 'foryou', label: 'For you' },
  { id: 'money', label: 'Money' },
  { id: 'following', label: 'Following' },
  { id: 'voices', label: 'Top voices' },
]

function ago(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

const prizeLabel = (n: number) => (n >= 1_000_000 ? `₦${n / 1_000_000}m` : `₦${Math.round(n / 1000)}k`)

function Avatar({ author, size = 38 }: { author: EtaAuthor; size?: number }) {
  return (
    <span className={styles.avatar} style={{ width: size, height: size, background: author.avatar.color, fontSize: size * 0.48 }} aria-hidden="true">
      {author.avatar.emoji ?? author.name.trim()[0]?.toUpperCase() ?? '?'}
    </span>
  )
}

/** NPC: name · gold check · NPC tag. Players: @username only (real names are private). */
export function AuthorName({ author }: { author: EtaAuthor }) {
  return (
    <span className={styles.nameRow}>
      <strong className={styles.name}>{author.npc ? author.name : `@${author.handle}`}</strong>
      {author.npc ? (
        <>
          <BadgeCheck size={15} className={styles.gold} aria-label="Verified" />
          <span className={styles.npcTag}>NPC</span>
        </>
      ) : null}
    </span>
  )
}

/** $TICKER and #tags stand out in the text */
function Body({ text }: { text: string }) {
  const parts = text.split(/(\$[A-Za-z][A-Za-z0-9]{1,9}\b)/g)
  return (
    <p className={styles.body}>
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

export function GistCard({
  post,
  onOpen,
  onAuthor,
  onChange,
}: {
  post: EtaPost
  onOpen?: () => void
  onAuthor?: (author: EtaAuthor) => void
  onChange?: (post: EtaPost) => void
}) {
  const [busy, setBusy] = useState(false)
  const fire = async () => {
    if (busy || post.mine) return
    setBusy(true)
    // Optimistic
    onChange?.({ ...post, liked: !post.liked, likes: post.likes + (post.liked ? -1 : 1) })
    const res = await toggleFire(post.id)
    setBusy(false)
    if (res.ok) onChange?.({ ...post, liked: res.liked, likes: res.likes })
    else onChange?.(post)
  }
  return (
    <article className={`${styles.gist} ${post.giveaway && !post.giveaway.settled ? styles.gistGiveaway : ''}`}>
      <button type="button" className={styles.avatarBtn} onClick={() => onAuthor?.(post.author)} aria-label={`${post.author.name}'s profile`}>
        <Avatar author={post.author} />
      </button>
      <div className={styles.gistMain}>
        <div className={styles.meta}>
          <button type="button" className={styles.metaBtn} onClick={() => onAuthor?.(post.author)}>
            <AuthorName author={post.author} />
          </button>
          <span className={styles.handle}>
            {post.author.npc ? `@${post.author.handle} · ` : ''}
            {ago(post.createdAt)}
          </span>
        </div>
        <div className={styles.clickable} onClick={onOpen} role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined}>
          <Body text={post.body} />
          {post.giveaway ? (
            <span className={styles.giveaway}>
              🎁 {prizeLabel(post.giveaway.prize)} ·{' '}
              {post.giveaway.settled ? 'ended' : <Countdown endsAt={post.giveaway.endsAt} />}
              {!post.giveaway.settled ? ' · reply to enter' : null}
            </span>
          ) : null}
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.action} onClick={onOpen} aria-label="Replies">
            <MessageCircle size={15} aria-hidden="true" /> {post.replies || ''}
          </button>
          <button
            type="button"
            className={`${styles.action} ${post.liked ? styles.fired : ''}`}
            onClick={() => void fire()}
            disabled={post.mine}
            aria-pressed={post.liked}
            aria-label={post.mine ? 'Fire (your gist)' : 'Fire'}
          >
            <Flame size={15} aria-hidden="true" /> {post.likes || ''}
          </button>
        </div>
      </div>
    </article>
  )
}

function Composer({ replyTo, prefill = '', onPosted, onCancel }: { replyTo?: string; prefill?: string; onPosted: (post: EtaPost) => void; onCancel?: () => void }) {
  const [text, setText] = useState(prefill)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const left = ETA_POST_MAX - text.length
  const submit = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    setError(null)
    const res = await createGist(text, replyTo)
    setBusy(false)
    if (res.ok) {
      setText('')
      onPosted(res.post)
    } else {
      setError(res.error)
    }
  }
  return (
    <div className={styles.composer}>
      <textarea
        className={styles.input}
        value={text}
        maxLength={ETA_POST_MAX}
        rows={replyTo ? 2 : 4}
        autoFocus={!replyTo}
        placeholder={replyTo ? 'Drop your reply…' : 'What’s the gist in Ekpoma? Tag coins with $TICKER'}
        onChange={(e) => setText(e.target.value)}
      />
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.composerBar}>
        <span className={left < 20 ? styles.countLow : styles.count}>{left}</span>
        {onCancel ? (
          <button type="button" className={styles.ghost} onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button type="button" className={styles.primary} onClick={() => void submit()} disabled={!text.trim() || busy}>
          {busy ? '…' : replyTo ? 'Reply' : 'Post gist'}
        </button>
      </div>
    </div>
  )
}

/** Gist list that keeps its own like/reply updates. */
export function GistList({ posts, setPosts, onOpen, onAuthor, empty }: {
  posts: EtaPost[]
  setPosts: (update: (posts: EtaPost[]) => EtaPost[]) => void
  onOpen?: (post: EtaPost) => void
  onAuthor?: (author: EtaAuthor) => void
  empty: ReactNode
}) {
  if (!posts.length) return <p className={styles.hint}>{empty}</p>
  return (
    <div className={styles.list}>
      {posts.map((post) => (
        <GistCard
          key={post.id}
          post={post}
          onOpen={onOpen ? () => onOpen(post) : undefined}
          onAuthor={onAuthor}
          onChange={(next) => setPosts((all) => all.map((p) => (p.id === next.id ? next : p)))}
        />
      ))}
    </div>
  )
}

export function EtaApp() {
  const [view, setView] = useState<View>({ name: 'feed' })
  const [tab, setTab] = useState<Tab>('foryou')
  const [composing, setComposing] = useState(false)
  const openAuthor = (author: EtaAuthor) => setView({ name: 'profile', kind: author.kind, id: author.kind === 'npc' ? author.id : author.handle })

  if (view.name === 'thread') return <Thread id={view.id} onBack={() => setView({ name: 'feed' })} onAuthor={openAuthor} />
  if (view.name === 'profile') {
    return (
      <Profile
        kind={view.kind}
        id={view.id}
        onBack={() => setView({ name: 'feed' })}
        onOpen={(post) => setView({ name: 'thread', id: post.id })}
      />
    )
  }

  return (
    <div className={styles.screen}>
      <header className={styles.brand}>
        <span className={styles.wordmark}>ẹta</span>
        <span className={styles.tagline}>Ekpoma’s gist, live</span>
      </header>
      <div className={styles.tabs} role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`${styles.tab} ${tab === t.id ? styles.tabOn : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {composing ? (
        <Composer
          onCancel={() => setComposing(false)}
          onPosted={(post) => {
            setComposing(false)
            setView({ name: 'thread', id: post.id })
          }}
        />
      ) : null}
      {tab === 'voices' ? (
        <TopVoices onAuthor={openAuthor} />
      ) : (
        <Feed key={tab} tab={tab} onOpen={(post) => setView({ name: 'thread', id: post.id })} onAuthor={openAuthor} />
      )}
      {!composing ? (
        <button type="button" className={styles.fab} onClick={() => setComposing(true)}>
          <Plus size={16} aria-hidden="true" /> Gist
        </button>
      ) : null}
    </div>
  )
}

function Feed({ tab, onOpen, onAuthor }: { tab: FeedTab; onOpen: (post: EtaPost) => void; onAuthor: (a: EtaAuthor) => void }) {
  const [posts, setPosts] = useState<EtaPost[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (before?: string) => {
    setLoading(true)
    const res = await fetchFeed(tab, before)
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setError(null)
    setPosts((current) => (before ? [...current, ...res.posts] : res.posts))
    setHasMore(res.hasMore)
  }, [tab])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => {
      if (!document.hidden) void load()
    }, 30_000)
    return () => window.clearInterval(id)
  }, [load])

  if (error && !posts.length) return <p className={styles.error}>{error}</p>
  if (loading && !posts.length) return <p className={styles.hint}>Loading the gist…</p>
  return (
    <>
      <GistList
        posts={posts}
        setPosts={setPosts}
        onOpen={onOpen}
        onAuthor={onAuthor}
        empty={tab === 'following' ? 'Follow people (and NPCs) to fill this up.' : 'No gist yet. Be the first!'}
      />
      {hasMore ? (
        <button type="button" className={styles.more} onClick={() => void load(posts.at(-1)?.id)} disabled={loading}>
          {loading ? 'Loading…' : 'More gist'}
        </button>
      ) : null}
    </>
  )
}

function Thread({ id, onBack, onAuthor }: { id: string; onBack: () => void; onAuthor: (a: EtaAuthor) => void }) {
  const [post, setPost] = useState<EtaPost | null>(null)
  const [replies, setReplies] = useState<EtaPost[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reported, setReported] = useState(false)

  const load = useCallback(async () => {
    const res = await fetchThread(id)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setPost(res.post)
    setReplies(res.replies)
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className={styles.screen}>
      <BackBar title="Gist" onBack={onBack} />
      {error ? <p className={styles.error}>{error}</p> : null}
      {post ? (
        <>
          <GistCard post={post} onAuthor={onAuthor} onChange={setPost} />
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
              {reported ? 'Reported. Thanks.' : 'Report this gist'}
            </button>
          ) : null}
          <Composer
            replyTo={post.id}
            onPosted={(reply) => {
              setReplies((all) => [...all, reply])
              setPost({ ...post, replies: post.replies + 1 })
            }}
          />
          <h3 className={styles.section}>{post.giveaway ? 'Entries · most 🔥 wins' : 'Replies'}</h3>
          <GistList posts={replies} setPosts={setReplies} onAuthor={onAuthor} empty="No replies yet." />
        </>
      ) : !error ? (
        <p className={styles.hint}>Loading…</p>
      ) : null}
    </div>
  )
}

function Profile({ kind, id, onBack, onOpen }: { kind: 'user' | 'npc'; id: string; onBack: () => void; onOpen: (post: EtaPost) => void }) {
  const [profile, setProfile] = useState<EtaProfile | null>(null)
  const [posts, setPosts] = useState<EtaPost[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetchProfile(kind, id).then((res) => {
      if (!res.ok) return setError(res.error)
      setProfile(res.profile)
      setPosts(res.posts)
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

  return (
    <div className={styles.screen}>
      <BackBar title="Profile" onBack={onBack} />
      {error ? <p className={styles.error}>{error}</p> : null}
      {profile ? (
        <>
          <section className={styles.profileHead}>
            <Avatar author={profile.author} size={64} />
            <AuthorName author={profile.author} />
            {profile.author.npc ? <span className={styles.handle}>@{profile.author.handle}</span> : null}
            {profile.bio ? <p className={styles.bio}>{profile.bio}</p> : null}
            {profile.author.npc ? (
              <p className={styles.npcNote}>Game character. Its calls raise the odds, they never guarantee a win.</p>
            ) : (
              <p className={styles.counts}>
                <strong>{profile.followers}</strong> followers · <strong>{profile.following}</strong> following
              </p>
            )}
            {!profile.isMe ? (
              <button type="button" className={profile.isFollowing ? styles.ghost : styles.primary} onClick={() => void follow()}>
                {profile.isFollowing ? 'Following' : 'Follow'}
              </button>
            ) : null}
          </section>
          <GistList posts={posts} setPosts={setPosts} onOpen={onOpen} empty="No gist yet." />
        </>
      ) : !error ? (
        <p className={styles.hint}>Loading…</p>
      ) : null}
    </div>
  )
}

function TopVoices({ onAuthor }: { onAuthor: (a: EtaAuthor) => void }) {
  const [voices, setVoices] = useState<EtaVoice[] | null>(null)
  useEffect(() => {
    void fetchTopVoices().then((res) => setVoices(res.ok ? res.voices : []))
  }, [])
  if (!voices) return <p className={styles.hint}>Loading…</p>
  if (!voices.length) return <p className={styles.hint}>No influencers yet. Post gist and get the 🔥 to top this list.</p>
  return (
    <div className={styles.list}>
      <p className={styles.fine}>Real players only. Followers and 🔥 this week.</p>
      {voices.map((voice, i) => (
        <button key={voice.author.id} type="button" className={styles.voice} onClick={() => onAuthor(voice.author)}>
          <span className={styles.rank}>{i + 1}</span>
          <Avatar author={voice.author} size={34} />
          <span className={styles.voiceText}>
            <AuthorName author={voice.author} />
            {voice.author.npc ? <span className={styles.handle}>@{voice.author.handle}</span> : null}
          </span>
          <span className={styles.voiceStats}>
            {voice.followers} followers · {voice.fire} 🔥
          </span>
        </button>
      ))}
    </div>
  )
}

function BackBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className={styles.backBar}>
      <button type="button" className={styles.back} onClick={onBack} aria-label="Back">
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
      <strong>{title}</strong>
      <span className={styles.backSpacer} aria-hidden="true" />
    </div>
  )
}
