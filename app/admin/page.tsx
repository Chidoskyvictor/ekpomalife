'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import {
  deleteDevUpdate,
  fetchAdminMe,
  fetchAdminStats,
  fetchAdminSubmissions,
  fetchAdminTopups,
  hideSubmission,
  postDevUpdate,
  rejectSubmission,
  rewardSubmission,
  type AdminStats,
  type AdminSubmission,
  type AdminTopup,
} from '@/lib/game/admin-hub-api'
import { fetchDevPosts, type DevPost } from '@/lib/game/hub-api'

const naira = (n: number) => `₦${n.toLocaleString()}`
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const REWARD_PRESETS = [20_000, 50_000, 100_000, 200_000]

/**
 * Team dashboard: visits, players, revenue, and the Innovation Hub inbox (reward / reject / hide)
 * plus Developers' Corner posts. Not linked anywhere; the server only answers ADMIN_USERNAMES,
 * and anyone else is sent back to the homepage.
 */
export default function AdminPage() {
  const router = useRouter()
  const [me, setMe] = useState<string | null>(null)

  useEffect(() => {
    void fetchAdminMe().then((res) => {
      if (res.ok) setMe(res.username)
      else router.replace('/')
    })
  }, [router])

  if (!me) return <main className="min-h-dvh bg-white" aria-busy="true" />

  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl overflow-x-hidden bg-white px-4 py-8 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] text-neutral-900">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Ekpoma Life admin</h1>
        <span className="text-sm text-neutral-500">@{me}</span>
      </header>
      <nav className="mt-2 flex gap-4 text-sm">
        <Link href="/" className="text-[#1a6fb0] underline">
          Game
        </Link>
        <Link href="/admin/spaces" className="text-[#1a6fb0] underline">
          Spaces reports
        </Link>
      </nav>
      <Stats />
      <Revenue />
      <Inbox />
      <DevPosts author={me} />
    </main>
  )
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-lg font-bold">{value}</p>
      {sub ? <p className="text-xs text-neutral-500">{sub}</p> : null}
    </div>
  )
}

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

function Stats() {
  const [s, setS] = useState<AdminStats | null>(null)
  useEffect(() => {
    const load = () => void fetchAdminStats().then((res) => res.ok && setS(res))
    load()
    const id = window.setInterval(load, 30_000)
    return () => window.clearInterval(id)
  }, [])
  if (!s) return <p className="mt-6 text-sm text-neutral-500">Loading stats…</p>
  return (
    <>
      <Section title="Visits & players">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Card label="Visits today" value={s.visits.today.toLocaleString()} sub={`${s.visits.total.toLocaleString()} all time`} />
          <Card label="Online now" value={s.players.online.toLocaleString()} />
          <Card label="Played today" value={s.players.playedToday.toLocaleString()} />
          <Card label="Players" value={s.players.total.toLocaleString()} sub={`+${s.players.newToday} new today`} />
        </div>
        {s.visits.days.length ? (
          <p className="mt-2 text-xs text-neutral-500">
            Last days: {s.visits.days.map((d) => `${d.day.slice(5)} · ${d.count.toLocaleString()}`).join('  |  ')}
          </p>
        ) : (
          <p className="mt-2 text-xs text-neutral-500">Visits per day start counting from this update.</p>
        )}
      </Section>
      <Section title="Revenue (successful top-ups)">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Card label="Today" value={naira(s.revenue.today)} />
          <Card label="Last 7 days" value={naira(s.revenue.week)} />
          <Card label="Last 30 days" value={naira(s.revenue.month)} />
          <Card label="All time" value={naira(s.revenue.total)} sub={`${s.revenue.count.toLocaleString()} top-ups`} />
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Pending {s.revenue.pending} · Failed {s.revenue.failed} · Hub rewards paid {naira(s.feedback.rewarded)}
        </p>
      </Section>
    </>
  )
}

function Revenue() {
  const [status, setStatus] = useState<AdminTopup['status']>('success')
  const [rows, setRows] = useState<AdminTopup[] | null>(null)
  const [showOthers, setShowOthers] = useState(false)
  useEffect(() => {
    setRows(null)
    void fetchAdminTopups(status).then((res) => res.ok && setRows(res.topups))
  }, [status])
  return (
    <Section
      title="Top-ups"
      right={
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showOthers}
            onChange={(e) => {
              setShowOthers(e.target.checked)
              if (!e.target.checked) setStatus('success')
            }}
          />
          Show failed & pending
        </label>
      }
    >
      {showOthers ? (
        <div className="mb-2 flex gap-2 text-sm">
          {(['success', 'pending', 'failed'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setStatus(k)}
              className={`min-h-9 rounded-full border px-3 ${status === k ? 'border-[#1a6fb0] bg-[#1a6fb0] text-white' : 'border-neutral-300'}`}
            >
              {k}
            </button>
          ))}
        </div>
      ) : null}
      {rows == null ? <p className="text-sm text-neutral-500">Loading…</p> : null}
      {rows?.length === 0 ? <p className="text-sm text-neutral-500">None.</p> : null}
      <div className="divide-y divide-neutral-100">
        {rows?.slice(0, 30).map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 truncate">
              @{t.username} · {t.pack} · <span className="text-neutral-500">{when(t.paidAt ?? t.createdAt)}</span>
            </span>
            <strong className={t.status === 'success' ? '' : t.status === 'failed' ? 'text-red-600' : 'text-amber-600'}>
              {naira(t.amount)}
            </strong>
          </div>
        ))}
      </div>
    </Section>
  )
}

