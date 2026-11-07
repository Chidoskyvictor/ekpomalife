'use client'

import { useCallback, useEffect, useState } from 'react'
import panel from '@/components/buildings/building-panel.module.css'
import { BodyPortal } from '@/components/ui/body-portal'
import { useGame } from '@/hooks/use-game'
import { endActivity, startActivity } from '@/lib/game/activity'
import {
  fetchDevPosts,
  fetchPitch,
  finishPitch,
  startPitch,
  type Pitch,
  fetchMySubmissions,
  fetchSuggestions,
  reactToPost,
  REACTIONS,
  submitHub,
  voteSuggestion,
  type DevPost,
  type FeedbackKind,
  type MySubmission,
  type Suggestion,
} from '@/lib/game/hub-api'
import { HUB_DESKS, type HubDeskId } from '@/lib/game/hub-desks'
import styles from './hub.module.css'

const FEEDBACK_KINDS: { id: FeedbackKind; label: string }[] = [
  { id: 'review', label: '⭐ Review' },
  { id: 'complaint', label: '😤 Complaint' },
  { id: 'bug', label: '🐞 Bug report' },
  { id: 'experience', label: '💬 My experience' },
]

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/** The task at an Innovation Hub desk, opened once you've walked up to its NPC. */
export function HubDeskPanel({ deskId, onClose }: { deskId: HubDeskId; onClose: () => void }) {
  const desk = HUB_DESKS.find((d) => d.id === deskId)!
  return (
    <BodyPortal>
      <div className={panel.modal} role="dialog" aria-modal="true" aria-label={desk.title} onClick={onClose}>
        <div className={`${panel.modalCard} ${styles.card}`} onClick={(e) => e.stopPropagation()}>
          <p className={panel.modalTitle}>
            {desk.emoji} {desk.title}
          </p>
          <p className={panel.modalMeta}>
            {desk.npc.name} · {desk.npc.role}
          </p>
          {deskId === 'feedback' ? <FeedbackDesk /> : null}
          {deskId === 'ideas' ? <IdeasDesk /> : null}
          {deskId === 'dev' ? <DevDesk /> : null}
          {deskId === 'pitch' ? <PitchDesk onClose={onClose} /> : null}
          <button type="button" className={panel.btn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </BodyPortal>
  )
}

/** Wait out the investor's review (the pill up top counts down), then reveal and pay. Keeps going if the desk is closed. */
const watching = new Set<string>()
function watchPitch(pitch: Pitch, done: (message: string, good: boolean) => void) {
  if (watching.has(pitch.id)) return
  watching.add(pitch.id)
  const left = Math.max(0, Date.parse(pitch.readyAt) - Date.now())
  startActivity({ emoji: '🚀', title: 'Investor is reviewing your deck', seconds: Math.max(1, Math.round(left / 1000)) })
  const reveal = async (tries = 0): Promise<void> => {
    const res = await finishPitch(pitch.id)
    if (!res.ok) {
      // Clock skew or a blip: try again shortly
      if (tries < 5) return void window.setTimeout(() => void reveal(tries + 1), 4000)
      watching.delete(pitch.id)
      endActivity()
      return done(res.error || 'Could not reach the investor.', false)
    }
    watching.delete(pitch.id)
    endActivity()
    done(res.message ?? 'Pitch reviewed.', Boolean(res.pitch.result?.accepted))
  }
  window.setTimeout(() => void reveal(), left + 800)
}

function PitchDesk({ onClose }: { onClose: () => void }) {
  const { notifyToast, refreshServer } = useGame()
  const [status, setStatus] = useState<{ left: number; pending: Pitch | null; last: Pitch | null } | null>(null)
  const [idea, setIdea] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onDone = useCallback(
    (message: string, good: boolean) => {
      notifyToast(message, good)
      void refreshServer()
    },
    [notifyToast, refreshServer],
  )

  useEffect(() => {
    void fetchPitch().then((res) => {
      if (!res.ok) return setError(res.error)
      setStatus(res)
      // A pitch still under review (you left and came back): keep watching it
      if (res.pending) watchPitch(res.pending, onDone)
    })
  }, [onDone])

  const pitch = async () => {
    setBusy(true)
    setError(null)
    const res = await startPitch(idea)
    setBusy(false)
    if (!res.ok) return setError(res.error)
    watchPitch(res.pitch, onDone)
    onClose()
  }

  if (!status) return <p className={styles.muted}>{error ?? 'Sammy is getting the room ready…'}</p>
  if (status.pending) {
    return <p className={styles.muted}>“The investor is still reading your deck on {status.pending.idea}. Hang tight.” — Sammy</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p className={styles.muted}>
        “Tell the investor what you’re building. If they like it, they’ll back you. Not every deck gets a yes, so keep
        pitching.” — Sammy
      </p>
      <input
        className={styles.input}
        value={idea}
        maxLength={120}
        placeholder="e.g. An app for booking keke in Ekpoma"
        onChange={(e) => setIdea(e.target.value)}
      />
      <button type="button" className={panel.btn} disabled={busy || idea.trim().length < 3 || status.left <= 0} onClick={() => void pitch()}>
        {status.left <= 0 ? 'No pitches left today' : busy ? 'Pitching…' : `🚀 Pitch your tech (${status.left} left today)`}
      </button>
      {error ? <p className={styles.muted}>{error}</p> : null}
      {status.last?.result ? (
        <p className={styles.muted}>
          Last pitch: {status.last.result.accepted ? `backed with ₦${status.last.result.amount.toLocaleString()} 🎉` : 'the investor passed'}
        </p>
      ) : null}
    </div>
  )
}

const REWARD_NOTE = 'If the team finds it useful, you could be rewarded up to ₦200,000.'

function useMine() {
  const [mine, setMine] = useState<{ left: number; items: MySubmission[] } | null>(null)
  const load = useCallback(async () => {
    const res = await fetchMySubmissions()
    if (res.ok) setMine({ left: res.left, items: res.items })
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  return { mine, reload: load }
}

function Status({ item }: { item: MySubmission }) {
  if (item.status === 'rewarded') return <span className={styles.good}>Rewarded ₦{item.reward.toLocaleString()} 🎉</span>
  if (item.status === 'rejected') return <span className={styles.muted}>Reviewed</span>
  return <span className={styles.muted}>Waiting for the team</span>
}

function FeedbackDesk() {
  const { notifyToast } = useGame()
  const { mine, reload } = useMine()
  const [kind, setKind] = useState<FeedbackKind>('review')
  const [stars, setStars] = useState(5)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const send = async () => {
    if (busy || text.trim().length < 3) return
    setBusy(true)
    const res = await submitHub(kind, text, kind === 'review' ? stars : null)
    setBusy(false)
    if (!res.ok) {
      notifyToast(res.error, false)
      return
    }
    notifyToast(res.message, true)
    setText('')
    void reload()
  }

  return (
    <div className={styles.body}>
      <p className={styles.say}>“Tell me anything about the game. It goes straight to the team.” — Francis</p>
      <div className={styles.chips} role="radiogroup" aria-label="Type">
        {FEEDBACK_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="radio"
            aria-checked={kind === k.id}
            className={`${styles.chip} ${kind === k.id ? styles.chipOn : ''}`}
            onClick={() => setKind(k.id)}
          >
            {k.label}
          </button>
        ))}
      </div>
      {kind === 'review' ? (
        <div className={styles.stars} role="radiogroup" aria-label="Stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} stars`} onClick={() => setStars(n)}>
              {n <= stars ? '★' : '☆'}
            </button>
          ))}
        </div>
      ) : null}
      <textarea
        className={styles.input}
        rows={4}
        maxLength={2000}
        placeholder={kind === 'bug' ? 'What happened, and where?' : 'Write it here…'}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <p className={styles.muted}>
        {REWARD_NOTE} {mine ? `${mine.left} left today.` : ''}
      </p>
      <button type="button" className={styles.primary} disabled={busy || text.trim().length < 3 || mine?.left === 0} onClick={() => void send()}>
        {busy ? 'Sending…' : 'Send to the team'}
      </button>
      {mine && mine.items.filter((i) => i.kind !== 'suggestion').length ? (
        <>
          <p className={styles.section}>What you sent</p>
          {mine.items
            .filter((i) => i.kind !== 'suggestion')
            .slice(0, 5)
            .map((i) => (
              <div key={i.id} className={styles.row}>
                <span className={styles.clip}>{i.body}</span>
                <Status item={i} />
              </div>
            ))}
        </>
      ) : null}
    </div>
  )
}

