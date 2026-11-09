'use client'

import { useCallback, useEffect, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import {
  announceFamilyChange,
  breakUp,
  cancelFamilyRequest,
  FAMILY_EVENT,
  fetchWithPlayer,
  RELATION_OPTIONS,
  respondFamilyRequest,
  sendFamilyRequest,
  type RelationId,
  type WithPlayer,
} from '@/lib/game/family-api'
import styles from './bae-row.module.css'

/** On a player's card: relationship status, closeness, "Ask to be my bae" (locked until 40) and "Add as family". */
export function BaeRow({ username }: { username: string }) {
  const { notifyToast } = useGame()
  const [data, setData] = useState<WithPlayer | null>(null)
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const [sure, setSure] = useState(false)

  const load = useCallback(async () => {
    const res = await fetchWithPlayer(username)
    if (res.ok) setData(res)
  }, [username])
  useEffect(() => {
    setData(null)
    setPicking(false)
    setSure(false)
    void load()
    window.addEventListener(FAMILY_EVENT, load)
    return () => window.removeEventListener(FAMILY_EVENT, load)
  }, [load])

  if (!data) return null

  const done = (message: string | null, good = true) => {
    if (message) notifyToast(message, good)
    announceFamilyChange()
    void load()
  }
  const askBae = async () => {
    setBusy(true)
    const res = await sendFamilyRequest(username, 'bae')
    setBusy(false)
    if (res.ok) done(`Asked @${username} 💕 They will see it in chat and Family.`)
    else notifyToast(res.error, false)
  }
  const askFamily = async (relation: RelationId) => {
    setBusy(true)
    const res = await sendFamilyRequest(username, 'relative', relation)
    setBusy(false)
    setPicking(false)
    if (res.ok) done(`Asked @${username} 👪`)
    else notifyToast(res.error, false)
  }
  const answer = async (id: string, accept: boolean) => {
    setBusy(true)
    const res = await respondFamilyRequest(id, accept)
    setBusy(false)
    if (res.ok) done(accept ? (res.request.kind === 'bae' ? 'You’re now baes 💕' : 'Added to family 👪') : null)
    else notifyToast(res.error, false)
  }
  const cancel = async (id: string) => {
    setBusy(true)
    await cancelFamilyRequest(id)
    setBusy(false)
    done(null)
  }
  const leave = async () => {
    setBusy(true)
    const res = await breakUp(username)
    setBusy(false)
    setSure(false)
    if (res.ok) done('You broke up 💔', false)
    else notifyToast(res.error, false)
  }

  const bae = data.pendingBae
  const rel = data.pendingRelative
  return (
    <section className={styles.row} aria-label="Relationship">
      <p className={styles.status}>
        {data.theirStatus ? <span className={styles.pill}>{data.theirStatus === 'Single' ? '🟢' : '💍'} {data.theirStatus}</span> : null}
        {data.baes ? <span className={styles.pill}>💕 Your bae{data.sneaky ? ' · 🤫' : ''}</span> : null}
        {data.relativeRole ? <span className={styles.pill}>👪 {data.relativeRole.replace('_', '/')}</span> : null}
      </p>

      {data.baes ? (
        sure ? (
          <div className={styles.two}>
            <button type="button" className={styles.btn} onClick={() => setSure(false)}>
              Keep
            </button>
            <button type="button" className={`${styles.btn} ${styles.danger}`} disabled={busy} onClick={() => void leave()}>
              Break up
            </button>
          </div>
        ) : (
          <button type="button" className={`${styles.btn} ${styles.danger}`} onClick={() => setSure(true)}>
            💔 Break up
          </button>
        )
      ) : bae ? (
        bae.mine ? (
          <button type="button" className={styles.btn} disabled={busy} onClick={() => void cancel(bae.id)}>
            💕 Asked · Cancel request
          </button>
        ) : (
          <div className={styles.two}>
            <button type="button" className={styles.btn} disabled={busy} onClick={() => void answer(bae.id, false)}>
              Decline
            </button>
            <button type="button" className={`${styles.btn} ${styles.main}`} disabled={busy} onClick={() => void answer(bae.id, true)}>
              Accept bae 💕
            </button>
          </div>
        )
      ) : data.unlocked && data.cooldownHours === 0 && !data.iAmFull ? (
        <button type="button" className={`${styles.btn} ${styles.main}`} disabled={busy} onClick={() => void askBae()}>
          💘 Ask to be my bae
        </button>
      ) : (
        <button type="button" className={styles.btn} disabled aria-label="Ask to be my bae, locked">
          <span>💘 Ask to be my bae</span>
          <small>
            {data.cooldownHours > 0
              ? `Try again in ${data.cooldownHours}h`
              : data.iAmFull
                ? 'You have the max baes'
                : `${data.progress} · chat, gist and hang out more`}
          </small>
        </button>
      )}

      {!data.relativeRole ? (
        rel ? (
          rel.mine ? (
            <button type="button" className={styles.btn} disabled={busy} onClick={() => void cancel(rel.id)}>
              👪 Asked · Cancel request
            </button>
          ) : (
            <div className={styles.two}>
              <button type="button" className={styles.btn} disabled={busy} onClick={() => void answer(rel.id, false)}>
                Decline
              </button>
              <button type="button" className={`${styles.btn} ${styles.main}`} disabled={busy} onClick={() => void answer(rel.id, true)}>
                Accept family 👪
              </button>
            </div>
          )
        ) : picking ? (
          <div className={styles.picks}>
            <small>They are my…</small>
            {RELATION_OPTIONS.map((o) => (
              <button key={o.id} type="button" className={styles.btn} disabled={busy} onClick={() => void askFamily(o.id)}>
                {o.emoji} {o.label}
              </button>
            ))}
          </div>
        ) : (
          <button type="button" className={styles.btn} onClick={() => setPicking(true)}>
            👪 Add as family
          </button>
        )
      ) : null}
    </section>
  )
}
