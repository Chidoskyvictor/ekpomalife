'use client'

import { Bot, ChevronDown, Flag, MapPin, Search, Timer, Users, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AppEmpty, AppLoading } from '@/components/hud/phone/app-state'
import { hapticTap } from '@/components/hud/haptic'
import { rideLookAt, rideMinute } from '@/components/travel/ride-environment'
import { useGame } from '@/hooks/use-game'
import { useGarage } from '@/lib/game/cars-api'
import { NO_UPGRADES } from '@/lib/game/race-rewards'
import { RACE_FEE } from '@/lib/game/cars-rules'
import { driveTelemetry, useDrive } from '@/lib/game/drive'
import { ROAD_PLACES, placeSpot } from '@/lib/game/drive-road'
import { courses, formatRaceTime, kmLabel, sprintFrom, type Course } from '@/lib/game/race-courses'
import { beginRun } from '@/lib/game/race-run'
import { loadBoard, type Board } from '@/lib/game/race-trials-api'
import styles from './racing-sheet.module.css'

type Pick = string | 'anywhere'

/** A little map of the route itself: the real path, squeezed into the card. */
function RouteArt({ course }: { course: Course }) {
  const d = useMemo(() => {
    const pts = course.pts.filter((_, i) => i % 6 === 0 || i === course.pts.length - 1)
    const xs = pts.map((p) => p[0])
    const zs = pts.map((p) => p[1])
    const minX = Math.min(...xs)
    const minZ = Math.min(...zs)
    const w = Math.max(1, Math.max(...xs) - minX)
    const h = Math.max(1, Math.max(...zs) - minZ)
    const k = Math.min(116 / w, 44 / h)
    const ox = (136 - w * k) / 2
    const oz = (56 - h * k) / 2
    return pts.map((p, i) => `${i ? 'L' : 'M'}${(ox + (p[0] - minX) * k).toFixed(1)} ${(oz + (p[1] - minZ) * k).toFixed(1)}`).join(' ')
  }, [course])
  return (
    <svg viewBox="0 0 136 56" className={styles.art} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <path d={d} className={styles.artRoad} />
      <path d={d} className={styles.artLine} />
    </svg>
  )
}

