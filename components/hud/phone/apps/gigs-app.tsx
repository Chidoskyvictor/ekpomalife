'use client'

import { Briefcase, Car, CookingPot, Flag, Hammer, Handshake, LayoutGrid, MessageCircle, Music, Plus, Search, Sofa, Sparkles, X, type LucideIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { hapticTap } from '@/components/hud/haptic'
import { PlayerFace } from '@/components/look/player-face'
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
  fetchMyGigStats,
  fetchPros,
  fetchWorking,
  COOK_MENU,
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
  type MyGigStats,
  type MyPro,
  type Pro,
} from '@/lib/game/gigs-api'
import { openDirectChat } from '@/lib/game/hostels-api'
import { formatNaira } from '@/lib/game/live'
import { requestOpenChat } from '@/lib/game/open-chat'
import { pushNavigation } from '@/lib/navigation/safe-nav'
import { AppError, AppLoading } from '../app-state'
import styles from './gigs.module.css'

const naira = formatNaira
type Tab = 'pros' | 'board' | 'mine' | 'working'
type View = { name: 'tabs' } | { name: 'gig'; id: string } | { name: 'post'; directTo?: Pro }

const TABS: { id: Tab; label: string }[] = [
  { id: 'pros', label: 'Find a pro' },
  { id: 'board', label: 'Board' },
  { id: 'mine', label: 'My jobs' },
  { id: 'working', label: 'Working' },
]

const CAT_ICON: Record<GigCategory, LucideIcon> = { decorator: Sofa, cleaner: Sparkles, driver: Car, dj: Music, cook: CookingPot, other: Hammer }

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

function Face({ person, size = 48, dot = false }: { person: GigPerson; size?: number; dot?: boolean }) {
  return (
    <span className={styles.faceWrap}>
      <PlayerFace look={person.appearance} color={person.avatarColor} label={person.username} size={size} />
      {dot ? <span className={`${styles.faceDot} ${person.online ? styles.faceDotOn : ''}`} role="img" aria-label={person.online ? 'Online' : 'Offline'} /> : null}
    </span>
  )
}

function CategoryChips({ value, onChange, all = true }: { value: GigCategory | null; onChange: (c: GigCategory | null) => void; all?: boolean }) {
  return (
    <div className={styles.chips} role="group" aria-label="Kind of job">
      {all ? (
        <button type="button" className={`${styles.chip} ${value === null ? styles.chipOn : ''}`} aria-pressed={value === null} onClick={() => onChange(null)}>
          <LayoutGrid size={16} aria-hidden="true" /> All
        </button>
      ) : null}
      {GIG_CATEGORIES.map((c) => {
        const Icon = CAT_ICON[c.id]
        return (
          <button key={c.id} type="button" className={`${styles.chip} ${value === c.id ? styles.chipOn : ''}`} aria-pressed={value === c.id} onClick={() => onChange(c.id)}>
            <Icon size={16} aria-hidden="true" /> {c.label}
          </button>
        )
      })}
    </div>
  )
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className={styles.search}>
      <Search size={18} aria-hidden="true" />
      <input type="search" inputMode="search" value={value} maxLength={40} placeholder={placeholder} aria-label={placeholder} onChange={(e) => onChange(e.target.value)} />
      {value ? (
        <button type="button" className={styles.searchClear} aria-label="Clear search" onClick={() => onChange('')}>
          <X size={16} aria-hidden="true" />
        </button>
      ) : null}
    </label>
  )
}

/** Waits a moment after typing before the list is asked again. */
function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return v
}

