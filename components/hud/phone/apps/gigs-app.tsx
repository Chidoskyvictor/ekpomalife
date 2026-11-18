'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import {
  acceptGig,
  applyToGig,
  cancelGig,
  categoryOf,
  disputeGig,
  fetchBoard,
  fetchGig,
  fetchMine,
  fetchPros,
  fetchWorking,
  GIG_CATEGORIES,
  GIG_START_CHOICES,
  GIG_STATUS_LABEL,
  hireWorker,
  markGigDone,
  postGig,
  rateGig,
  removeMyPro,
  reportGig,
  reportPro,
  respondToOffer,
  saveMyPro,
  startGig,
  startsLabel,
  undoGigLayout,
  type Gig,
  type GigCategory,
  type GigPerson,
  type MyPro,
  type Pro,
} from '@/lib/game/gigs-api'
import { openDirectChat } from '@/lib/game/hostels-api'
import { requestOpenChat } from '@/lib/game/open-chat'
import { pushNavigation } from '@/lib/navigation/safe-nav'
import { AppEmpty, AppError, AppLoading } from '../app-state'
import styles from './gigs.module.css'

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`
type Tab = 'board' | 'pros' | 'mine' | 'working'
type View = { name: 'tabs' } | { name: 'gig'; id: string } | { name: 'post'; directTo?: Pro }

const TABS: { id: Tab; label: string }[] = [
  { id: 'board', label: 'Board' },
  { id: 'pros', label: 'Find a pro' },
  { id: 'mine', label: 'My jobs' },
  { id: 'working', label: 'Working' },
]

function RankPill({ person }: { person: GigPerson }) {
  const cls = person.rank.id === 'top' ? styles.pillTop : person.rank.id === 'pro' ? styles.pillPro : person.rank.id === 'rising' ? styles.pillRising : ''
  return (
    <span className={`${styles.pill} ${cls}`}>
      {person.rank.emoji} {person.rank.label}
    </span>
  )
}

const ratingText = (p: GigPerson) => (p.rating ? `★ ${p.rating.toFixed(1)}` : 'No ratings yet')
const personLine = (p: GigPerson) => `@${p.username} · ${ratingText(p)} · ${p.jobs} ${p.jobs === 1 ? 'job' : 'jobs'}`

function CategoryChips({ value, onChange, all = true }: { value: GigCategory | null; onChange: (c: GigCategory | null) => void; all?: boolean }) {
  return (
    <div className={styles.chips} role="group" aria-label="Kind of job">
      {all ? (
        <button type="button" className={`${styles.chip} ${value === null ? styles.chipOn : ''}`} onClick={() => onChange(null)}>
          All
        </button>
      ) : null}
      {GIG_CATEGORIES.map((c) => (
        <button key={c.id} type="button" className={`${styles.chip} ${value === c.id ? styles.chipOn : ''}`} onClick={() => onChange(c.id)}>
          {c.emoji} {c.label}
        </button>
      ))}
    </div>
  )
}

/** Phone → Gigs: a job board between players. The fee is held until the job is accepted. */
export function GigsApp({ onHome, onClose }: { onHome: () => void; onClose: () => void }) {
  const { state, notifyToast, refreshServer } = useGame()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('board')
  const [view, setView] = useState<View>({ name: 'tabs' })
  const [version, setVersion] = useState(0)
  const reload = () => setVersion((v) => v + 1)

  const toast = useCallback((msg: string | undefined, ok = true) => msg && notifyToast(msg, ok), [notifyToast])

  const ask = async (userId: string) => {
    const res = await openDirectChat(userId)
    if (!res.ok) return toast(res.error, false)
    onHome()
    requestOpenChat(res.chat)
  }
  const goToHouse = (username: string) => {
    onClose()
    pushNavigation(router, `/room/${encodeURIComponent(username)}`)
  }

  if (view.name === 'post') {
    return (
      <PostForm
        directTo={view.directTo}
        cash={state?.cash ?? 0}
        onCancel={() => setView({ name: 'tabs' })}
        onPosted={(msg) => {
          toast(msg)
          setTab('mine')
          setView({ name: 'tabs' })
          reload()
        }}
        toast={toast}
      />
    )
  }
  if (view.name === 'gig') {
    return (
      <GigDetail
        id={view.id}
        me={state?.username ?? ''}
        onBack={() => {
          setView({ name: 'tabs' })
          reload()
        }}
        ask={ask}
        goToHouse={goToHouse}
        toast={toast}
        refreshMoney={() => void refreshServer()}
      />
    )
  }

  return (
    <div className={styles.screen}>
      <div className={styles.tabs} role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`${styles.tab} ${tab === t.id ? styles.tabOn : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'board' ? <BoardTab key={version} onOpen={(id) => setView({ name: 'gig', id })} onPost={() => setView({ name: 'post' })} /> : null}
      {tab === 'pros' ? <ProsTab key={version} ask={ask} toast={toast} onHire={(pro) => setView({ name: 'post', directTo: pro })} reload={reload} /> : null}
      {tab === 'mine' ? <ListTab key={version} kind="mine" onOpen={(id) => setView({ name: 'gig', id })} onPost={() => setView({ name: 'post' })} /> : null}
      {tab === 'working' ? <ListTab key={version} kind="working" onOpen={(id) => setView({ name: 'gig', id })} /> : null}
    </div>
  )
}

