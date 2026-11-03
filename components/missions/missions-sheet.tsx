'use client'

import { RefreshCw, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import { runTimed } from '@/lib/game/activity'
import { missionAction, refreshMissions, ROLE_TAG, useMissions, type MissionView } from '@/lib/game/missions-api'
import { pushNavigation } from '@/lib/navigation/safe-nav'
import base from '@/components/hud/map-place-sheet.module.css'
import styles from './missions.module.css'

function untilLabel(ms: number) {
  const mins = Math.max(0, Math.round(ms / 60_000))
  const h = Math.floor(mins / 60)
  return h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`
}

/** Today's 3 missions: Go takes you to the place, Start runs it there, ↻ swaps one (once a day). */
export function MissionsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const { state, isGuest, select, notifyToast, refreshServer } = useGame()
  const view = useMissions(!isGuest)
  const [busy, setBusy] = useState<string | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!open) return
    void refreshMissions()
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open || isGuest) return null
  const here = state?.locationId ?? ''

  const go = (m: MissionView) => {
    const place = m.places[0]
    if (!place) return
    onClose()
    select(place)
    pushNavigation(router, '/')
  }

  const start = async (m: MissionView) => {
    setBusy(m.id)
    const started = await missionAction('start', m.id)
    if (!started.ok) {
      setBusy(null)
      notifyToast(started.error, false)
      return
    }
    onClose()
    await runTimed({ emoji: m.emoji, title: m.title, seconds: m.seconds }, async () => {
      const done = await missionAction('finish', m.id)
      notifyToast(done.ok ? done.message : done.error, done.ok && !done.message.startsWith('🚨'))
      void refreshServer()
    })
    setBusy(null)
  }

  const swap = async (m: MissionView) => {
    setBusy(m.id)
    const res = await missionAction('swap', m.id)
    setBusy(null)
    notifyToast(res.ok ? res.message : res.error, res.ok)
  }

  const done = view?.doneCount ?? 0
  const total = view?.missions.length ?? 3

  return (
    <section className={base.sheet} aria-label="Today's missions">
      <div className={base.handle} aria-hidden="true" />
      <header className={base.head}>
        <span className={base.icon} aria-hidden="true">
          🎯
        </span>
        <div className={base.titles}>
          <h2>Today&apos;s Missions</h2>
          <p>{view ? `New missions in ${untilLabel(view.resetsAt - Date.now())}` : 'Loading…'}</p>
        </div>
        <button type="button" className={base.close} aria-label="Close" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      {view ? (
        <>
          <div className={styles.summary}>
            <span className={styles.ring} style={{ ['--done' as string]: (done / Math.max(1, total)) * 100 }}>
              {done}/{total}
            </span>
            <div className={styles.summaryText}>
              <strong>{view.bonusPaid ? 'Daily bonus collected 🎁' : `Do all ${total} for the daily bonus`}</strong>
              <span>+₦{view.bonus.toLocaleString()} when all {total} are done</span>
            </div>
          </div>

          <div className={styles.list}>
            {view.missions.map((m) => {
              const atPlace = m.places.includes(here)
              const running = busy === m.id
              return (
                <article key={m.id} className={`${styles.card} ${m.done ? styles.cardDone : ''}`}>
                  <span className={styles.emoji} aria-hidden="true">
                    {m.emoji}
                  </span>
                  <div className={styles.info}>
                    <div className={styles.tagRow}>
                      <span className={styles.tag}>{ROLE_TAG[m.role]}</span>
                      {m.risky ? <span className={`${styles.tag} ${styles.tagRisk}`}>RISKY</span> : null}
                    </div>
                    <p className={styles.title}>{m.title}</p>
                    <p className={styles.blurb}>
                      {m.blurb}
                      {m.hours ? ` · ${m.hours}` : ''}
                      {m.seconds ? ` · ${m.seconds}s` : ''}
                    </p>
                    <p className={styles.meta}>
                      +₦{m.reward.toLocaleString()}
                      {m.progress ? ` · ${m.progress.now}/${m.progress.goal} people` : ''}
                    </p>
                  </div>
                  <div className={styles.side}>
                    {m.done ? (
                      <span className={styles.check}>Done ✅</span>
                    ) : m.auto === 'bond' ? null : m.auto === 'lecture' ? (
                      <button type="button" className={styles.go} onClick={() => go(m)}>
                        Go
                      </button>
                    ) : atPlace ? (
                      <button type="button" className={styles.go} disabled={Boolean(busy)} onClick={() => void start(m)}>
                        {running ? '…' : 'Start'}
                      </button>
                    ) : (
                      <button type="button" className={styles.go} onClick={() => go(m)}>
                        Go
                      </button>
                    )}
                    {!m.done && !view.swapped ? (
                      <button
                        type="button"
                        className={styles.swap}
                        aria-label={`Swap ${m.title}`}
                        disabled={Boolean(busy)}
                        onClick={() => void swap(m)}
                      >
                        <RefreshCw size={14} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
          <p className={styles.note}>{view.swapped ? 'Free swap used today' : '1 free swap today: tap ↻ on a mission'}</p>
        </>
      ) : null}
    </section>
  )
}