/** The racing sheet: pick a road, then a time trial alone or host a race (AI drivers, or players for a stake). */
export function RacingSheet({ open, onClose, onPlayers }: { open: boolean; onClose: () => void; onPlayers: () => void }) {
  const { notifyToast } = useGame()
  const drive = useDrive()
  const garage = useGarage(open)
  const [picked, setPicked] = useState<Pick>('expressway-flat-out')
  const [boards, setBoards] = useState<Record<string, Board | 'error'>>({})
  const [hosting, setHosting] = useState(false)
  const [rivals, setRivals] = useState(2)
  const [dest, setDest] = useState('')
  const [where, setWhere] = useState('')
  const [tall, setTall] = useState(false)
  const list = useMemo(() => (open ? courses() : []), [open])

  // Fetch every board once when the sheet opens: the cards show your best, the table the picked route's top 10
  useEffect(() => {
    if (!open) return
    let stale = false
    for (const c of courses()) {
      void loadBoard(c.id).then((res) => {
        if (stale) return
        setBoards((b) => ({ ...b, [c.id]: res.ok ? res : 'error' }))
      })
    }
    return () => {
      stale = true
    }
  }, [open])

  const course = list.find((c) => c.id === picked) ?? null
  const board = course ? boards[course.id] : undefined

  // Places far enough from where you stand to be a sprint finish
  const finishes = useMemo(() => {
    if (!open || picked !== 'anywhere') return []
    return ROAD_PLACES.flatMap((p) => {
      const spot = p.inside ? null : placeSpot(p.id)
      const far = spot ? Math.hypot(spot.x - driveTelemetry.x, spot.z - driveTelemetry.z) : 0
      return spot && far > 400 ? [{ ...p, far }] : []
    }).sort((a, b) => a.far - b.far)
  }, [open, picked])
  const wanted = where.trim().toLowerCase()
  const shown = (wanted ? finishes.filter((p) => p.label.toLowerCase().includes(wanted)) : finishes).slice(0, 8)
  const ready = picked === 'anywhere' ? Boolean(dest) : Boolean(course)

  if (!open) return null

  const go = (opponents: number) => {
    hapticTap()
    const model = drive?.car.model ?? 'corolla'
    // Your fitted upgrades and rank go on the grid; the clock says whether it is a night race
    const mine0 = { up: garage?.cars.find((c) => c.active)?.up ?? NO_UPGRADES, xp: garage?.xp ?? 0, night: rideLookAt(rideMinute()).level === 'night' }
    if (picked === 'anywhere') {
      const sprint = sprintFrom(driveTelemetry.x, driveTelemetry.z, driveTelemetry.h, dest)
      if (!sprint) {
        notifyToast("The roads don't lead there from here. Pick another finish.", false)
        return
      }
      beginRun(sprint, { rivals: opponents, model, named: false, ...mine0 })
    } else if (course) {
      beginRun(course, { rivals: opponents, model, named: true, ...mine0 })
    }
    onClose()
  }

  const rows = board && board !== 'error' ? board.board : []
  const mine = board && board !== 'error' ? board.mine : null

  return (
    <div className={`${styles.sheet} ${tall ? styles.tall : ''}`} role="dialog" aria-label="Racing">
      <button type="button" className={styles.grab} aria-label={tall ? 'Make the racing sheet smaller' : 'Make the racing sheet bigger'} aria-pressed={tall} onClick={() => setTall((t) => !t)}>
        <span />
        <ChevronDown size={14} aria-hidden="true" className={tall ? '' : styles.flip} />
      </button>
      <div className={styles.head}>
        <Flag size={18} aria-hidden="true" />
        <strong>Racing</strong>
        <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className={styles.scroll}>
        <p className={styles.intro}>
          Beat the clock for the board, or race AI drivers and players for the glory, or a stake: the winner takes the pot, less {Math.round(RACE_FEE * 100)}%.
        </p>


        <div className={styles.cards} role="radiogroup" aria-label="Pick a road">
          {list.map((c) => {
            const b = boards[c.id]
            const best = b && b !== 'error' ? b.mine : null
            return (
              <button key={c.id} type="button" role="radio" aria-checked={picked === c.id} className={`${styles.card} ${picked === c.id ? styles.on : ''}`} onClick={() => setPicked(c.id)}>
                <span className={styles.cardArt}>
                  <RouteArt course={c} />
                  <i aria-hidden="true">{c.icon}</i>
                </span>
                <strong>{c.name}</strong>
                <small>
                  {kmLabel(c.length)} · {c.kind === 'circuit' ? `${c.laps} laps` : 'Sprint'}
                </small>
                <em>{best ? `Your best ${formatRaceTime(best.ms)} · #${best.rank}` : 'No time yet'}</em>
              </button>
            )
          })}
          <button type="button" role="radio" aria-checked={picked === 'anywhere'} className={`${styles.card} ${styles.anywhere} ${picked === 'anywhere' ? styles.on : ''}`} onClick={() => setPicked('anywhere')}>
            <span className={styles.cardArt}>
              <MapPin size={34} aria-hidden="true" />
            </span>
            <strong>Sprint from here</strong>
            <small>Pick any finish</small>
            <em>Starts where you stand</em>
          </button>
        </div>

        <ol className={styles.steps}>
          <li>
            <b>1</b>
            <span>Pick a road</span>
          </li>
          <li>
            <b>2</b>
            <span>Time trial or host</span>
          </li>
          <li>
            <b>3</b>
            <span>GPS to the grid</span>
          </li>
        </ol>

        {hosting ? (
          <div className={styles.host}>
            <div className={styles.hostHead}>
              <strong>Who do you race?</strong>
              <button type="button" className={styles.link} onClick={() => setHosting(false)}>
                Back
              </button>
            </div>
            <div className={styles.rivals} role="radiogroup" aria-label="How many AI drivers">
              {[1, 2, 3].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={rivals === n} className={rivals === n ? styles.chipOn : ''} onClick={() => setRivals(n)}>
                  {n} AI
                </button>
              ))}
            </div>
            <button type="button" className={styles.primary} onClick={() => go(rivals)}>
              <Bot size={18} aria-hidden="true" /> Race {rivals} AI {rivals === 1 ? 'driver' : 'drivers'}
            </button>
            <p className={styles.note}>
              AI drivers are always up for it, free, and they can be beaten.
              {picked !== 'anywhere' ? ' Your time still counts for the board.' : ''}
            </p>
            <button type="button" className={styles.tint} onClick={onPlayers}>
              <Users size={18} aria-hidden="true" /> Race players for a stake
            </button>
          </div>
        ) : null}

        {picked === 'anywhere' ? (
          <div className={styles.picker}>
            <label className={styles.search}>
              <Search size={16} aria-hidden="true" />
              <input value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Search a finish" aria-label="Search where the sprint ends" autoCapitalize="none" autoCorrect="off" />
            </label>
            <div className={styles.places} role="radiogroup" aria-label="Where the sprint ends">
              {shown.map((p) => (
                <button key={p.id} type="button" role="radio" aria-checked={dest === p.id} className={dest === p.id ? styles.chipOn : ''} onClick={() => setDest(p.id)}>
                  <strong>{p.label}</strong>
                  <small>{kmLabel(p.far)}</small>
                </button>
              ))}
              {shown.length === 0 ? <p className={styles.note}>{finishes.length ? 'No place with that name.' : 'No finish far enough from here.'}</p> : null}
            </div>
            <p className={styles.note}>A sprint from where you stand has no board; it is for the race itself.</p>
          </div>
        ) : course ? (
          <section className={styles.board} aria-label={`Fastest times: ${course.name}`}>
            <h3>
              <TrophyMark /> Fastest · {course.name}
            </h3>
            {mine ? (
              <p className={styles.mine}>
                Your best <b>{formatRaceTime(mine.ms)}</b> · rank <b>#{mine.rank}</b>
              </p>
            ) : null}
            {board === undefined ? (
              <AppLoading label="Loading times…" rows={3} />
            ) : board === 'error' ? (
              <AppEmpty icon="📡">Couldn&apos;t load the board. Check your connection and reopen this sheet.</AppEmpty>
            ) : rows.length === 0 ? (
              <AppEmpty icon="🏆">No times yet. Run it first and the top spot is yours.</AppEmpty>
            ) : (
              <ol className={styles.table}>
                {rows.map((r) => (
                  <li key={r.rank} className={r.you ? styles.me : ''}>
                    <span>{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</span>
                    <em>
                      <i aria-hidden="true">{r.racerRank.emoji}</i> @{r.handle}
                    </em>
                    <small>
                      {r.car}
                      {r.upgrades ? <b className={styles.fitted}> {r.upgrades}</b> : null}
                    </small>
                    <b>{formatRaceTime(r.ms)}</b>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ) : null}
      </div>
      <div className={styles.actions}>
          {hosting ? null : (
            <>
              <button type="button" className={styles.primary} disabled={!ready} onClick={() => go(0)}>
                <Timer size={18} aria-hidden="true" /> Time trial
              </button>
              <button type="button" className={styles.tint} disabled={!ready} onClick={() => {
                  setHosting(true)
                  setTall(true)
                }}>
                <Users size={18} aria-hidden="true" /> Host a race
              </button>
            </>
          )}
      </div>

    </div>
  )
}

function TrophyMark() {
  return <span aria-hidden="true">🏆</span>
}