// ── lists ──────────────────────────────────────────────────────────────────

function GigCard({ gig, onOpen, showStatus }: { gig: Gig; onOpen: () => void; showStatus?: boolean }) {
  const c = categoryOf(gig.category)
  const other = gig.role === 'owner' ? gig.worker : gig.owner
  return (
    <button type="button" className={styles.card} onClick={onOpen}>
      <span className={styles.rowTop}>
        <span className={styles.title}>
          {c.emoji} {gig.title}
        </span>
        <span className={styles.fee}>{naira(gig.fee)}</span>
      </span>
      <span className={styles.row}>
        <span className={styles.pill}>{c.label}</span>
        {showStatus ? <span className={styles.pill}>{gig.role === 'offered' ? 'Offer for you' : GIG_STATUS_LABEL[gig.status]}</span> : null}
        {gig.budget > 0 ? <span className={styles.pill}>+{naira(gig.budget)} items</span> : null}
        {gig.owner && gig.role !== 'owner' ? <RankPill person={gig.owner} /> : null}
      </span>
      <span className={styles.meta}>
        {other ? `${gig.role === 'owner' ? 'Worker' : 'By'} @${other.username} · ` : ''}
        {gig.status === 'open' ? `Starts ${startsLabel(gig.startAt).toLowerCase()}` : GIG_STATUS_LABEL[gig.status]}
        {gig.role === 'owner' && gig.status === 'open' ? ` · ${gig.applicantCount} applied` : ''}
        {gig.applied ? ' · You applied' : ''}
      </span>
    </button>
  )
}

function useLoad<T>(load: () => Promise<({ ok: true } & T) | { ok: false; error: string }>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    let off = false
    void load().then((res) => {
      if (off) return
      if (res.ok) {
        setData(res)
        setError(null)
      } else setError(res.error)
    })
    return () => {
      off = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `load` is rebuilt every render; `n` and the caller's deps are the triggers
  }, [n, ...deps])
  return { data, error, retry: () => setN((v) => v + 1) }
}

function BoardTab({ onOpen, onPost }: { onOpen: (id: string) => void; onPost: () => void }) {
  const [cat, setCat] = useState<GigCategory | null>(null)
  const { data, error, retry } = useLoad(() => fetchBoard(cat), [cat])
  return (
    <>
      <button type="button" className={styles.btn} onClick={onPost}>
        ＋ Post a job
      </button>
      <CategoryChips value={cat} onChange={setCat} />
      {error && !data ? <AppError onRetry={retry}>{error}</AppError> : null}
      {!data && !error ? <AppLoading label="Loading jobs…" /> : null}
      {data && data.gigs.length === 0 ? <AppEmpty icon="🛠️">No open jobs here yet. Post one, or list yourself in Find a pro.</AppEmpty> : null}
      {data?.gigs.map((g) => (
        <GigCard key={g.id} gig={g} onOpen={() => onOpen(g.id)} />
      ))}
    </>
  )
}