/** Your own Gigs card: rank, stars, jobs done, and how far the next rank is. */
function MyCard({ stats }: { stats: MyGigStats | null }) {
  const { state } = useGame()
  if (!stats) return <div className={styles.hero} aria-busy="true" style={{ minHeight: 92 }} />
  const me = stats.me
  const next = stats.next
  const jobsPct = next ? Math.min(100, Math.round((me.jobs / Math.max(1, next.minJobs)) * 100)) : 100
  return (
    <section className={styles.hero} aria-label="Your Gigs rank">
      <div className={styles.heroTop}>
        <Face person={{ ...me, appearance: me.appearance ?? state?.appearance }} size={44} />
        <div className={styles.heroText}>
          <span className={styles.heroName}>@{me.username}</span>
          <span className={styles.row}>
            <RankPill person={me} />
            <span className={`${styles.pill} ${styles.stars}`}>{me.rating ? `★ ${me.rating.toFixed(1)}` : '☆ No ratings'}</span>
          </span>
        </div>
      </div>
      <div className={styles.heroStats}>
        <span>
          <b>{me.jobs}</b> {me.jobs === 1 ? 'job' : 'jobs'} done
        </span>
        <span>
          <b>{stats.working}</b> working now
        </span>
        {me.ownerRating ? (
          <span>
            Owners rate you <b>★ {me.ownerRating.toFixed(1)}</b>
          </span>
        ) : null}
      </div>
      {next ? (
        <div className={styles.nextRow}>
          <div className={styles.bar} role="progressbar" aria-valuenow={jobsPct} aria-valuemin={0} aria-valuemax={100} aria-label={`Progress to ${next.label}`}>
            <div className={styles.barFill} style={{ width: `${jobsPct}%` }} />
          </div>
          <span className={styles.heroHint}>
            {next.emoji} {next.label}: {next.minJobs} jobs, ★ {next.minAvg.toFixed(1)}
          </span>
        </div>
      ) : (
        <p className={styles.heroHint}>You are at the top rank. 👑</p>
      )}
    </section>
  )
}

function Empty({ pic, title, text, children }: { pic: string; title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className={styles.empty}>
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny local sticker */}
      <img className={styles.emptyPic} src={pic} alt="" width={64} height={64} />
      <h3 className={styles.emptyTitle}>{title}</h3>
      <p className={styles.emptyText}>{text}</p>
      {children}
    </div>
  )
}