function IdeasDesk() {
  const { notifyToast } = useGame()
  const { mine, reload: reloadMine } = useMine()
  const [sort, setSort] = useState<'top' | 'new'>('top')
  const [list, setList] = useState<Suggestion[] | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetchSuggestions(sort)
    if (res.ok) setList(res.suggestions)
  }, [sort])
  useEffect(() => {
    void load()
  }, [load])

  const post = async () => {
    if (busy || text.trim().length < 3) return
    setBusy(true)
    const res = await submitHub('suggestion', text)
    setBusy(false)
    if (!res.ok) {
      notifyToast(res.error, false)
      return
    }
    notifyToast(res.message, true)
    setText('')
    void load()
    void reloadMine()
  }

  const vote = async (s: Suggestion) => {
    if (s.mine) return
    // Show it at once; the server's count replaces it
    setList((l) => l?.map((x) => (x.id === s.id ? { ...x, voted: !x.voted, votes: x.votes + (x.voted ? -1 : 1) } : x)) ?? l)
    const res = await voteSuggestion(s.id)
    if (!res.ok) {
      notifyToast(res.error, false)
      void load()
      return
    }
    setList((l) => l?.map((x) => (x.id === s.id ? { ...x, voted: res.voted, votes: res.votes } : x)) ?? l)
  }

  return (
    <div className={styles.body}>
      <p className={styles.say}>“Got an idea for Ekpoma Life? Post it. Everyone can vote.” — JOD</p>
      <textarea
        className={styles.input}
        rows={3}
        maxLength={2000}
        placeholder="I'd love it if the game had…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <p className={styles.muted}>
        {REWARD_NOTE} {mine ? `${mine.left} left today.` : ''}
      </p>
      <button type="button" className={styles.primary} disabled={busy || text.trim().length < 3 || mine?.left === 0} onClick={() => void post()}>
        {busy ? 'Posting…' : 'Post suggestion'}
      </button>
      <div className={styles.chips} role="tablist" aria-label="Sort">
        {(['top', 'new'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={sort === k} className={`${styles.chip} ${sort === k ? styles.chipOn : ''}`} onClick={() => setSort(k)}>
            {k === 'top' ? '🔥 Top' : '🆕 New'}
          </button>
        ))}
      </div>
      {list == null ? <Skeleton /> : null}
      {list && list.length === 0 ? <p className={styles.muted}>No suggestions yet. Be the first.</p> : null}
      {list?.map((s) => (
        <div key={s.id} className={styles.idea}>
          <div className={styles.ideaText}>
            <p>{s.body}</p>
            <span className={styles.muted}>
              @{s.username} · {when(s.createdAt)}
              {s.rewarded ? ' · rewarded 🎉' : ''}
            </span>
          </div>
          <button
            type="button"
            className={`${styles.vote} ${s.voted ? styles.voteOn : ''}`}
            aria-pressed={s.voted}
            aria-label={s.mine ? `Your idea, ${s.votes} votes` : `Upvote, ${s.votes} votes`}
            disabled={s.mine}
            onClick={() => void vote(s)}
          >
            👍 {s.votes}
          </button>
        </div>
      ))}
    </div>
  )
}

