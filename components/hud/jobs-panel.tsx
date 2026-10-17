'use client'

import confetti from 'canvas-confetti'
import { useEffect, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { useEconomy } from '@/hooks/use-economy'
import { useGame } from '@/hooks/use-game'
import type { Job } from '@/lib/game/economy-api'
import { formatNaira } from '@/lib/game/live'
import styles from './economy.module.css'

function ShiftRing({ progress }: { progress: number }) {
  const r = 18
  const c = 2 * Math.PI * r
  const offset = c * (1 - Math.min(1, Math.max(0, progress)))
  return (
    <div className={styles.ringWrap} aria-hidden="true">
      <svg className={styles.ringSvg} width="52" height="52" viewBox="0 0 52 52">
        <circle className={styles.ringTrack} cx="26" cy="26" r={r} />
        <circle
          className={styles.ringProg}
          cx="26"
          cy="26"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className={styles.ringLabel}>{Math.round(progress * 100)}%</span>
    </div>
  )
}

function JobCard({
  job,
  isCurrent,
  onApply,
  busy,
}: {
  job: Job
  isCurrent: boolean
  onApply: () => void
  busy: boolean
}) {
  const locked = Boolean(job.locked)
  return (
    <article className={`${styles.card} ${locked ? styles.cardLocked : ''}`}>
      <div className={styles.cardRow}>
        <div>
          <p className={styles.cardTitle}>{job.title}</p>
          <p className={styles.cardMeta}>
            {job.shiftMinutes} min · Lvl {(job.currentLevel ?? 1)}
          </p>
        </div>
        <span className={styles.pay}>{formatNaira(job.payPerShift)}/shift</span>
      </div>
      {locked && job.lockReason ? <p className={styles.lockReason}>{job.lockReason}</p> : null}
      {!locked ? (
        <button
          type="button"
          className={styles.btn}
          disabled={busy || isCurrent}
          onClick={onApply}
        >
          {isCurrent ? 'Your job' : 'Apply'}
        </button>
      ) : null}
    </article>
  )
}

export function JobsPanel({ placeId }: { placeId: string }) {
  const reduced = useReducedMotion() ?? false
  const { state } = useGame()
  const { jobs, currentJobId, loading, working, loadJobs, apply, doShift } = useEconomy()
  const [shiftProgress, setShiftProgress] = useState(0)
  const [floatPay, setFloatPay] = useState<number | null>(null)

  useEffect(() => {
    void loadJobs(placeId)
  }, [placeId, loadJobs])

  const hereJobs = jobs.filter((job) => job.placeId === placeId)
  const current = jobs.find((job) => job.id === currentJobId)
  const canWorkHere = Boolean(current && current.placeId === placeId && state?.locationId === placeId)

  const runShift = async () => {
    if (working) return
    setShiftProgress(0)
    const started = Date.now()
    const duration = Math.min(2800, (current?.shiftMinutes ?? 30) * 40)
    const tick = window.setInterval(() => {
      const p = Math.min(1, (Date.now() - started) / duration)
      setShiftProgress(p)
      if (p >= 1) window.clearInterval(tick)
    }, 50)
    await new Promise((resolve) => window.setTimeout(resolve, duration))
    window.clearInterval(tick)
    setShiftProgress(1)
    const result = await doShift()
    setShiftProgress(0)
    if (!result) return
    setFloatPay(result.earned)
    window.setTimeout(() => setFloatPay(null), 1500)
    if (result.levelUp && !reduced) {
      void confetti({ particleCount: 70, spread: 62, origin: { y: 0.55 } })
    }
  }

  if (loading && hereJobs.length === 0) {
    return (
      <div className={styles.section} aria-busy="true">
        <p className={styles.sectionTitle}>Jobs here</p>
        <div className={styles.skeleton} />
        <div className={styles.skeleton} />
      </div>
    )
  }

  if (hereJobs.length === 0) return null

  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Jobs here</p>
      {hereJobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          isCurrent={job.id === currentJobId}
          busy={working}
          onApply={() => void apply(job.id)}
        />
      ))}
      {canWorkHere ? (
        <div className={styles.cardRow}>
          {working ? <ShiftRing progress={shiftProgress} /> : null}
          <button
            type="button"
            className={styles.btn}
            style={{ flex: 1 }}
            disabled={working}
            onClick={() => void runShift()}
          >
            {working ? 'Working…' : 'Work shift'}
          </button>
        </div>
      ) : null}
      {floatPay !== null ? (
        <span className={styles.floatPay} aria-live="polite">
          +{formatNaira(floatPay)}
        </span>
      ) : null}
    </div>
  )
}
