'use client'

import { Flag, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import { RACE_FEE, RACE_MAX_RACERS, RACE_STAKES, racePrize } from '@/lib/game/cars-rules'
import { driveCommand, driveTelemetry, setDriveDest } from '@/lib/game/drive'
import { ROAD_PLACES, placeSpot } from '@/lib/game/drive-road'
import { formatNaira } from '@/lib/game/live'
import { searchPlayers, type PlayerCard } from '@/lib/game/hostels-api'
import { finishRace, hostRace, inviteToRace, joinRace, leaveRace, loadRaces, startRace, useRaces, type Race } from '@/lib/game/races-api'
import { newIdempotencyKey } from '@/lib/game/room-api'
import styles from './race-hud.module.css'

/** Cars line up one behind the other at the start, this far apart (game metres). */
const GRID_GAP = 7
/** How near the finish your phone tells the server "I am there" (the server allows a little more). */
const FINISH_REACH = 24

const live = (race: Race | null): race is Race => Boolean(race && (race.status === 'open' || race.status === 'running'))

/** The pill in the top row: opens the race sheet, and shows how full your race is. */
export function RaceButton({ onClick }: { onClick: () => void }) {
  const { mine, open } = useRaces()
  const label = live(mine) ? (mine.status === 'open' ? `${mine.racers.length}/${RACE_MAX_RACERS}` : 'Racing') : open.some((r) => r.invited) ? 'Invited!' : open.length > 0 ? `Race · ${open.length}` : 'Race'
  return (
    <button type="button" className={`${styles.pill} ${live(mine) || open.length > 0 ? styles.hot : ''}`} onClick={onClick}>
      <Flag size={15} aria-hidden="true" />
      <span>{label}</span>
    </button>
  )
}

/**
 * Drag races while you drive: host one to a place (with a stake if you like) or join an open one;
 * when the host starts it every car is put on the line, counted down, and the lit lane leads to
 * the finish. First there takes the pot.
 */
export function RaceHud({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { applyServerState, notifyToast } = useGame()
  const { mine, open: openRaces, skew } = useRaces()
  const [busy, setBusy] = useState(false)
  const [destId, setDestId] = useState('')
  const [stake, setStake] = useState(RACE_STAKES[1]!)
  const [count, setCount] = useState<string | null>(null)
  const [result, setResult] = useState<Race | null>(null)
  const [name, setName] = useState('')
  const [found, setFound] = useState<PlayerCard[]>([])
  const [asked, setAsked] = useState<string[]>([])
  const lined = useRef('')
  const told = useRef('')
  const claiming = useRef(0)
  const key = useRef('')
  const active = live(mine)
  const running = mine?.status === 'running'

  // Keep the list fresh: fast while you are in a race, slower while only looking, slowest otherwise
  useEffect(() => {
    void loadRaces()
    const id = window.setInterval(() => void loadRaces(), active ? 2000 : open ? 3500 : 10000)
    return () => window.clearInterval(id)
  }, [active, open])

  // Invite by name: search as you type (a short pause first)
  useEffect(() => {
    const q = name.trim().replace(/^@/, '')
    if (q.length < 2) {
      setFound([])
      return
    }
    let stale = false
    const id = window.setTimeout(() => {
      void searchPlayers(q).then((res) => {
        if (!stale && res.ok) setFound(res.players.slice(0, 4))
      })
    }, 350)
    return () => {
      stale = true
      window.clearTimeout(id)
    }
  }, [name])

  // The race started: onto the line, engine held, destination set (which lights the lane)
  useEffect(() => {
    if (!mine || !running || lined.current === mine.id) return
    lined.current = mine.id
    const slot = mine.racers.find((r) => r.you)?.slot ?? 0
    const { x, z, h } = mine.start
    driveCommand.warp = { x: x - Math.sin(h) * GRID_GAP * slot, z: z - Math.cos(h) * GRID_GAP * slot, h }
    driveCommand.hold = true
    setDriveDest({ id: mine.dest.id, label: mine.dest.label })
    onClose()
  }, [mine, running, onClose])

  // Countdown, then watch for the finish
  useEffect(() => {
    if (!mine || !running || !mine.startsAt) return
    const { id, startsAt, dest } = mine
    const tick = window.setInterval(() => {
      const left = startsAt - (Date.now() + skew)
      if (left > 0) {
        driveCommand.hold = true
        setCount(left > 3000 ? 'Get ready' : String(Math.ceil(left / 1000)))
        return
      }
      driveCommand.hold = false
      setCount(left > -1200 ? 'GO!' : null)
      if (Math.hypot(dest.x - driveTelemetry.x, dest.z - driveTelemetry.z) < FINISH_REACH && Date.now() - claiming.current > 1500) {
        claiming.current = Date.now()
        void finishRace(id, driveTelemetry.x, driveTelemetry.z).then((res) => {
          if (res.ok) applyServerState(res.state)
        })
      }
    }, 100)
    return () => {
      window.clearInterval(tick)
      driveCommand.hold = false
      setCount(null)
    }
  }, [mine?.id, running, mine?.startsAt, skew]) // eslint-disable-line react-hooks/exhaustive-deps

  // Over: show who won (once), or say it was called off
  useEffect(() => {
    if (!mine || told.current === mine.id) return
    if (mine.status === 'done') {
      told.current = mine.id
      setResult(mine)
    } else if (mine.status === 'cancelled') {
      told.current = mine.id
      notifyToast(mine.stake > 0 ? 'Race called off. Your stake is back.' : 'Race called off.', false)
    }
  }, [mine, notifyToast])

  const run = async (call: () => ReturnType<typeof startRace>) => {
    setBusy(true)
    try {
      const res = await call()
      if (!res.ok) {
        notifyToast(res.error ?? 'Something went wrong. Try again.', false)
        return false
      }
      applyServerState(res.state)
      if (res.message) notifyToast(res.message, true)
      return true
    } finally {
      setBusy(false)
    }
  }

  // Finishes far enough away to be a race
  const finishes = ROAD_PLACES.filter((p) => {
    if (p.inside) return false
    const spot = placeSpot(p.id)
    return spot && Math.hypot(spot.x - driveTelemetry.x, spot.z - driveTelemetry.z) > 160
  })
  const pick = finishes.find((p) => p.id === destId) ?? finishes[0]

  const host = () => {
    const spot = pick ? placeSpot(pick.id) : null
    if (!pick || !spot) return
    key.current ||= newIdempotencyKey()
    const { x, z, h } = driveTelemetry
    void run(() => hostRace({ destId: pick.id, stake, x, z, h, destX: spot.x, destZ: spot.z }, key.current)).then((ok) => {
      if (ok) key.current = ''
    })
  }

  return (
    <>
      {count ? (
        <div className={styles.count} role="status" aria-live="assertive">
          <strong className={count === 'GO!' ? styles.go : count.length > 1 ? styles.words : ''}>{count}</strong>
          {mine && count !== 'GO!' ? <small>Race to {mine.dest.label}</small> : null}
        </div>
      ) : null}

      {result ? (
        <div className={styles.result} role="dialog" aria-label="Race result">
          <span aria-hidden="true">{result.youWon ? '🏆' : '🏁'}</span>
          <strong>{result.youWon ? 'You won!' : `@${result.winner ?? 'someone'} won`}</strong>
          <small>
            {result.youWon
              ? result.prize
                ? `${formatNaira(result.prize)} is in your wallet.`
                : `First to ${result.dest.label}.`
              : result.stake > 0
                ? `Your ${formatNaira(result.stake)} stake went to the winner.`
                : `First to ${result.dest.label}.`}
          </small>
          <button type="button" className={styles.primary} onClick={() => setResult(null)}>
            OK
          </button>
        </div>
      ) : null}

      {open ? (
        <div className={styles.sheet} role="dialog" aria-label="Drag race">
          <div className={styles.head}>
            <strong>{active ? `Race to ${mine.dest.label}` : 'Drag race'}</strong>
            <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          {active ? (
            <div className={styles.body}>
              <p className={styles.note}>
                {mine.stake > 0
                  ? `${formatNaira(mine.stake)} each · winner takes ${formatNaira(racePrize(mine.stake, mine.racers.length))}`
                  : 'No stake: racing for the bragging rights.'}
              </p>
              <div className={styles.racers}>
                {mine.racers.map((r) => (
                  <span key={r.slot} className={r.you ? styles.you : ''}>
                    @{r.name}
                    {r.host ? ' ★' : ''}
                  </span>
                ))}
              </div>
              {mine.status === 'open' && mine.youHost ? (
                <>
                  <label className={styles.field}>
                    <span>Invite</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Search a name" aria-label="Search a player to invite" autoCapitalize="none" autoCorrect="off" />
                  </label>
                  {found.map((p) => (
                    <div key={p.userId} className={styles.open}>
                      <div>
                        <strong>{p.displayName}</strong>
                        <small>@{p.username}</small>
                      </div>
                      <button
                        type="button"
                        className={styles.primary}
                        disabled={busy || asked.includes(p.userId)}
                        onClick={() => void run(() => inviteToRace(mine.id, p.userId)).then((ok) => ok && setAsked((list) => [...list, p.userId]))}
                      >
                        {asked.includes(p.userId) ? 'Invited' : 'Invite'}
                      </button>
                    </div>
                  ))}
                </>
              ) : null}
              {mine.status === 'open' ? (
                <div className={styles.row}>
                  <button type="button" className={styles.ghost} disabled={busy} onClick={() => void run(() => leaveRace(mine.id))}>
                    {mine.youHost ? 'Call it off' : 'Leave'}
                  </button>
                  {mine.youHost ? (
                    <button type="button" className={styles.primary} disabled={busy || mine.racers.length < 2} onClick={() => void run(() => startRace(mine.id))}>
                      {mine.racers.length < 2 ? 'Waiting for racers…' : 'Start race'}
                    </button>
                  ) : (
                    <p className={styles.wait}>Waiting for @{mine.host} to start…</p>
                  )}
                </div>
              ) : (
                <button type="button" className={styles.ghost} disabled={busy} onClick={() => void run(() => leaveRace(mine.id)).then((ok) => ok && onClose())}>
                  {mine.stake > 0 ? 'Give up (you lose your stake)' : 'Give up'}
                </button>
              )}
            </div>
          ) : (
            <div className={styles.body}>
              {openRaces.length > 0 ? (
                <>
                  <h3>Join a race</h3>
                  {openRaces.map((race) => (
                    <div key={race.id} className={styles.open}>
                      <div>
                        <strong>{race.invited ? `@${race.host} invited you` : `To ${race.dest.label}`}</strong>
                        <small>
                          {race.invited ? `To ${race.dest.label}` : `@${race.host}`} · {race.racers.length}/{RACE_MAX_RACERS} · {race.stake > 0 ? `${formatNaira(race.stake)} stake` : 'no stake'}
                        </small>
                      </div>
                      <button
                        type="button"
                        className={styles.primary}
                        disabled={busy}
                        onClick={() => {
                          const k = newIdempotencyKey()
                          void run(() => joinRace(race.id, k))
                        }}
                      >
                        Join
                      </button>
                    </div>
                  ))}
                </>
              ) : null}
              <h3>Host a race</h3>
              {pick ? (
                <>
                  <label className={styles.field}>
                    <span>Finish</span>
                    <select value={pick.id} onChange={(e) => setDestId(e.target.value)}>
                      {finishes.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className={styles.stakes} role="radiogroup" aria-label="Stake each racer pays">
                    {RACE_STAKES.map((s) => (
                      <button key={s} type="button" role="radio" aria-checked={stake === s} className={stake === s ? styles.on : ''} onClick={() => setStake(s)}>
                        {s === 0 ? 'Free' : s >= 1000 ? `₦${s / 1000}k` : formatNaira(s)}
                      </button>
                    ))}
                  </div>
                  <p className={styles.note}>
                    {stake > 0
                      ? `Everyone pays ${formatNaira(stake)} to join. First to the finish takes the pot, less ${Math.round(RACE_FEE * 100)}%.`
                      : 'Free to join. The race starts from where your car is now.'}
                  </p>
                  <button type="button" className={styles.primary} disabled={busy} onClick={host}>
                    {stake > 0 ? `Host race · ${formatNaira(stake)}` : 'Host race'}
                  </button>
                </>
              ) : (
                <p className={styles.note}>No finish far enough from here.</p>
              )}
            </div>
          )}
        </div>
      ) : null}
    </>
  )
}
