'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { hapticTap } from '@/components/hud/haptic'
import { cancelTable, fetchTables, hostTable, sitAtTable, type HubTable } from '@/lib/game/games-hub-api'
import { HOSTABLE, gameById } from './game-catalog'
import { Empty, Face, Skeletons, naira, timeLeft } from './hub-ui'
import styles from './hub.module.css'

const STAKES = [0, 500, 1000, 5000, 10000, 50000]

/** Everyone's open tables: host posts and leaves, someone sits, the match starts. */
export function TablesTab({
  onMatch,
  notify,
  hostOpen,
  setHostOpen,
}: {
  onMatch: (matchId: string) => void
  notify: (text: string, ok?: boolean) => void
  hostOpen: boolean
  setHostOpen: (open: boolean) => void
}) {
  const [tables, setTables] = useState<HubTable[] | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetchTables()
    if (res.ok) setTables(res.tables)
    else setError(res.error)
  }, [])

  useEffect(() => {
    void load()
    const id = window.setInterval(load, 8000)
    return () => window.clearInterval(id)
  }, [load])

  const sit = async (t: HubTable) => {
    hapticTap()
    setBusy(t.id)
    setError(null)
    const res = await sitAtTable(t.id)
    setBusy(null)
    if (!res.ok) {
      setError(res.error)
      void load()
      return
    }
    notify(`You’re in! ${t.host.displayName} has been told.`, true)
    onMatch(res.matchId)
  }

  const cancel = async (t: HubTable) => {
    setBusy(t.id)
    const res = await cancelTable(t.id)
    setBusy(null)
    if (!res.ok) return setError(res.error)
    notify(t.stake ? `Table taken down. ${naira(t.stake)} is back in your wallet.` : 'Table taken down.', true)
    void load()
  }

  const shown = (tables ?? []).filter((t) => filter === 'all' || t.game === filter)
  const mine = shown.filter((t) => t.mine)
  const others = shown.filter((t) => !t.mine)

  return (
    <>
      <button type="button" className={styles.btnBig} onClick={() => setHostOpen(true)}>
        <Plus size={22} aria-hidden="true" /> Host a table
      </button>
      <p className={styles.hint}>Post a table with your stake and rules, then go. When someone sits, you get a message and the match starts.</p>
      <div className={styles.chips} role="tablist" aria-label="Filter tables by game">
        <button type="button" className={`${styles.pill} ${filter === 'all' ? styles.pillOn : ''}`} onClick={() => setFilter('all')}>
          All
        </button>
        {HOSTABLE.map((g) => (
          <button key={g.id} type="button" className={`${styles.pill} ${filter === g.id ? styles.pillOn : ''}`} onClick={() => setFilter(g.id)}>
            <span aria-hidden="true">{g.emoji}</span> {g.name}
          </button>
        ))}
      </div>
      {error ? <p className={styles.err}>{error}</p> : null}
      {tables == null ? <Skeletons /> : null}
      {mine.length ? (
        <>
          <div className={styles.sectionHead}>
            <h3 className={styles.section}>Your tables</h3>
          </div>
          {mine.map((t) => (
            <TableCard key={t.id} t={t} busy={busy === t.id} onAction={() => void cancel(t)} />
          ))}
        </>
      ) : null}
      {tables != null && others.length ? (
        <>
          <div className={styles.sectionHead}>
            <h3 className={styles.section}>Open tables</h3>
            <span className={styles.hint}>{others.length} waiting</span>
          </div>
          {others.map((t) => (
            <TableCard key={t.id} t={t} busy={busy === t.id} onAction={() => void sit(t)} />
          ))}
        </>
      ) : null}
      {tables != null && !others.length && !mine.length ? (
        <Empty
          icon="🪑"
          title="No tables yet"
          text="Be the first. Host a table and the whole campus can see it."
          action={
            <button type="button" className={styles.btn} onClick={() => setHostOpen(true)}>
              Host one now
            </button>
          }
        />
      ) : null}
      <HostSheet
        open={hostOpen}
        onClose={() => setHostOpen(false)}
        defaultGame={filter !== 'all' ? filter : undefined}
        onDone={() => {
          setHostOpen(false)
          notify('Table posted. You can leave, we’ll tell you when someone sits.', true)
          void load()
        }}
      />
    </>
  )
}