/** Phone → Gigs: a job market between players. The fee is held until the job is accepted. */
export function GigsApp({ onHome, onClose }: { onHome: () => void; onClose: () => void }) {
  const { state, notifyToast, refreshServer } = useGame()
  const router = useRouter()
  // Find a pro is first: people list themselves there, so it is the screen with something in it
  const [tab, setTab] = useState<Tab>('pros')
  const [view, setView] = useState<View>({ name: 'tabs' })
  const [version, setVersion] = useState(0)
  const reload = () => setVersion((v) => v + 1)
  const [stats, setStats] = useState<MyGigStats | null>(null)
  useEffect(() => {
    let off = false
    void fetchMyGigStats().then((res) => {
      if (!off && res.ok) setStats(res)
    })
    return () => {
      off = true
    }
  }, [version])

  const toast = useCallback((msg: string | undefined, ok = true) => msg && notifyToast(msg, ok), [notifyToast])

  const ask = async (userId: string) => {
    hapticTap()
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

  const open = (id: string) => setView({ name: 'gig', id })
  return (
    <div className={styles.screen}>
      <MyCard stats={stats} />
      <div className={styles.tabs} role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`${styles.tab} ${tab === t.id ? styles.tabOn : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className={styles.bigBtns}>
        <button type="button" className={styles.bigBtn} onClick={() => setView({ name: 'post' })}>
          <Plus size={18} aria-hidden="true" /> Post a job
        </button>
        <button type="button" className={`${styles.bigBtn} ${styles.bigBtnTint}`} onClick={() => setTab('pros')}>
          <Handshake size={18} aria-hidden="true" /> Hire directly
        </button>
      </div>
      {tab === 'pros' ? <ProsTab key={`p${version}`} ask={ask} toast={toast} onHire={(pro) => setView({ name: 'post', directTo: pro })} reload={reload} /> : null}
      {tab === 'board' ? <BoardTab key={`b${version}`} ask={ask} toast={toast} onOpen={open} onPost={() => setView({ name: 'post' })} onFind={() => setTab('pros')} reload={reload} /> : null}
      {tab === 'mine' ? <ListTab key={`m${version}`} kind="mine" onOpen={open} onPost={() => setView({ name: 'post' })} onFind={() => setTab('pros')} /> : null}
      {tab === 'working' ? <ListTab key={`w${version}`} kind="working" onOpen={open} onPost={() => setView({ name: 'post' })} onFind={() => setTab('board')} /> : null}
    </div>
  )
}

// ── lists ──────────────────────────────────────────────────────────────────

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

function FlagButton({ done, onFlag }: { done: boolean; onFlag: () => void }) {
  return (
    <button type="button" className={styles.flag} disabled={done} aria-label={done ? 'Reported' : 'Report'} onClick={onFlag}>
      <Flag size={18} aria-hidden="true" />
    </button>
  )
}

function GigCard({
  gig,
  onOpen,
  ask,
  onApply,
  onReport,
  reported,
  busy,
  showStatus,
}: {
  gig: Gig
  onOpen: () => void
  ask?: () => void
  onApply?: () => void
  onReport?: () => void
  reported?: boolean
  busy?: boolean
  showStatus?: boolean
}) {
  const c = categoryOf(gig.category)
  const Icon = CAT_ICON[gig.category]
  const other = gig.role === 'owner' ? gig.worker : gig.owner
  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        {other ? <Face person={other} size={44} dot /> : null}
        <button type="button" className={`${styles.cardMain} ${styles.plain}`} onClick={onOpen}>
          <h3 className={`${styles.title} ${styles.title2}`}>{gig.title}</h3>
          <span className={styles.user}>
            {other ? <span className={styles.userName}>@{other.username}</span> : null}
            {other ? <RankPill person={other} /> : null}
            {other?.rating ? <span className={styles.stars}>★ {other.rating.toFixed(1)}</span> : null}
          </span>
        </button>
        <span className={styles.price}>
          <span className={styles.fee}>{naira(gig.fee)}</span>
          {gig.budget > 0 ? <span className={styles.feeSmall}>+{naira(gig.budget)} items</span> : null}
        </span>
      </div>
      <div className={styles.row}>
        <span className={styles.pill}>
          <Icon size={13} aria-hidden="true" /> {c.label}
        </span>
        {gig.dish ? <span className={styles.pill}>{gig.dish.emoji} {gig.dish.name}</span> : null}
        {showStatus ? <span className={`${styles.pill} ${styles.pillStatus}`}>{gig.role === 'offered' ? 'Offer for you' : GIG_STATUS_LABEL[gig.status]}</span> : null}
        {gig.status === 'open' ? <span className={styles.pill}>Starts {startsLabel(gig.startAt).toLowerCase()}</span> : null}
        {gig.role === 'owner' && gig.status === 'open' ? <span className={`${styles.pill} ${gig.applicantCount ? styles.pillWarn : ''}`}>{gig.applicantCount} applied</span> : null}
      </div>
      {gig.details ? <p className={`${styles.body} ${styles.clamp}`}>{gig.details}</p> : null}
      {onApply ? (
        <div className={styles.cardActions}>
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={ask}>
            <MessageCircle size={16} aria-hidden="true" /> Ask
          </button>
          <button type="button" className={`${styles.btn} ${gig.applied ? styles.btnDone : ''}`} disabled={busy || gig.applied} onClick={onApply}>
            {gig.applied ? 'Applied ✓' : 'Apply'}
          </button>
          <FlagButton done={Boolean(reported)} onFlag={() => onReport?.()} />
        </div>
      ) : (
        <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onOpen}>
          {gig.role === 'owner' ? 'Manage' : 'Open'}
        </button>
      )}
    </article>
  )
}

function BoardTab({
  ask,
  toast,
  onOpen,
  onPost,
  onFind,
  reload,
}: {
  ask: (userId: string) => void
  toast: (m?: string, ok?: boolean) => void
  onOpen: (id: string) => void
  onPost: () => void
  onFind: () => void
  reload: () => void
}) {
  const [cat, setCat] = useState<GigCategory | null>(null)
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const { data, error, retry } = useLoad(() => fetchBoard(cat, dq), [cat, dq])
  const [busy, setBusy] = useState<string | null>(null)
  const [reported, setReported] = useState<Set<string>>(new Set())
  const searching = Boolean(dq.trim()) || cat !== null
  return (
    <>
      <SearchBox value={q} onChange={setQ} placeholder="Search jobs or @username" />
      <CategoryChips value={cat} onChange={setCat} />
      {error && !data ? <AppError onRetry={retry}>{error}</AppError> : null}
      {!data && !error ? <AppLoading label="Loading jobs…" /> : null}
      {data && data.gigs.length === 0 ? (
        searching ? (
          <Empty pic="/emoji/briefcase.png" title="Nothing matches" text="Try another word or kind of job.">
            <button
              type="button"
              className={`${styles.btn} ${styles.btnQuiet}`}
              onClick={() => {
                setQ('')
                setCat(null)
              }}
            >
              Clear filters
            </button>
          </Empty>
        ) : (
          <Empty pic="/emoji/briefcase.png" title="No open jobs yet" text="Nobody has posted a job right now. Hire someone from Find a pro, or post your own and let them come to you.">
            <div className={styles.emptyBtns}>
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onFind}>
                Find a pro
              </button>
              <button type="button" className={styles.btn} onClick={onPost}>
                + Post a job
              </button>
            </div>
          </Empty>
        )
      ) : null}
      {data?.gigs.map((g) => (
        <GigCard
          key={g.id}
          gig={g}
          onOpen={() => onOpen(g.id)}
          ask={() => g.owner && ask(g.owner.userId)}
          busy={busy === g.id}
          reported={reported.has(g.id)}
          onApply={async () => {
            hapticTap()
            setBusy(g.id)
            const res = await applyToGig(g.id, '')
            setBusy(null)
            toast(res.ok ? 'Applied. The owner will see you.' : res.error, res.ok)
            if (res.ok) reload()
          }}
          onReport={async () => {
            const res = await reportGig(g.id, 'Reported from Gigs')
            toast(res.ok ? res.message : res.error, res.ok)
            if (res.ok) setReported(new Set([...reported, g.id]))
          }}
        />
      ))}
    </>
  )
}

function ListTab({ kind, onOpen, onPost, onFind }: { kind: 'mine' | 'working'; onOpen: (id: string) => void; onPost: () => void; onFind: () => void }) {
  const { data, error, retry } = useLoad(() => (kind === 'mine' ? fetchMine() : fetchWorking()))
  if (error && !data) return <AppError onRetry={retry}>{error}</AppError>
  if (!data) return <AppLoading label="Loading…" />
  if (data.gigs.length === 0) {
    return kind === 'mine' ? (
      <Empty pic="/emoji/house.png" title="No jobs posted" text="Need your room decorated, your floor cleaned, a ride or a meal? Post a job and pros will apply.">
        <button type="button" className={styles.btn} onClick={onPost}>
          + Post a job
        </button>
      </Empty>
    ) : (
      <Empty pic="/emoji/biceps.png" title="Not working yet" text="Apply to a job on the Board, or list yourself in Find a pro so people can hire you.">
        <button type="button" className={styles.btn} onClick={onFind}>
          See open jobs
        </button>
      </Empty>
    )
  }
  return (
    <>
      {data.gigs.map((g) => (
        <GigCard key={g.id} gig={g} onOpen={() => onOpen(g.id)} showStatus />
      ))}
    </>
  )
}

// ── find a pro ──────────────────────────────────────────────────────────────

function ProsTab({ ask, toast, onHire, reload }: { ask: (userId: string) => void; toast: (m?: string, ok?: boolean) => void; onHire: (p: Pro) => void; reload: () => void }) {
  const [cat, setCat] = useState<GigCategory | null>(null)
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const { data, error, retry } = useLoad(() => fetchPros(cat, dq), [cat, dq])
  const [editing, setEditing] = useState(false)
  const [reported, setReported] = useState<Set<string>>(new Set())
  const searching = Boolean(dq.trim()) || cat !== null
  return (
    <>
      <MyProCard
        mine={data?.mine ?? null}
        editing={editing}
        setEditing={setEditing}
        toast={toast}
        onSaved={() => {
          retry()
          reload()
        }}
      />
      <SearchBox value={q} onChange={setQ} placeholder="Find a pro by @username" />
      <CategoryChips value={cat} onChange={setCat} />
      {error && !data ? <AppError onRetry={retry}>{error}</AppError> : null}
      {!data && !error ? <AppLoading label="Finding pros…" /> : null}
      {data && data.pros.length === 0 ? (
        <Empty pic="/emoji/handshake.png" title={searching ? 'No pros match' : 'Nobody is listed yet'} text={searching ? 'Try another name or kind of work.' : 'Be the first: list yourself and people can hire you straight away.'}>
          {searching ? (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnQuiet}`}
              onClick={() => {
                setQ('')
                setCat(null)
              }}
            >
              Clear filters
            </button>
          ) : null}
        </Empty>
      ) : null}
      {data?.pros.map((p) => (
        <article key={p.userId} className={styles.card}>
          <div className={styles.cardHead}>
            <Face person={p} size={48} dot />
            <div className={styles.cardMain}>
              <h3 className={styles.title}>@{p.username}</h3>
              <span className={styles.user}>
                <RankPill person={p} />
                <span className={styles.stars}>{p.rating ? `★ ${p.rating.toFixed(1)}` : '☆ New'}</span>
                <span>
                  {p.jobs} {p.jobs === 1 ? 'job' : 'jobs'}
                </span>
              </span>
            </div>
            <span className={styles.price}>
              <span className={styles.fee}>{naira(p.fromPrice)}</span>
              <span className={styles.feeSmall}>from</span>
            </span>
          </div>
          <div className={styles.row}>
            {p.categories.map((c) => {
              const Icon = CAT_ICON[c]
              return (
                <span key={c} className={styles.pill}>
                  <Icon size={13} aria-hidden="true" /> {categoryOf(c).label}
                </span>
              )
            })}
            <span className={`${styles.pill} ${p.online && p.free ? styles.pillRising : ''}`}>{p.online ? (p.free ? 'Free now' : 'Busy') : 'Offline'}</span>
          </div>
          {p.pitch ? <p className={`${styles.body} ${styles.clamp}`}>{p.pitch}</p> : null}
          {p.isMe ? (
            <p className={styles.meta}>This is your listing.</p>
          ) : (
            <div className={styles.cardActions}>
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => ask(p.userId)}>
                <MessageCircle size={16} aria-hidden="true" /> Chat
              </button>
              <button
                type="button"
                className={styles.btn}
                onClick={() => {
                  hapticTap()
                  onHire(p)
                }}
              >
                Hire
              </button>
              <FlagButton
                done={reported.has(p.userId)}
                onFlag={async () => {
                  const res = await reportPro(p.userId, 'Reported from Gigs')
                  toast(res.ok ? res.message : res.error, res.ok)
                  if (res.ok) setReported(new Set([...reported, p.userId]))
                }}
              />
            </div>
          )}
        </article>
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
      <button type="button" className={`${styles.bigBtn} ${mine?.active ? styles.bigBtnTint : ''}`} onClick={() => setEditing(true)}>
        <Briefcase size={18} aria-hidden="true" /> {mine?.active ? 'Edit my listing' : 'List me for hire'}
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
        {GIG_CATEGORIES.map((c) => {
          const Icon = CAT_ICON[c.id]
          return (
            <button key={c.id} type="button" className={`${styles.chip} ${cats.includes(c.id) ? styles.chipOn : ''}`} onClick={() => setCats(cats.includes(c.id) ? cats.filter((x) => x !== c.id) : [...cats, c.id])}>
              <Icon size={16} aria-hidden="true" /> {c.label}
            </button>
          )
        })}
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
        <button type="button" className={`${styles.btn} ${styles.btnQuiet}`} onClick={() => setEditing(false)}>
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
  const [dishId, setDishId] = useState<string>(COOK_MENU[0]!.id)
  const [hours, setHours] = useState(0)
  const [busy, setBusy] = useState(false)
  const feeN = Math.floor(Number(fee) || 0)
  const dish = category === 'cook' ? (COOK_MENU.find((d) => d.id === dishId) ?? COOK_MENU[0]!) : null
  // A cook's ingredient money is the dish's price; a decorator's item budget is the owner's choice
  const budgetN = dish ? dish.cost : category === 'decorator' ? Math.floor(Number(budget) || 0) : 0
  const total = feeN + budgetN
  const submit = async () => {
    setBusy(true)
    const res = await postGig({ category, title, details, fee: feeN, budget: budgetN, startInHours: hours, directTo: directTo?.userId, ...(dish ? { dish: dish.id } : {}) })
    setBusy(false)
    if (!res.ok) return toast(res.error, false)
    onPosted(res.message ?? 'Posted.')
  }
  return (
    <div className={styles.screen}>
      <button type="button" className={`${styles.btn} ${styles.btnQuiet}`} style={{ alignSelf: 'flex-start' }} onClick={onCancel}>
        ← Back
      </button>
      <h3 className={styles.titleWrap}>{directTo ? `Hire @${directTo.username}` : 'Post a job'}</h3>
      {directTo ? <p className={styles.note}>They get your offer and can accept or decline. Your money is held only when they accept.</p> : null}
      <span className={styles.label}>Kind of job</span>
      <CategoryChips value={category} onChange={(c) => c && setCategory(c)} all={false} />
      {category === 'driver' || category === 'dj' ? (
        <p className={styles.note}>Special 3D work for {categoryOf(category).label}s comes later. You can post and pay for it now: agree the details in chat, then accept when it is done.</p>
      ) : null}
      {category === 'cook' ? (
        <>
          <span className={styles.label}>What should they cook?</span>
          <div className={styles.chips} role="group" aria-label="Dish">
            {COOK_MENU.map((d) => (
              <button key={d.id} type="button" className={`${styles.chip} ${dishId === d.id ? styles.chipOn : ''}`} aria-pressed={dishId === d.id} onClick={() => setDishId(d.id)}>
                <span aria-hidden="true">{d.emoji}</span> {d.name}
              </button>
            ))}
          </div>
          <p className={styles.note}>
            The cook walks to your stove in 3D and cooks it. The dish lands in your bag to eat. Ingredients ({naira(dish!.cost)}) are held with the fee. You need a stove in your house.
          </p>
        </>
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
  onBack,
  ask,
  goToHouse,
  toast,
  refreshMoney,
}: {
  id: string
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

  return (
    <div className={styles.screen}>
      <button type="button" className={`${styles.btn} ${styles.btnQuiet}`} style={{ alignSelf: 'flex-start' }} onClick={onBack}>
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
                : gig.category === 'cook'
                  ? `You have a key to their house. Go to their kitchen, tap the stove and cook ${gig.dish ? `${gig.dish.emoji} ${gig.dish.name}` : 'the dish'}. Then tap Done here.`
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
            <div className={styles.starRow}>
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