function Inbox() {
  const [status, setStatus] = useState<'new' | 'rewarded' | 'rejected' | 'all'>('new')
  const [rows, setRows] = useState<AdminSubmission[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    const res = await fetchAdminSubmissions(status)
    if (res.ok) setRows(res.submissions)
  }, [status])
  useEffect(() => {
    setRows(null)
    void load()
  }, [load])

  const run = async (id: string, action: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setBusy(id)
    setError(null)
    const res = await action()
    setBusy(null)
    if (!res.ok) setError(res.error)
    await load()
  }

  return (
    <Section
      title="Innovation Hub inbox"
      right={
        <select className="min-h-9 rounded-lg border border-neutral-300 px-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="new">Waiting</option>
          <option value="rewarded">Rewarded</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>
      }
    >
      {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
      {rows == null ? <p className="text-sm text-neutral-500">Loading…</p> : null}
      {rows?.length === 0 ? <p className="text-sm text-neutral-500">Nothing here.</p> : null}
      <div className="space-y-3">
        {rows?.map((s) => {
          const amount = Number((amounts[s.id] ?? '').replace(/[^\d]/g, '')) || 0
          return (
            <article key={s.id} className={`rounded-2xl border p-3 ${s.hidden ? 'border-dashed border-neutral-300 opacity-60' : 'border-neutral-200'}`}>
              <p className="text-xs text-neutral-500">
                {s.label}
                {s.stars ? ` · ${'★'.repeat(s.stars)}` : ''} · @{s.username} · {when(s.createdAt)}
                {s.kind === 'suggestion' ? ` · 👍 ${s.votes}` : ''}
                {s.hidden ? ' · hidden' : ''}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{s.body}</p>
              {s.status === 'new' ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {REWARD_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`min-h-9 rounded-full border px-3 text-sm ${amount === p ? 'border-[#1a6fb0] bg-[#e8f1fb]' : 'border-neutral-300'}`}
                      onClick={() => setAmounts((a) => ({ ...a, [s.id]: String(p) }))}
                    >
                      {naira(p)}
                    </button>
                  ))}
                  <input
                    inputMode="numeric"
                    placeholder="Amount"
                    className="min-h-9 w-28 rounded-lg border border-neutral-300 px-2 text-base"
                    value={amounts[s.id] ?? ''}
                    onChange={(e) => setAmounts((a) => ({ ...a, [s.id]: e.target.value }))}
                  />
                  <button
                    type="button"
                    disabled={busy === s.id || amount < 1 || amount > 200_000}
                    className="min-h-9 rounded-full bg-green-600 px-4 text-sm font-bold text-white disabled:opacity-40"
                    onClick={() => void run(s.id, () => rewardSubmission(s.id, amount))}
                  >
                    Reward {amount ? naira(amount) : ''}
                  </button>
                  <button
                    type="button"
                    disabled={busy === s.id}
                    className="min-h-9 rounded-full border border-neutral-300 px-4 text-sm"
                    onClick={() => void run(s.id, () => rejectSubmission(s.id))}
                  >
                    Reject
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-xs text-neutral-500">
                  {s.status === 'rewarded' ? `Rewarded ${naira(s.reward)}` : 'Rejected'}
                  {s.reviewedBy ? ` by @${s.reviewedBy}` : ''}
                </p>
              )}
              {s.kind === 'suggestion' ? (
                <button
                  type="button"
                  disabled={busy === s.id}
                  className="mt-2 text-xs text-[#1a6fb0] underline"
                  onClick={() => void run(s.id, () => hideSubmission(s.id, !s.hidden))}
                >
                  {s.hidden ? 'Show it to players again' : 'Hide from players'}
                </button>
              ) : null}
            </article>
          )
        })}
      </div>
    </Section>
  )
}

function DevPosts({ author }: { author: string }) {
  const [posts, setPosts] = useState<DevPost[] | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    const res = await fetchDevPosts()
    if (res.ok) setPosts(res.posts)
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const post = async () => {
    setBusy(true)
    setError(null)
    const res = await postDevUpdate(text)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setText('')
    void load()
  }

  return (
    <Section title="Developers' Corner (Chidosky's desk)">
      <textarea
        className="w-full rounded-2xl border border-neutral-300 p-3 text-base"
        rows={4}
        maxLength={4000}
        placeholder={`Post an update as @${author}…`}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="button"
        disabled={busy || !text.trim()}
        className="mt-2 min-h-10 rounded-full bg-[#1a6fb0] px-5 text-sm font-bold text-white disabled:opacity-40"
        onClick={() => void post()}
      >
        {busy ? 'Posting…' : 'Post update'}
      </button>
      <div className="mt-4 space-y-3">
        {posts?.map((p) => (
          <article key={p.id} className="rounded-2xl border border-neutral-200 p-3">
            <p className="whitespace-pre-wrap break-words text-sm">{p.body}</p>
            <p className="mt-1 text-xs text-neutral-500">
              @{p.author} · {when(p.createdAt)} · {Object.entries(p.reactions).map(([e, n]) => `${e} ${n}`).join('  ')}
            </p>
            <button
              type="button"
              className="mt-1 text-xs text-red-600 underline"
              onClick={() => void deleteDevUpdate(p.id).then(() => load())}
            >
              Delete
            </button>
          </article>
        ))}
      </div>
    </Section>
  )
}