function DevDesk() {
  const { notifyToast } = useGame()
  const [posts, setPosts] = useState<DevPost[] | null>(null)
  const load = useCallback(async () => {
    const res = await fetchDevPosts()
    if (res.ok) setPosts(res.posts)
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const react = async (post: DevPost, emoji: string) => {
    const res = await reactToPost(post.id, emoji)
    if (!res.ok) notifyToast(res.error, false)
    void load()
  }

  return (
    <div className={styles.body}>
      <p className={styles.say}>“What we’re building, straight from the team.” — Chidosky</p>
      {posts == null ? <Skeleton /> : null}
      {posts && posts.length === 0 ? <p className={styles.muted}>No updates yet. Check back soon.</p> : null}
      {posts?.map((p) => (
        <article key={p.id} className={styles.post}>
          <p className={styles.postBody}>{p.body}</p>
          <span className={styles.muted}>
            @{p.author} · {when(p.createdAt)}
          </span>
          <div className={styles.reactions}>
            {REACTIONS.map((e) => (
              <button key={e} type="button" className={`${styles.react} ${p.mine === e ? styles.voteOn : ''}`} aria-pressed={p.mine === e} onClick={() => void react(p, e)}>
                {e} {p.reactions[e] ?? 0}
              </button>
            ))}
          </div>
        </article>
      ))}
    </div>
  )
}

function Skeleton() {
  return (
    <div aria-label="Loading" role="status">
      {[0, 1, 2].map((i) => (
        <div key={i} className={styles.skel} />
      ))}
    </div>
  )
}
