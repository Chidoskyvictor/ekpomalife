'use client'

import { Heart, MessageCircle, MoreHorizontal, Send, Share2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CATEGORIES,
  COLORS,
  COMMENT_MAX,
  POST_MAX,
  REPORT_REASONS,
  addComment,
  blockCommentAuthor,
  blockPostAuthor,
  categoryLabel,
  createPost,
  fetchComments,
  fetchFeed,
  hidePost,
  reportComment,
  reportPost,
  shareUrl,
  toggleLike,
  type AnonCategory,
  type AnonColor,
  type AnonComment,
  type AnonPost,
  type AnonYou,
} from '@/lib/game/anonymous-api'
import styles from './anonymous.module.css'

export const timeAgo = (iso: string) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

const textClass = (body: string) => (body.length <= 80 ? styles.textL : body.length <= 220 ? styles.textM : styles.textS)

export function PostCard({
  post,
  onLike,
  onComments,
  onShare,
  onMenu,
  compact = false,
}: {
  post: AnonPost
  onLike?: () => void
  onComments?: () => void
  onShare?: () => void
  onMenu?: () => void
  compact?: boolean
}) {
  const [bg, fg] = COLORS[post.color] ?? COLORS.violet
  return (
    <article className={`${styles.card} ${compact ? styles.cardCompact : ''}`} style={{ background: bg, color: fg }}>
      <div className={styles.cardTop}>
        <span className={styles.pill}>{post.communityName ?? categoryLabel(post.category)}</span>
        {post.mine ? <span className={styles.youBadge}>You</span> : null}
        {post.status !== 'ok' ? <span className={styles.pill}>{post.status === 'hidden' ? 'Under review' : 'Removed'}</span> : null}
        <span className={styles.spacer} />
        {onMenu ? (
          <button type="button" className={styles.iconBtn} aria-label="More" onClick={onMenu}>
            <MoreHorizontal size={22} />
          </button>
        ) : null}
      </div>
      <p className={`${styles.cardText} ${textClass(post.body)}`}>{post.body}</p>
      <div className={styles.cardBottom}>
        <span className={styles.who}>Anonymous · {timeAgo(post.createdAt)}</span>
        <span className={styles.spacer} />
        <button type="button" className={styles.act} aria-label={post.liked ? 'Unlike' : 'Like'} aria-pressed={post.liked} onClick={onLike} disabled={!onLike}>
          <Heart size={24} fill={post.liked ? 'currentColor' : 'none'} />
          <span>{post.likes}</span>
        </button>
        <button type="button" className={styles.act} aria-label="Comments" onClick={onComments} disabled={!onComments}>
          <MessageCircle size={24} />
          <span>{post.comments}</span>
        </button>
        {onShare ? (
          <button type="button" className={styles.act} aria-label="Share" onClick={onShare}>
            <Share2 size={22} />
          </button>
        ) : null}
      </div>
    </article>
  )
}

/* ---------- reasons / actions sheet ---------- */

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className={styles.sheetWrap}>
      <div className={styles.sheetBackdrop} onClick={onClose} aria-hidden="true" />
      <div className={styles.sheet} role="dialog" aria-label={title}>
        <div className={styles.sheetHead}>
          <strong>{title}</strong>
          <button type="button" className={styles.iconBtnDark} aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ReportList({ onPick, onBack }: { onPick: (r: (typeof REPORT_REASONS)[number]['id']) => void; onBack: () => void }) {
  return (
    <div className={styles.menuList}>
      <p className={styles.fine}>Why are you reporting this? 3 reports hide it until an admin looks.</p>
      {REPORT_REASONS.map((r) => (
        <button key={r.id} type="button" className={styles.menuItem} onClick={() => onPick(r.id)}>
          {r.label}
        </button>
      ))}
      <button type="button" className={styles.menuItem} onClick={onBack}>
        Cancel
      </button>
    </div>
  )
}

/* ---------- feed ---------- */