function ListTab({ kind, onOpen, onPost }: { kind: 'mine' | 'working'; onOpen: (id: string) => void; onPost?: () => void }) {
  const { data, error, retry } = useLoad(() => (kind === 'mine' ? fetchMine() : fetchWorking()))
  if (error && !data) return <AppError onRetry={retry}>{error}</AppError>
  if (!data) return <AppLoading label="Loading…" />
  return (
    <>
      {onPost ? (
        <button type="button" className={styles.btn} onClick={onPost}>
          ＋ Post a job
        </button>
      ) : null}
      {data.gigs.length === 0 ? (
        <AppEmpty icon={kind === 'mine' ? '📝' : '🧰'}>{kind === 'mine' ? 'You have not posted a job yet.' : 'You are not working on anything. Apply on the Board, or list yourself in Find a pro.'}</AppEmpty>
      ) : (
        data.gigs.map((g) => <GigCard key={g.id} gig={g} onOpen={() => onOpen(g.id)} showStatus />)
      )}
    </>
  )
}

// ── find a pro ──────────────────────────────────────────────────────────────

function ProsTab({ ask, toast, onHire, reload }: { ask: (userId: string) => void; toast: (m?: string, ok?: boolean) => void; onHire: (p: Pro) => void; reload: () => void }) {
  const [cat, setCat] = useState<GigCategory | null>(null)
  const { data, error, retry } = useLoad(() => fetchPros(cat), [cat])
  const [editing, setEditing] = useState(false)
  const [reported, setReported] = useState<Set<string>>(new Set())
  return (
    <>
      <MyProCard mine={data?.mine ?? null} editing={editing} setEditing={setEditing} toast={toast} onSaved={() => { retry(); reload() }} />
      <CategoryChips value={cat} onChange={setCat} />
      {error && !data ? <AppError onRetry={retry}>{error}</AppError> : null}
      {!data && !error ? <AppLoading label="Finding pros…" /> : null}
      {data && data.pros.length === 0 ? <AppEmpty icon="🔎">Nobody is listed for this yet. Be the first.</AppEmpty> : null}
      {data?.pros.map((p) => (
        <div key={p.userId} className={styles.card}>
          <span className={styles.rowTop}>
            <span className={styles.title}>@{p.username}</span>
            <span className={styles.fee}>from {naira(p.fromPrice)}</span>
          </span>
          <span className={styles.row}>
            <RankPill person={p} />
            <span className={styles.meta}>{ratingText(p)} · {p.jobs} {p.jobs === 1 ? 'job' : 'jobs'}</span>
          </span>
          <span className={styles.row}>
            <span className={`${styles.dot} ${p.online && p.free ? styles.dotOn : ''}`} aria-hidden="true" />
            <span className={styles.meta}>{p.online ? (p.free ? 'Free now' : 'Busy on a job') : 'Offline'} · {p.categories.map((c) => categoryOf(c).emoji + ' ' + categoryOf(c).label).join(', ')}</span>
          </span>
          {p.pitch ? <p className={styles.body}>{p.pitch}</p> : null}
          {p.isMe ? (
            <p className={styles.meta}>This is you.</p>
          ) : (
            <span className={styles.actions}>
              <button type="button" className={styles.btn} onClick={() => onHire(p)}>
                Hire directly
              </button>
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => ask(p.userId)}>
                Ask
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnDanger}`}
                disabled={reported.has(p.userId)}
                onClick={async () => {
                  const res = await reportPro(p.userId, 'Reported from Gigs')
                  toast(res.ok ? res.message : res.error, res.ok)
                  if (res.ok) setReported(new Set([...reported, p.userId]))
                }}
              >
                {reported.has(p.userId) ? 'Reported' : 'Report'}
              </button>
            </span>
          )}
        </div>
      ))}
    </>
  )
}

function MyProCard({ mine, editing, setEditing, toast, onSaved }: { mine: MyPro | null; editing: boolean; setEditing: (v: boolean) => void; toast: (m?: string, ok?: boolean) => void; onSaved: () => void }) {
  const [cats, setCats] = useState<GigCategory[]>(mine?.categories ?? [])
  const [price, setPrice] = useState(String(mine?.fromPrice ?? 1000))
  const [pitch, setPitch] = useState(mine?.pitch ?? '')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (mine) {
      setCats(mine.categories)
      setPrice(String(mine.fromPrice))
      setPitch(mine.pitch)
    }
  }, [mine])
  if (!editing) {
    return (
      <button type="button" className={`${styles.btn} ${mine?.active ? styles.btnGhost : ''}`} onClick={() => setEditing(true)}>
        {mine?.active ? '✏️ Edit my listing' : '🙋 List me for hire'}
      </button>
    )
  }
  const save = async () => {
    setBusy(true)
    const res = await saveMyPro({ categories: cats, fromPrice: Math.max(0, Math.floor(Number(price) || 0)), pitch })
    setBusy(false)
    if (!res.ok) return toast(res.error, false)
    toast('You are listed.')
    setEditing(false)
    onSaved()
  }
  return (
    <div className={styles.card}>
      <span className={styles.label}>What do you do?</span>
      <div className={styles.chips}>
        {GIG_CATEGORIES.map((c) => (
          <button key={c.id} type="button" className={`${styles.chip} ${cats.includes(c.id) ? styles.chipOn : ''}`} onClick={() => setCats(cats.includes(c.id) ? cats.filter((x) => x !== c.id) : [...cats, c.id])}>
            {c.emoji} {c.label}
          </button>
        ))}
      </div>
      <label className={styles.field}>
        <span className={styles.label}>From price (₦)</span>
        <input className={styles.input} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Your pitch</span>
        <textarea className={styles.input} maxLength={200} value={pitch} onChange={(e) => setPitch(e.target.value)} placeholder="Why hire you?" />
      </label>
      <span className={styles.actions}>
        <button type="button" className={styles.btn} disabled={busy || cats.length === 0} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {mine?.active ? (
          <button
            type="button"
            className={`${styles.btn} ${styles.btnDanger}`}
            onClick={async () => {
              await removeMyPro()
              toast('You are no longer listed.')
              setEditing(false)
              onSaved()
            }}
          >
            Remove me
          </button>
        ) : null}
        <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setEditing(false)}>
          Cancel
        </button>
      </span>
    </div>
  )
}

// ── post a job ──────────────────────────────────────────────────────────────

function PostForm({ directTo, cash, onCancel, onPosted, toast }: { directTo?: Pro; cash: number; onCancel: () => void; onPosted: (m: string) => void; toast: (m?: string, ok?: boolean) => void }) {
  const [category, setCategory] = useState<GigCategory>(directTo?.categories[0] ?? 'decorator')
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [fee, setFee] = useState(directTo ? String(directTo.fromPrice || '') : '')
  const [budget, setBudget] = useState('')
  const [hours, setHours] = useState(0)
  const [busy, setBusy] = useState(false)
  const feeN = Math.floor(Number(fee) || 0)
  const budgetN = category === 'decorator' ? Math.floor(Number(budget) || 0) : 0
  const total = feeN + budgetN
  const submit = async () => {
    setBusy(true)
    const res = await postGig({ category, title, details, fee: feeN, budget: budgetN, startInHours: hours, directTo: directTo?.userId })
    setBusy(false)
    if (!res.ok) return toast(res.error, false)
    onPosted(res.message ?? 'Posted.')
  }
  return (
    <div className={styles.screen}>
      <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onCancel}>
        ← Back
      </button>
      <h3 className={styles.titleWrap}>{directTo ? `Hire @${directTo.username}` : 'Post a job'}</h3>
      {directTo ? <p className={styles.note}>They get your offer and can accept or decline. Your money is held only when they accept.</p> : null}
      <span className={styles.label}>Kind of job</span>
      <CategoryChips value={category} onChange={(c) => c && setCategory(c)} all={false} />
      {category === 'driver' || category === 'dj' || category === 'cook' ? (
        <p className={styles.note}>Special 3D work for {categoryOf(category).label}s comes later. You can post and pay for it now: agree the details in chat, then accept when it is done.</p>
      ) : null}
      <label className={styles.field}>
        <span className={styles.label}>Title</span>
        <input className={styles.input} maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Make my room cosy" />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Details (optional)</span>
        <textarea className={styles.input} maxLength={400} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What do you want done?" />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Fee you pay the worker (₦)</span>
        <input className={styles.input} inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value.replace(/\D/g, ''))} placeholder="5000" />
      </label>
      {category === 'decorator' ? (
        <label className={styles.field}>
          <span className={styles.label}>Item budget (₦, optional): they buy furniture for your house with it</span>
          <input className={styles.input} inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value.replace(/\D/g, ''))} placeholder="0" />
        </label>
      ) : null}
      <span className={styles.label}>Starts</span>
      <div className={styles.chips}>
        {GIG_START_CHOICES.map((c) => (
          <button key={c.h} type="button" className={`${styles.chip} ${hours === c.h ? styles.chipOn : ''}`} onClick={() => setHours(c.h)}>
            {c.label}
          </button>
        ))}
      </div>
      <p className={styles.meta}>
        {total > 0 ? `${naira(total)} is held when you hire` : 'Set a fee'}
        {total > cash ? ` · you have ${naira(cash)}` : ''}. Refunded if you cancel before work starts.
      </p>
      <button type="button" className={styles.btn} disabled={busy || !title.trim() || feeN < 100 || total > cash} onClick={() => void submit()}>
        {busy ? 'Posting…' : directTo ? 'Send offer' : 'Post job'}
      </button>
    </div>
  )
}

// ── one job ─────────────────────────────────────────────────────────────────

function GigDetail({
  id,
  me,
  onBack,
  ask,
  goToHouse,
  toast,
  refreshMoney,
}: {
  id: string
  me: string
  onBack: () => void
  ask: (userId: string) => void
  goToHouse: (username: string) => void
  toast: (m?: string, ok?: boolean) => void
  refreshMoney: () => void
}) {
  const [gig, setGig] = useState<Gig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [reason, setReason] = useState('')
  const [disputing, setDisputing] = useState(false)
  const load = useCallback(async () => {
    const res = await fetchGig(id)
    if (res.ok) {
      setGig(res.gig)
      setError(null)
    } else setError(res.error)
  }, [id])
  useEffect(() => {
    void load()
  }, [load])

  if (error && !gig) return <AppError onRetry={() => void load()}>{error}</AppError>
  if (!gig) return <AppLoading label="Loading job…" />

  const act = async (run: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, money = false) => {
    if (busy) return
    setBusy(true)
    const res = await run()
    setBusy(false)
    if (!res.ok) return toast(res.error, false)
    toast(res.message)
    if (money) refreshMoney()
    void load()
  }

  const c = categoryOf(gig.category)
  const owner = gig.role === 'owner'
  const worker = gig.role === 'worker'
  const autoLeft = gig.autoAcceptAt ? Math.max(0, Math.round((new Date(gig.autoAcceptAt).getTime() - Date.now()) / 3_600_000)) : null
  void me

  return (
    <div className={styles.screen}>
      <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onBack}>
        ← Back
      </button>
      <h3 className={styles.titleWrap}>
        {c.emoji} {gig.title}
      </h3>
      <span className={styles.row}>
        <span className={styles.pill}>{c.label}</span>
        <span className={styles.pill}>{gig.role === 'offered' ? 'Offer for you' : GIG_STATUS_LABEL[gig.status]}</span>
        <span className={styles.fee}>{naira(gig.fee)}</span>
      </span>
      {gig.details ? <p className={styles.body}>{gig.details}</p> : null}
      <p className={styles.meta}>
        {gig.budget > 0 ? `Item budget ${naira(gig.budget)} (${naira(gig.budgetLeft)} left). ` : ''}
        {gig.status === 'open' ? `Starts ${startsLabel(gig.startAt).toLowerCase()}.` : ''}
        {gig.escrow > 0 ? ` ${naira(gig.escrow)} is held until the job is accepted.` : ''}
      </p>
      {gig.owner && !owner ? (
        <div className={styles.card}>
          <span className={styles.label}>Posted by</span>
          <span className={styles.row}>
            <RankPill person={gig.owner} />
            <span className={styles.meta}>{personLine(gig.owner)}</span>
          </span>
          {gig.owner.ownerRating ? <span className={styles.meta}>Workers rate them ★ {gig.owner.ownerRating.toFixed(1)}</span> : null}
        </div>
      ) : null}
      {gig.worker ? (
        <div className={styles.card}>
          <span className={styles.label}>Worker</span>
          <span className={styles.row}>
            <RankPill person={gig.worker} />
            <span className={styles.meta}>{personLine(gig.worker)}</span>
          </span>
        </div>
      ) : null}

      {/* Someone else's open job: apply */}
      {gig.role === 'viewer' && gig.status === 'open' ? (
        <>
          {gig.applied ? <p className={styles.note}>You applied. The owner will see you.</p> : null}
          <label className={styles.field}>
            <span className={styles.label}>Message to the owner (optional)</span>
            <textarea className={styles.input} maxLength={200} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Say why you are the one" />
          </label>
          <span className={styles.actions}>
            <button type="button" className={styles.btn} disabled={busy} onClick={() => void act(() => applyToGig(gig.id, message))}>
              {gig.applied ? 'Update message' : 'Apply'}
            </button>
            {gig.owner ? (
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => ask(gig.owner!.userId)}>
                Ask
              </button>
            ) : null}
          </span>
        </>
      ) : null}

      {/* A direct offer to me */}
      {gig.role === 'offered' ? (
        <span className={styles.actions}>
          <button type="button" className={styles.btn} disabled={busy} onClick={() => void act(() => respondToOffer(gig.id, true), true)}>
            Accept the job
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} disabled={busy} onClick={() => void act(() => respondToOffer(gig.id, false))}>
            Decline
          </button>
          {gig.owner ? (
            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => ask(gig.owner!.userId)}>
              Ask
            </button>
          ) : null}
        </span>
      ) : null}

      {/* Owner: applicants */}
      {owner && gig.status === 'open' ? (
        <>
          <p className={styles.sub}>{gig.directTo ? `Offer sent to @${gig.directTo.username}` : `${gig.applicants.length} applied`}</p>
          {gig.applicants.map((a) => (
            <div key={a.person.userId} className={styles.card}>
              <span className={styles.rowTop}>
                <span className={styles.title}>@{a.person.username}</span>
                <RankPill person={a.person} />
              </span>
              <span className={styles.meta}>{ratingText(a.person)} · {a.person.jobs} {a.person.jobs === 1 ? 'job' : 'jobs'}</span>
              {a.message ? <p className={styles.body}>{a.message}</p> : null}
              <span className={styles.actions}>
                <button type="button" className={styles.btn} disabled={busy} onClick={() => void act(() => hireWorker(gig.id, a.person.userId), true)}>
                  Hire · hold {naira(gig.fee + gig.budget)}
                </button>
                <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => ask(a.person.userId)}>
                  Ask
                </button>
              </span>
            </div>
          ))}
        </>
      ) : null}

      {/* Worker: do the job */}
      {worker && (gig.status === 'hired' || gig.status === 'working') ? (
        <>
          {gig.is3D ? (
            <p className={styles.note}>
              {gig.category === 'decorator'
                ? 'You have a key to their house. Go there, open Buy and move, turn or store their furniture, or place items from the item budget. Then tap Done here.'
                : 'You have a key to their house. Go there and tap the mess on the floor to clean it away. Then tap Done here.'}
            </p>
          ) : (
            <p className={styles.note}>The special 3D work for {c.label}s comes later. Agree the details in chat, do it, then tap Done.</p>
          )}
          <span className={styles.actions}>
            {gig.is3D && gig.houseOwner ? (
              <button type="button" className={styles.btn} disabled={!gig.keyOpen} onClick={() => goToHouse(gig.houseOwner!)}>
                🔑 {gig.keyOpen ? 'Go to the house' : `Starts ${startsLabel(gig.startAt).toLowerCase()}`}
              </button>
            ) : null}
            {gig.status === 'hired' && gig.keyOpen && !gig.is3D ? (
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} disabled={busy} onClick={() => void act(() => startGig(gig.id))}>
                Start
              </button>
            ) : null}
            <button type="button" className={styles.btn} disabled={busy || !gig.keyOpen} onClick={() => void act(() => markGigDone(gig.id))}>
              ✅ Done
            </button>
            {gig.owner ? (
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => ask(gig.owner!.userId)}>
                Ask
              </button>
            ) : null}
            {gig.status === 'hired' ? (
              <button type="button" className={`${styles.btn} ${styles.btnDanger}`} disabled={busy} onClick={() => void act(() => cancelGig(gig.id), true)}>
                Pull out
              </button>
            ) : null}
          </span>
        </>
      ) : null}
      {worker && gig.status === 'done' ? (
        <p className={styles.note}>Marked done. The owner has {autoLeft ?? 24}h to accept. After that you are paid automatically.</p>
      ) : null}
      {worker && gig.status === 'disputed' ? <p className={styles.note}>The owner raised a problem. Support will decide; the money stays held.</p> : null}

      {/* Owner: after hire */}
      {owner && (gig.status === 'hired' || gig.status === 'working') ? (
        <span className={styles.actions}>
          {gig.worker ? (
            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => ask(gig.worker!.userId)}>
              Ask
            </button>
          ) : null}
          {gig.status === 'hired' ? (
            <button type="button" className={`${styles.btn} ${styles.btnDanger}`} disabled={busy} onClick={() => void act(() => cancelGig(gig.id), true)}>
              Cancel and refund
            </button>
          ) : (
            <p className={styles.meta}>Work has started, so it can’t be cancelled. If it goes wrong, use Dispute once it is marked done.</p>
          )}
        </span>
      ) : null}
      {owner && gig.status === 'open' ? (
        <button type="button" className={`${styles.btn} ${styles.btnDanger}`} disabled={busy} onClick={() => void act(() => cancelGig(gig.id))}>
          Cancel this job
        </button>
      ) : null}
      {owner && gig.status === 'done' ? (
        <>
          <p className={styles.note}>The worker says it is done. Check your house, then accept to pay {naira(gig.fee)}. {autoLeft !== null ? `If you do nothing, it pays out in ${autoLeft}h.` : ''}</p>
          <span className={styles.actions}>
            <button type="button" className={styles.btn} disabled={busy} onClick={() => void act(() => acceptGig(gig.id), true)}>
              Accept and pay
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setDisputing(!disputing)}>
              Dispute
            </button>
          </span>
          {disputing ? (
            <>
              <textarea className={styles.input} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What went wrong?" />
              <button type="button" className={styles.btn} disabled={busy || !reason.trim()} onClick={() => void act(() => disputeGig(gig.id, reason))}>
                Send to support
              </button>
            </>
          ) : null}
        </>
      ) : null}
      {owner && gig.canUndo ? (
        <button type="button" className={`${styles.btn} ${styles.btnGhost}`} disabled={busy} onClick={() => void act(() => undoGigLayout(gig.id))}>
          ↩️ Undo the decorator’s changes
        </button>
      ) : null}
      {owner && gig.status === 'disputed' ? <p className={styles.note}>With support. The money stays held until they decide.</p> : null}

      {/* Rate after it is paid */}
      {gig.status === 'completed' && (owner || worker) ? (
        (owner ? gig.ratingForWorker : gig.ratingForOwner) ? (
          <p className={styles.meta}>You rated this {'★'.repeat((owner ? gig.ratingForWorker : gig.ratingForOwner) ?? 0)}</p>
        ) : (
          <div className={styles.card}>
            <span className={styles.label}>Rate {owner ? 'the worker' : 'the owner'}</span>
            <div className={styles.stars}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" className={styles.star} aria-label={`${n} stars`} onClick={() => void act(() => rateGig(gig.id, n))}>
                  ☆
                </button>
              ))}
            </div>
          </div>
        )
      ) : null}

      {!owner && gig.status === 'open' ? (
        <button
          type="button"
          className={`${styles.btn} ${styles.btnDanger}`}
          onClick={async () => {
            const res = await reportGig(gig.id, 'Reported from Gigs')
            toast(res.ok ? res.message : res.error, res.ok)
          }}
        >
          🚩 Report this post
        </button>
      ) : null}
    </div>
  )
}
