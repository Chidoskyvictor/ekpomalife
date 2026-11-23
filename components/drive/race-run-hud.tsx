'use client'

import { Flag, RotateCcw, Trophy, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { hapticTap } from '@/components/hud/haptic'
import { useDrive } from '@/lib/game/drive'
import { formatGap, formatRaceTime, kmLabel, ordinal } from '@/lib/game/race-courses'
import { badgeById, rankFor, upgradeNote } from '@/lib/game/race-rewards'
import { again, arriveAtGrid, endRun, finishRun, pressStart, runLive, toStartBox, useRun } from '@/lib/game/race-run'
import { checkpointSound, finishSound, goSound, lightBeep, revBlip } from '@/lib/game/race-sound'
import styles from './race-run.module.css'

/** Re-read the live numbers a few times a second (the scene writes them every frame). */
function useTicker(on: boolean, every = 100) {
  const [, set] = useState(0)
  useEffect(() => {
    if (!on) return
    const id = window.setInterval(() => set((n) => n + 1), every)
    return () => window.clearInterval(id)
  }, [on, every])
}

/** Top-left, in the flow under the top row: where to go before the race, then your place, clock and checkpoints. */
export function RaceRunTop() {
  const run = useRun()
  const phase = run?.phase
  useTicker(phase === 'toGrid' || phase === 'racing' || phase === 'countdown')
  const [flash, setFlash] = useState<{ text: string; at: number } | null>(null)
  const seen = useRef(0)

  useEffect(() => {
    if (phase !== 'racing') {
      seen.current = 0
      return
    }
    const id = window.setInterval(() => {
      const passed = runLive.tracker.passed
      if (passed > seen.current && run) {
        const total = run.course.checkpoints.length
        const at = runLive.tracker.splits[passed - 1] ?? runLive.t
        if (passed < total) {
          checkpointSound()
          setFlash({ text: `Checkpoint ${passed}/${total} · ${formatRaceTime(at)}`, at: performance.now() })
        }
        seen.current = passed
      }
      setFlash((f) => (f && performance.now() - f.at > 2200 ? null : f))
    }, 150)
    return () => window.clearInterval(id)
  }, [phase, run])

  if (!run) return null
  const { course } = run

  if (phase === 'toGrid') {
    return (
      <div className={styles.banner} role="status">
        <span className={styles.bannerIcon} aria-hidden="true">
          <Flag size={16} />
        </span>
        <div className={styles.bannerText}>
          <strong>{course.name}</strong>
          <small>
            Start line · {kmLabel(runLive.toStart || toStartBox(course))}. Follow the arrows and stop in the glowing box.
          </small>
        </div>
        <button
          type="button"
          className={styles.bannerGo}
          onClick={() => {
            hapticTap()
            arriveAtGrid()
          }}
        >
          Take me there
        </button>
        <button type="button" className={styles.bannerX} aria-label="Cancel the race" onClick={endRun}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    )
  }

  if (phase === 'racing' || phase === 'countdown' || phase === 'done') {
    const total = course.checkpoints.length
    const passed = runLive.tracker.passed
    const racers = Math.max(1, runLive.racers.length)
    const lap = course.laps > 1 ? Math.min(course.laps, Math.floor(runLive.tracker.progress / course.lap) + 1) : 0
    return (
      <div className={styles.live} role="status" aria-label="Race status">
        {racers > 1 ? (
          <div className={styles.place}>
            <strong>{ordinal(runLive.place)}</strong>
            <small>/ {racers}</small>
          </div>
        ) : null}
        <div className={styles.clock}>{formatRaceTime(phase === 'racing' || phase === 'done' ? runLive.t : 0)}</div>
        <div className={styles.pips} aria-label={`${passed} of ${total} checkpoints`}>
          {course.checkpoints.map((_, i) => (
            <span key={i} className={i < passed ? styles.pipOn : i === passed ? styles.pipNext : ''} />
          ))}
        </div>
        {lap ? <small className={styles.lap}>Lap {lap}/{course.laps}</small> : <small className={styles.lap}>{kmLabel(Math.max(0, course.length - runLive.tracker.progress))} to go</small>}
        {flash ? <small className={styles.flash}>{flash.text}</small> : null}
        {phase === 'racing' ? (
          <button type="button" className={styles.quit} onClick={() => finishRun(null, [])}>
            Quit
          </button>
        ) : null}
      </div>
    )
  }
  return null
}

/** Over the whole drive view: the lights, the Start button and the results. */
export function RaceRunOverlay() {
  const run = useRun()
  const drive = useDrive()
  const phase = run?.phase
  useTicker(phase === 'countdown', 80)
  const lastBeat = useRef(-1)

  // Sounds follow the countdown
  useEffect(() => {
    if (phase !== 'countdown') {
      lastBeat.current = -1
      return
    }
    const id = window.setInterval(() => {
      const left = runLive.goAt - performance.now()
      const beat = left > 3000 ? 0 : left > 2000 ? 1 : left > 1000 ? 2 : 3
      if (beat === lastBeat.current) return
      lastBeat.current = beat
      if (beat === 0) revBlip(1)
      else {
        lightBeep()
        revBlip(beat + 1)
      }
    }, 60)
    return () => window.clearInterval(id)
  }, [phase])

  const [go, setGo] = useState(false)
  useEffect(() => {
    if (phase !== 'racing') return
    goSound()
    setGo(true)
    const id = window.setTimeout(() => setGo(false), 1100)
    return () => window.clearTimeout(id)
  }, [phase, run?.id])

  useEffect(() => {
    if (phase === 'done' && run?.result?.ms != null) finishSound()
  }, [phase, run?.result?.ms])

  if (!run) return null

  if (phase === 'countdown') {
    const left = runLive.goAt - performance.now()
    const lit = left > 3000 ? 0 : left > 2000 ? 1 : left > 1000 ? 2 : 3
    const word = left > 3000 ? 'Get ready' : String(Math.max(1, Math.ceil(left / 1000)))
    return (
      <div className={styles.count} role="status" aria-live="assertive">
        <div className={styles.lights} aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className={i < lit ? styles.red : ''} />
          ))}
        </div>
        <strong className={word.length > 1 ? styles.words : ''}>{word}</strong>
        <small>{run.course.name}</small>
      </div>
    )
  }

  if (go) {
    return (
      <div className={styles.count} role="status" aria-live="assertive">
        <div className={styles.lights} aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className={styles.green} />
          ))}
        </div>
        <strong className={styles.goText}>GO!</strong>
      </div>
    )
  }

  if (phase === 'grid') {
    const rivals = run.ai.length
    return (
      <div className={styles.grid} role="dialog" aria-label="On the grid">
        <div className={styles.gridText}>
          <strong>You&apos;re on the grid</strong>
          <small>
            {run.course.name} · {kmLabel(run.course.length)}
            {run.course.laps > 1 ? ` · ${run.course.laps} laps` : ''} · {rivals > 0 ? `${rivals} AI ${rivals === 1 ? 'driver' : 'drivers'}` : 'solo'}
          </small>
        </div>
        <ul className={styles.entries} aria-label="The field">
          {[{ key: 'you', name: 'You', xp: run.playerXp, up: run.playerUp, you: true }, ...run.ai.map((a) => ({ key: a.id, name: a.name, xp: a.xp, up: a.up, you: false }))].map((e) => (
            <li key={e.key} className={e.you ? styles.meRow : ''}>
              <span aria-hidden="true">{rankFor(e.xp).emoji}</span>
              <em>{e.name}</em>
              <small>{rankFor(e.xp).name}</small>
              <b className={upgradeNote(e.up) ? styles.fitted : ''}>{upgradeNote(e.up) ?? 'Stock'}</b>
            </li>
          ))}
        </ul>
        <div className={styles.gridButtons}>
          <button type="button" className={styles.ghost} onClick={endRun}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.start}
            onClick={() => {
              hapticTap()
              pressStart()
            }}
          >
            Start
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'done' && run.result) {
    const r = run.result
    const solo = r.of <= 1
    const board = r.board
    return (
      <div className={styles.result} role="dialog" aria-label="Race result">
        <div className={styles.resultHead}>
          <span className={styles.medal} aria-hidden="true">
            {r.ms === null ? '🏁' : r.place === 1 ? '🏆' : r.place === 2 ? '🥈' : r.place === 3 ? '🥉' : '🏁'}
          </span>
          <div>
            <strong>{r.ms === null ? 'You quit' : solo ? 'Finished' : r.place === 1 ? 'You won!' : `${ordinal(r.place)} of ${r.of}`}</strong>
            <small>{run.course.name}</small>
          </div>
          {r.ms !== null ? <b className={styles.time}>{formatRaceTime(r.ms)}</b> : null}
        </div>

        {!solo ? (
          <ol className={styles.table}>
            {r.field.map((f, i) => (
              <li key={f.name + i} className={f.you ? styles.me : ''}>
                <span>{i + 1}</span>
                <em>{f.you ? 'You' : f.name}</em>
                <b>{f.ms === null ? '…' : formatRaceTime(f.ms)}</b>
                <small>{f.ms !== null && r.ms !== null && !f.you ? formatGap(f.ms - r.ms) : ''}</small>
              </li>
            ))}
          </ol>
        ) : null}

        {r.reward ? (
          <div className={styles.reward} aria-label="Racing rewards">
            <p className={styles.xp}>
              <b>+{r.reward.xp} XP</b> <span>{r.reward.rank.emoji} {r.reward.rank.name}</span>
            </p>
            {r.reward.rankedUp ? <p className={`${styles.chip} ${styles.good}`}>Rank up! You are now {r.reward.rank.emoji} {r.reward.rank.name}</p> : null}
            {r.reward.badges.length > 0 ? (
              <ul className={styles.badges}>
                {r.reward.badges.map((id) => (
                  <li key={id}>
                    <i aria-hidden="true">{badgeById(id)?.emoji}</i>
                    <span>
                      <b>{badgeById(id)?.name}</b>
                      <small>New badge</small>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {board.state === 'sending' ? <p className={styles.chip}>Sending your time to the board…</p> : null}
        {board.state === 'counted' ? (
          <p className={`${styles.chip} ${styles.good}`}>
            <Trophy size={14} aria-hidden="true" />{' '}
            {board.personalBest ? 'New personal best! ' : ''}
            {board.mine ? `You're #${board.mine.rank} on the board` : 'On the board'}
            {!board.personalBest && board.mine ? ` · best ${formatRaceTime(board.mine.ms)}` : ''}
          </p>
        ) : null}
        {board.state === 'refused' ? <p className={`${styles.chip} ${styles.warn}`}>Not counted: {board.message}</p> : null}

        <div className={styles.gridButtons}>
          <button type="button" className={styles.ghost} onClick={endRun}>
            Done
          </button>
          <button
            type="button"
            className={styles.start}
            onClick={() => {
              hapticTap()
              again(drive?.car.model ?? 'corolla')
            }}
          >
            <RotateCcw size={16} aria-hidden="true" /> Race again
          </button>
        </div>
      </div>
    )
  }
  return null
}