export function Feed({
  wallId,
  wallName,
  flash,
  onYou,
  onCompose,
}: {
  wallId?: string
  wallName?: string
  flash: (m: string) => void
  onYou?: (you: AnonYou) => void
  /** Bumped by the parent after a post, to reload */
  onCompose: () => void
}) {
  const [sort, setSort] = useState<'new' | 'trending'>('new')
  const [category, setCategory] = useState<string>('')
  const [posts, setPosts] = useState<AnonPost[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [more, setMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [commentsFor, setCommentsFor] = useState<AnonPost | null>(null)
  const [menuFor, setMenuFor] = useState<AnonPost | null>(null)
  const [reporting, setReporting] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setPosts(null)
    setError(null)
    const res = await fetchFeed({ sort, category: category || undefined, wall: wallId })
    if (!res.ok) {
      setError(res.status === 401 ? 'Log in to see Anonymous.' : res.status && res.status >= 404 ? "Anonymous isn't switched on yet. Check back soon." : res.error)
      setPosts([])
      return
    }
    setPosts(res.posts)
    setMore(sort === 'new' && res.posts.length >= 20)
    onYou?.(res.you)
    scroller.current?.scrollTo({ top: 0 })
  }, [sort, category, wallId, onYou])

  useEffect(() => {
    void load()
  }, [load])

  async function loadMore() {
    if (!posts?.length || loadingMore || !more) return
    setLoadingMore(true)
    const res = await fetchFeed({ sort, category: category || undefined, wall: wallId, before: posts[posts.length - 1].createdAt })
    setLoadingMore(false)
    if (!res.ok) return
    setPosts((prev) => [...(prev ?? []), ...res.posts.filter((p) => !(prev ?? []).some((x) => x.id === p.id))])
    setMore(res.posts.length >= 20)
  }

  function onScroll() {
    const el = scroller.current
    if (el && el.scrollTop + el.clientHeight * 2 > el.scrollHeight) void loadMore()
  }

  async function like(post: AnonPost) {
    // Optimistic, rolled back on failure
    const flip = (p: AnonPost): AnonPost => (p.id === post.id ? { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) } : p)
    setPosts((prev) => prev?.map(flip) ?? prev)
    const res = await toggleLike(post.id)
    if (!res.ok) {
      setPosts((prev) => prev?.map(flip) ?? prev)
      flash(res.error)
      return
    }
    setPosts((prev) => prev?.map((p) => (p.id === post.id ? { ...p, liked: res.liked, likes: res.likes } : p)) ?? prev)
  }

  async function share(post: AnonPost) {
    const url = shareUrl(post.id)
    try {
      if (navigator.share) await navigator.share({ title: 'Anonymous', text: post.body.slice(0, 80), url })
      else {
        await navigator.clipboard.writeText(url)
        flash('Link copied')
      }
    } catch {
      /* cancelled */
    }
  }

  const drop = (id: string) => setPosts((prev) => prev?.filter((p) => p.id !== id) ?? prev)

  async function runMenu(kind: 'hide' | 'block') {
    if (!menuFor) return
    const post = menuFor
    setMenuFor(null)
    const res = kind === 'hide' ? await hidePost(post.id) : await blockPostAuthor(post.id)
    if (!res.ok) return flash(res.error)
    drop(post.id)
    flash(kind === 'hide' ? 'Hidden for you' : "Blocked. You won't see them again, and they won't know.")
  }

  async function doReport(reason: (typeof REPORT_REASONS)[number]['id']) {
    if (!menuFor) return
    const post = menuFor
    setMenuFor(null)
    setReporting(false)
    const res = await reportPost(post.id, reason)
    flash(res.ok ? (res.already ? 'You already reported this' : 'Reported. Thank you.') : res.error)
  }

  return (
    <div className={styles.feedWrap}>
      <div className={styles.filters}>
        <div className={styles.toggle} role="tablist" aria-label="Sort">
          <button type="button" role="tab" aria-selected={sort === 'new'} className={sort === 'new' ? styles.toggleOn : ''} onClick={() => setSort('new')}>
            New
          </button>
          <button type="button" role="tab" aria-selected={sort === 'trending'} className={sort === 'trending' ? styles.toggleOn : ''} onClick={() => setSort('trending')}>
            🔥 Trending
          </button>
        </div>
        <div className={styles.chips}>
          <button type="button" className={`${styles.chip} ${category === '' ? styles.chipOn : ''}`} onClick={() => setCategory('')}>
            All
          </button>
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" className={`${styles.chip} ${category === c.id ? styles.chipOn : ''}`} onClick={() => setCategory(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.scroller} ref={scroller} onScroll={onScroll}>
        {posts === null ? <p className={styles.state}>Loading…</p> : null}
        {error ? (
          <div className={styles.state}>
            <p>{error}</p>
            <button type="button" className={styles.ghost} onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : null}
        {posts?.length === 0 && !error ? (
          <div className={styles.state}>
            <p>{wallName ? `Nothing on ${wallName} yet.` : 'Nothing here yet.'}</p>
            <button type="button" className={styles.ghost} onClick={onCompose}>
              Be the first to post
            </button>
          </div>
        ) : null}
        {posts?.map((post) => (
          <div key={post.id} className={styles.snap}>
            <PostCard
              post={post}
              onLike={() => void like(post)}
              onComments={() => setCommentsFor(post)}
              onShare={() => void share(post)}
              onMenu={() => setMenuFor(post)}
            />
          </div>
        ))}
        {loadingMore ? <p className={styles.state}>Loading…</p> : null}
      </div>

      {commentsFor ? (
        <Comments
          post={commentsFor}
          flash={flash}
          onClose={() => setCommentsFor(null)}
          onAdded={() => setPosts((prev) => prev?.map((p) => (p.id === commentsFor.id ? { ...p, comments: p.comments + 1 } : p)) ?? prev)}
        />
      ) : null}

      {menuFor ? (
        <Sheet title="This post" onClose={() => { setMenuFor(null); setReporting(false) }}>
          {reporting ? (
            <ReportList onPick={(r) => void doReport(r)} onBack={() => setReporting(false)} />
          ) : (
            <div className={styles.menuList}>
              <button type="button" className={styles.menuItem} onClick={() => void runMenu('hide')}>
                Hide this post for me
              </button>
              {!menuFor.mine ? (
                <>
                  <button type="button" className={styles.menuItem} onClick={() => void runMenu('block')}>
                    Block this author
                  </button>
                  <button type="button" className={`${styles.menuItem} ${styles.danger}`} onClick={() => setReporting(true)}>
                    Report
                  </button>
                </>
              ) : null}
            </div>
          )}
        </Sheet>
      ) : null}
    </div>
  )
}

