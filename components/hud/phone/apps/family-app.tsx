'use client'

import dynamic from 'next/dynamic'
import { Banknote, HeartCrack, MessageCircle, Sparkles, UtensilsCrossed, VenetianMask } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useGame } from '@/hooks/use-game'
import {
  announceFamilyChange,
  breakUp,
  claimAnniversary,
  FAMILY_EVENT,
  fetchFamily,
  markFamilySeen,
  planDate,
  removeRelative,
  setSneaky,
  type Bae,
  type Family,
  type Relative,
} from '@/lib/game/family-api'
import { openDirectChat, sendChatMoney } from '@/lib/game/hostels-api'
import { normalizeAppearance, type Appearance } from '@/lib/game/look'
import { requestOpenChat } from '@/lib/game/open-chat'
import { FamilyRequestCard } from './family-request-card'
import styles from './family.module.css'

const AvatarPortrait = dynamic(() => import('@/components/hud/avatar-portrait').then((m) => m.AvatarPortrait), { ssr: false })

type Tab = 'baes' | 'family' | 'requests'

function Face({ name, look }: { name: string; look: unknown }) {
  return (
    <span className={styles.face}>
      <AvatarPortrait
        appearance={normalizeAppearance(look as Partial<Appearance>)}
        fallbackColor="#db2777"
        initial={name[0]?.toUpperCase() ?? '?'}
        className=""
      />
    </span>
  )
}

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`

/** Phone → Family: baes (chat, date, money, couple level + goals), relatives, and requests. */
export function FamilyApp() {
  const { notifyToast, refreshServer } = useGame()
  const [family, setFamily] = useState<Family | null>(null)
  const [tab, setTab] = useState<Tab>('baes')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetchFamily()
    if (res.ok) setFamily(res)
    else setError(res.error)
  }, [])
  useEffect(() => {
    void load()
    void markFamilySeen()
    window.addEventListener(FAMILY_EVENT, load)
    return () => window.removeEventListener(FAMILY_EVENT, load)
  }, [load])

  const toast = (message: string, good = true) => notifyToast(message, good)
  const apply = (res: ({ ok: true } & Family) | { ok: false; error: string }) => {
    if (res.ok) {
      setFamily(res)
      announceFamilyChange()
    } else toast(res.error, false)
  }

  if (error && !family) return <p className={styles.empty}>{error}</p>
  if (!family) return <p className={styles.empty}>Loading...</p>

  const waiting = family.incoming.length
  return (
    <div className={styles.app}>
      <div className={styles.tabs} role="tablist">
        {(
          [
            ['baes', `💘 Baes`],
            ['family', '👪 Family'],
            ['requests', 'Requests'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`${styles.tab} ${tab === id ? styles.tabOn : ''}`} onClick={() => setTab(id)}>
            {label}
            {id === 'requests' && waiting ? <span className={styles.badge}>{waiting}</span> : null}
          </button>
        ))}
      </div>

      {family.events.slice(0, 2).map((e) => (
        <p key={e.id} className={styles.event}>
          {e.body}
        </p>
      ))}

      {tab === 'baes' ? (
        <>
          <p className={styles.section}>
            Baes {family.baes.length}/{family.maxBaes}
          </p>
          {family.baes.length === 0 ? (
            <p className={styles.empty}>No baes yet. Chat, gist and hang out with someone, then tap “Ask to be my bae” on their card.</p>
          ) : null}
          {family.baes.map((b) => (
            <BaeCard key={b.username} bae={b} family={family} apply={apply} toast={toast} onChanged={() => void refreshServer()} />
          ))}
        </>
      ) : null}

      {tab === 'family' ? (
        <>
          <p className={styles.section}>Relatives</p>
          {family.relatives.length === 0 ? <p className={styles.empty}>No relatives yet. Tap 👪 “Add as family” on a player’s card.</p> : null}
          {family.relatives.map((r) => (
            <RelativeCard key={r.username} rel={r} apply={apply} />
          ))}
        </>
      ) : null}

      {tab === 'requests' ? (
        <>
          <p className={styles.section}>For you</p>
          {family.incoming.length === 0 ? <p className={styles.empty}>Nothing waiting.</p> : null}
          {family.incoming.map((r) => (
            <FamilyRequestCard key={r.id} id={r.id} initial={r} compact />
          ))}
          {family.outgoing.length ? <p className={styles.section}>You asked</p> : null}
          {family.outgoing.map((r) => (
            <FamilyRequestCard key={r.id} id={r.id} initial={r} compact />
          ))}
        </>
      ) : null}
    </div>
  )
}

function Status({ online, atHome }: { online: boolean; atHome: boolean }) {
  return (
    <span>
      <span className={`${styles.dot} ${online ? styles.dotOn : ''}`} aria-hidden="true" />
      {atHome ? 'At home 🏠' : online ? 'Online' : 'Offline'}
    </span>
  )
}

function BaeCard({
  bae,
  family,
  apply,
  toast,
  onChanged,
}: {
  bae: Bae
  family: Family
  apply: (r: ({ ok: true } & Family) | { ok: false; error: string }) => void
  toast: (m: string, good?: boolean) => void
  onChanged: () => void
}) {
  const [open, setOpen] = useState<'date' | 'money' | 'breakup' | null>(null)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const next = bae.level * 25
  const pct = Math.min(100, Math.round(((bae.xp - (bae.level - 1) * 25) / 25) * 100))

  const chat = async () => {
    const res = await openDirectChat(bae.userId)
    if (res.ok) requestOpenChat(res.chat)
    else toast(res.error, false)
  }
  const date = async (spot: string) => {
    setBusy(true)
    const res = await planDate(bae.username, spot)
    setBusy(false)
    if (!res.ok) return toast(res.error, false)
    setOpen(null)
    apply({ ok: true, ...res.family })
    onChanged()
    toast(res.caught ? `${res.spot.emoji} Date done... but somebody saw you 👀` : `${res.spot.emoji} Lovely ${res.spot.label.toLowerCase()} with @${bae.username}`)
  }
  const money = async () => {
    const n = Math.floor(Number(amount))
    if (!n || n < 100) return toast('Send at least ₦100.', false)
    setBusy(true)
    const chatRes = await openDirectChat(bae.userId)
    const res = chatRes.ok ? await sendChatMoney(chatRes.chat.id, n) : chatRes
    setBusy(false)
    if (!res.ok) return toast(res.error, false)
    setOpen(null)
    setAmount('')
    onChanged()
    toast(`Sent ${naira(n)} to @${bae.username} 💸`)
  }

  return (
    <article className={styles.person}>
      <div className={styles.who}>
        <Face name={bae.username} look={bae.appearance} />
        <span className={styles.names}>
          <strong>
            @{bae.username} {bae.sneaky ? '🤫' : '💕'}
          </strong>
          <Status online={bae.online} atHome={bae.atHome} />
        </span>
      </div>
      <div className={styles.level}>
        <span>Lv {bae.level}</span>
        <span className={styles.bar} aria-hidden="true">
          <span className={styles.barFill} style={{ width: `${pct}%` }} />
        </span>
        <span>{bae.xp}/{next} XP</span>
      </div>
      <div className={styles.goals}>
        {bae.goals.map((g) => (
          <span key={g.id} className={`${styles.goal} ${g.done >= g.target ? styles.goalDone : ''}`}>
            <span aria-hidden="true">{g.emoji}</span>
            <span>{g.label}</span>
            <span>
              {Math.min(g.done, g.target)}/{g.target}
            </span>
          </span>
        ))}
      </div>
      {bae.anniversaryDue ? (
        <button type="button" className={styles.yes} disabled={busy} onClick={() => void claimAnniversary(bae.username).then((r) => (apply(r), r.ok && toast('Happy anniversary 🎂 +Fun +Social')))}>
          🎂 Celebrate anniversary
        </button>
      ) : null}
      <div className={styles.chips}>
        <button type="button" className={styles.chip} onClick={() => void chat()}>
          <MessageCircle size={18} aria-hidden="true" />
          Chat
        </button>
        <button type="button" className={`${styles.chip} ${open === 'date' ? styles.chipOn : ''}`} onClick={() => setOpen(open === 'date' ? null : 'date')}>
          <UtensilsCrossed size={18} aria-hidden="true" />
          Date
        </button>
        <button type="button" className={`${styles.chip} ${open === 'money' ? styles.chipOn : ''}`} onClick={() => setOpen(open === 'money' ? null : 'money')}>
          <Banknote size={18} aria-hidden="true" />
          Money
        </button>
        <button type="button" className={`${styles.chip} ${styles.chipDanger}`} onClick={() => setOpen(open === 'breakup' ? null : 'breakup')}>
          <HeartCrack size={18} aria-hidden="true" />
          Break up
        </button>
      </div>
      <button
        type="button"
        className={`${styles.chip} ${bae.sneaky ? styles.chipOn : ''}`}
        style={{ flexDirection: 'row', gap: 6 }}
        onClick={() => void setSneaky(bae.username, !bae.sneaky).then(apply)}
      >
        <VenetianMask size={16} aria-hidden="true" /> {bae.sneaky ? '🤫 Sneaky link (tap to un-hide)' : 'Make 🤫 sneaky link'}
      </button>

      {open === 'date' ? (
        <Sheet title="Plan a date">
          <div className={styles.options}>
            {family.dateSpots.map((s) => (
              <button key={s.id} type="button" className={styles.chip} disabled={busy} onClick={() => void date(s.id)}>
                <span aria-hidden="true">{s.emoji}</span>
                {s.label}
                <span>{s.cost ? naira(s.cost) : 'Free'}</span>
              </button>
            ))}
          </div>
          {bae.sneaky ? (
            <p className={styles.cardSub}>
              <Sparkles size={12} aria-hidden="true" /> Secret dates can get noticed.
            </p>
          ) : null}
        </Sheet>
      ) : null}
      {open === 'money' ? (
        <Sheet title={`Send money to @${bae.username}`}>
          <div className={styles.options}>
            {[500, 1000, 5000].map((n) => (
              <button key={n} type="button" className={styles.chip} onClick={() => setAmount(String(n))}>
                {naira(n)}
              </button>
            ))}
          </div>
          <input className={styles.amount} inputMode="numeric" placeholder="Amount (₦)" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
          <button type="button" className={styles.yes} disabled={busy || !amount} onClick={() => void money()}>
            Send
          </button>
        </Sheet>
      ) : null}
      {open === 'breakup' ? (
        <Sheet title={`End things with @${bae.username}?`}>
          <div className={styles.row}>
            <button type="button" className={styles.no} onClick={() => setOpen(null)}>
              Keep
            </button>
            <button type="button" className={styles.yes} onClick={() => void breakUp(bae.username).then((r) => (apply(r), r.ok && toast('You broke up 💔', false)))}>
              Break up
            </button>
          </div>
        </Sheet>
      ) : null}
    </article>
  )
}

function Sheet({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.sheet}>
      <strong>{title}</strong>
      {children}
    </div>
  )
}

function RelativeCard({ rel, apply }: { rel: Relative; apply: (r: ({ ok: true } & Family) | { ok: false; error: string }) => void }) {
  const [sure, setSure] = useState(false)
  const chat = async () => {
    const res = await openDirectChat(rel.userId)
    if (res.ok) requestOpenChat(res.chat)
  }
  return (
    <article className={styles.person}>
      <div className={styles.who}>
        <Face name={rel.username} look={rel.appearance} />
        <span className={styles.names}>
          <strong>@{rel.username}</strong>
          <span>
            {rel.roleLabel} · <Status online={rel.online} atHome={rel.atHome} />
          </span>
        </span>
      </div>
      <div className={styles.row}>
        <button type="button" className={styles.ghost} onClick={() => void chat()}>
          Chat
        </button>
        {sure ? (
          <button type="button" className={styles.yes} onClick={() => void removeRelative(rel.username).then(apply)}>
            Remove for sure
          </button>
        ) : (
          <button type="button" className={styles.ghost} onClick={() => setSure(true)}>
            Remove
          </button>
        )}
      </div>
    </article>
  )
}