function TableCard({ t, busy, onAction }: { t: HubTable; busy: boolean; onAction: () => void }) {
  const g = gameById(t.game)
  const variant = g.variants?.find((v) => v.id === t.variant)?.label
  return (
    <div className={`${styles.card} ${t.mine ? styles.cardMine : ''}`}>
      <div className={styles.cardHead}>
        <Face p={t.host} size={44} />
        <span className={styles.who}>
          <strong>{t.host.displayName}</strong>
          <span>
            @{t.host.username} · {timeLeft(t.expiresAt)}
          </span>
        </span>
        <span className={styles.gameTag}>
          <span aria-hidden="true">{g.emoji}</span> {g.name}
        </span>
      </div>
      {variant || t.note ? (
        <div className={styles.tags}>
          {variant ? <span className={styles.tag}>{variant}</span> : null}
          {t.note ? <span className={styles.tag}>“{t.note}”</span> : null}
        </div>
      ) : null}
      <div className={styles.cardFoot}>
        <span className={styles.money}>
          <small>{t.stake ? `Stake ${naira(t.stake)} each · Winner takes` : 'Friendly · no stake'}</small>
          <b className={t.stake ? '' : styles.free}>{t.stake ? naira(t.pot) : 'Bragging rights'}</b>
        </span>
        <button type="button" className={t.mine ? styles.btnGhost : styles.btnOk} disabled={busy} onClick={onAction}>
          {busy ? '…' : t.mine ? 'Take down' : 'Sit'}
        </button>
      </div>
    </div>
  )
}

function HostSheet({ open, onClose, onDone, defaultGame }: { open: boolean; onClose: () => void; onDone: () => void; defaultGame?: string }) {
  const [game, setGame] = useState<string>(defaultGame && HOSTABLE.some((g) => g.id === defaultGame) ? defaultGame : HOSTABLE[0]!.id)
  const [variant, setVariant] = useState<string>('')
  const [stake, setStake] = useState(0)
  const [custom, setCustom] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const g = gameById(game)
  const amount = custom ? Math.floor(Number(custom.replace(/[^\d]/g, '')) || 0) : stake

  const host = async () => {
    hapticTap()
    setBusy(true)
    setError(null)
    const res = await hostTable({ game, variant: variant || g.variants?.[0]?.id, stake: amount, note: note.trim() || undefined })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setNote('')
    onDone()
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Host a table"
      startExpanded
      subtitle="Post it, then go. We’ll tell you when someone sits."
      footer={
        <button type="button" className={styles.btnBig} disabled={busy} onClick={() => void host()}>
          {busy ? 'Posting…' : amount ? `Host · stake ${naira(amount)}` : 'Host friendly table'}
        </button>
      }
    >
      <div className={styles.form}>
        <div>
          <p className={styles.label}>Game</p>
          <div className={styles.gameGrid}>
            {HOSTABLE.map((x) => (
              <button
                key={x.id}
                type="button"
                className={`${styles.gameTile} ${game === x.id ? styles.gameTileOn : ''}`}
                onClick={() => {
                  setGame(x.id)
                  setVariant('')
                }}
              >
                <span aria-hidden="true">{x.emoji}</span>
                <span>{x.name.replace('Tic tac toe', 'Tic-tac')}</span>
              </button>
            ))}
          </div>
        </div>
        {g.variants ? (
          <div>
            <p className={styles.label}>House rules</p>
            <div className={styles.chips}>
              {g.variants.map((v, i) => (
                <button
                  key={v.id}
                  type="button"
                  className={`${styles.pill} ${(variant || g.variants![0]!.id) === v.id ? styles.pillOn : ''}`}
                  onClick={() => setVariant(v.id)}
                  aria-pressed={(variant || g.variants![0]!.id) === v.id}
                  data-first={i === 0}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div>
          <p className={styles.label}>Stake (each)</p>
          <div className={styles.chips}>
            {STAKES.map((s) => (
              <button
                key={s}
                type="button"
                className={`${styles.pill} ${!custom && stake === s ? styles.pillOn : ''}`}
                onClick={() => {
                  setStake(s)
                  setCustom('')
                }}
              >
                {s ? naira(s) : 'Friendly'}
              </button>
            ))}
          </div>
          <input
            className={styles.input}
            style={{ marginTop: 8 }}
            inputMode="numeric"
            placeholder="Or type an amount (₦)"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            aria-label="Custom stake"
          />
        </div>
        <div>
          <p className={styles.label}>Table note (optional)</p>
          <input
            className={styles.input}
            maxLength={40}
            placeholder="e.g. no trash talk, serious players"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className={styles.summary}>
          <span>Winner takes</span>
          <b>{amount ? naira(amount * 2) : 'Bragging rights'}</b>
          <span>
            {amount
              ? `Your ${naira(amount)} is held in escrow now. It goes to the winner, or comes back to you if nobody sits within 6 hours.`
              : 'No money on this one. It still counts on Top Charts.'}
          </span>
        </div>
        {error ? <p className={styles.err}>{error}</p> : null}
      </div>
    </BottomSheet>
  )
}