/* ---------- comments ---------- */

function Comments({ post, flash, onClose, onAdded }: { post: AnonPost; flash: (m: string) => void; onClose: () => void; onAdded: () => void }) {
  const [items, setItems] = useState<AnonComment[] | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [menu, setMenu] = useState<AnonComment | null>(null)
  const [reporting, setReporting] = useState(false)

  useEffect(() => {
    void fetchComments(post.id).then((res) => {
      if (res.ok) setItems(res.comments)
      else {
        flash(res.error)
        setItems([])
      }
    })
  }, [post.id, flash])

  async function send() {
    const body = text.trim()
    if (!body || busy) return
    setBusy(true)
    const res = await addComment(post.id, body)
    setBusy(false)
    if (!res.ok) return flash(res.error)
    setItems((prev) => [...(prev ?? []), res.comment])
    setText('')
    onAdded()
  }

  async function block() {
    if (!menu) return
    const c = menu
    setMenu(null)
    const res = await blockCommentAuthor(c.id)
    if (!res.ok) return flash(res.error)
    setItems((prev) => prev?.filter((x) => x.id !== c.id) ?? prev)
    flash("Blocked. You won't see them again, and they won't know.")
  }

  async function doReport(reason: (typeof REPORT_REASONS)[number]['id']) {
    if (!menu) return
    const c = menu
    setMenu(null)
    setReporting(false)
    const res = await reportComment(c.id, reason)
    flash(res.ok ? (res.already ? 'You already reported this' : 'Reported. Thank you.') : res.error)
  }

  return (
    <Sheet title={`Comments · ${post.comments}`} onClose={onClose}>
      <div className={styles.commentList}>
        {items === null ? <p className={styles.fine}>Loading…</p> : null}
        {items?.length === 0 ? <p className={styles.fine}>No comments yet. Say something kind.</p> : null}
        {items?.map((c) => (
          <div key={c.id} className={styles.comment}>
            <div className={styles.commentHead}>
              <strong>Anonymous</strong>
              {c.mine ? <span className={styles.youBadgeDark}>You</span> : null}
              <span className={styles.fine}>{timeAgo(c.createdAt)}</span>
              <span className={styles.spacer} />
              {!c.mine ? (
                <button type="button" className={styles.iconBtnDark} aria-label="More" onClick={() => setMenu(c)}>
                  <MoreHorizontal size={18} />
                </button>
              ) : null}
            </div>
            <p className={styles.commentBody}>{c.status === 'ok' ? c.body : 'Hidden pending review'}</p>
          </div>
        ))}
      </div>
      <div className={styles.commentBar}>
        <input
          className={styles.commentInput}
          value={text}
          maxLength={COMMENT_MAX}
          placeholder="Comment as Anonymous"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void send()}
        />
        <button type="button" className={styles.sendBtn} aria-label="Send" disabled={busy || !text.trim()} onClick={() => void send()}>
          <Send size={18} />
        </button>
      </div>
      {menu ? (
        <Sheet title="This comment" onClose={() => { setMenu(null); setReporting(false) }}>
          {reporting ? (
            <ReportList onPick={(r) => void doReport(r)} onBack={() => setReporting(false)} />
          ) : (
            <div className={styles.menuList}>
              <button type="button" className={styles.menuItem} onClick={() => void block()}>
                Block this author
              </button>
              <button type="button" className={`${styles.menuItem} ${styles.danger}`} onClick={() => setReporting(true)}>
                Report
              </button>
            </div>
          )}
        </Sheet>
      ) : null}
    </Sheet>
  )
}

/* ---------- composer ---------- */

export function Composer({
  wallId,
  wallName,
  onClose,
  onPosted,
}: {
  wallId?: string
  wallName?: string
  onClose: () => void
  onPosted: (post: AnonPost) => void
}) {
  const [body, setBody] = useState('')
  const [color, setColor] = useState<AnonColor>('violet')
  const [category, setCategory] = useState<AnonCategory>('general')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bg, fg] = COLORS[color]

  async function post() {
    if (!body.trim() || busy) return
    setBusy(true)
    setError(null)
    const res = await createPost({ body, color, category, wallId: wallId ?? null })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    onPosted(res.post)
  }

  return (
    <div className={styles.composer} role="dialog" aria-label="New post">
      <div className={styles.composerBar}>
        <button type="button" className={styles.iconBtnDark} aria-label="Close" onClick={onClose}>
          <X size={22} />
        </button>
        <span className={styles.composerTitle}>{wallName ? `Post to ${wallName}` : 'New post'}</span>
        <button type="button" className={styles.postBtn} disabled={busy || !body.trim()} onClick={() => void post()}>
          {busy ? 'Posting…' : 'Post'}
        </button>
      </div>
      <div className={styles.composerCard} style={{ background: bg, color: fg }}>
        <textarea
          className={styles.composerText}
          style={{ color: fg }}
          value={body}
          maxLength={POST_MAX}
          autoFocus
          placeholder="What's on your mind?"
          onChange={(e) => setBody(e.target.value)}
        />
        <span className={styles.counter}>
          {body.length}/{POST_MAX}
        </span>
      </div>
      <p className={styles.fine}>Posted as Anonymous. No phone numbers, emails or @usernames.</p>
      <div className={styles.swatches} role="radiogroup" aria-label="Card colour">
        {(Object.keys(COLORS) as AnonColor[]).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={color === c}
            aria-label={c}
            className={`${styles.swatch} ${color === c ? styles.swatchOn : ''}`}
            style={{ background: COLORS[c][0] }}
            onClick={() => setColor(c)}
          />
        ))}
      </div>
      <div className={styles.chips}>
        {CATEGORIES.map((c) => (
          <button key={c.id} type="button" className={`${styles.chip} ${category === c.id ? styles.chipOn : ''}`} onClick={() => setCategory(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  )
}
