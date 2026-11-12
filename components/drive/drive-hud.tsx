'use client'

import { ArrowUp, MapPin, Navigation, Search, X } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useGame } from '@/hooks/use-game'
import { parkCar } from '@/lib/game/cars-api'
import { driveInput, driveTelemetry, endDrive, kmh, setDriveDest, useDrive } from '@/lib/game/drive'
import { OSM_CREDIT, ROAD_PLACES, ROAD_SCALE, guide, placeSpot, roadById, roadPlaceNear, roadUnder, type Guidance } from '@/lib/game/drive-road'
import { hasInterior } from '@/lib/game/home-place'
import { pushNavigation } from '@/lib/navigation/safe-nav'
import { leaveRace, racesNow } from '@/lib/game/races-api'
import { RaceButton, RaceHud } from './race-hud'
import styles from './drive-hud.module.css'

/** Game metres as the distance a driver reads: "300 m", "1.2 km". */
function far(metres: number) {
  const real = metres / ROAD_SCALE
  return real >= 950 ? `${(real / 1000).toFixed(1)} km` : `${Math.max(10, Math.round(real / 10) * 10)} m`
}

/** A pedal: pressed for as long as a finger (or the mouse) is on it. */
function Pedal({ label, className, onChange, children }: { label: string; className: string; onChange: (down: boolean) => void; children: React.ReactNode }) {
  const [down, setDown] = useState(false)
  const set = (next: boolean) => {
    setDown(next)
    onChange(next)
  }
  return (
    <button
      type="button"
      aria-label={label}
      className={`${styles.pedal} ${className} ${down ? styles.down : ''}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        set(true)
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onLostPointerCapture={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  )
}

/** How far the knob slides each way for full lock (px). */
const STEER_TRAVEL = 46

/** The steering pad: put a thumb anywhere on it and slide left or right; the knob follows and springs back. */
function SteerPad() {
  const [turn, setTurn] = useState(0)
  const from = useRef<number | null>(null)
  const steer = (value: number) => {
    setTurn(value)
    // Sliding left steers left (+1)
    driveInput.steer = -value
  }
  const release = () => {
    from.current = null
    steer(0)
  }
  return (
    <div
      role="slider"
      aria-label="Steering: slide left or right"
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-valuenow={Math.round(turn * 10) / 10}
      className={styles.steer}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        // Touching either end steers that way at once; then the slide takes over
        const box = e.currentTarget.getBoundingClientRect()
        const start = (e.clientX - (box.left + box.width / 2)) / STEER_TRAVEL
        from.current = e.clientX - Math.max(-1, Math.min(1, start)) * STEER_TRAVEL
        steer(Math.max(-1, Math.min(1, start)))
      }}
      onPointerMove={(e) => {
        if (from.current === null) return
        steer(Math.max(-1, Math.min(1, (e.clientX - from.current) / STEER_TRAVEL)))
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className={`${styles.tri} ${styles.triLeft}`} aria-hidden="true" />
      <span className={styles.knob} style={{ transform: `translateX(${turn * STEER_TRAVEL}px)`, transition: from.current === null ? 'transform 0.16s ease-out' : 'none' }} aria-hidden="true" />
      <span className={`${styles.tri} ${styles.triRight}`} aria-hidden="true" />
    </div>
  )
}

/**
 * On-screen driving: a steering pad under the left thumb, brake and gas pedals under the right
 * (hold the brake to reverse), speed and the road's name just above them. "Where to?" picks a place and
 * turns on the direction arrow; it is optional. "Park" shows when you stop beside a place.
 */
export function DriveHud() {
  const drive = useDrive()
  const router = useRouter()
  const pathname = usePathname()
  const { select, applyServerState, notifyToast } = useGame()
  const [speed, setSpeed] = useState(0)
  const [near, setNear] = useState<{ id: string; label: string } | null>(null)
  const [dents, setDents] = useState(0)
  const [roadName, setRoadName] = useState('')
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const [racing, setRacing] = useState(false)
  const [query, setQuery] = useState('')
  const [way, setWay] = useState<{ g: Guidance; bearing: number } | null>(null)
  const destId = drive?.dest?.id ?? null
  const active = Boolean(drive)

  useEffect(() => {
    if (!active) return
    setDents(0)
    const id = window.setInterval(() => {
      const { x, z, h } = driveTelemetry
      setSpeed(kmh(driveTelemetry.speed))
      const spot = Math.abs(driveTelemetry.speed) < 1.6 ? roadPlaceNear(x, z, destId) : null
      setNear((prev) => (prev?.id === spot?.id ? prev : spot))
      setRoadName(roadUnder(x, z)?.road.name ?? '')
      setDents((prev) => {
        if (driveTelemetry.dents > prev) notifyToast('Ouch! That left a dent.', false)
        return driveTelemetry.dents
      })
      const g = destId ? guide(x, z, h, destId) : null
      if (!g) {
        setWay(null)
        return
      }
      // Where the next point is, measured from straight ahead (clockwise)
      const vx = g.x - x
      const vz = g.z - z
      const bearing = Math.atan2(vx * -Math.cos(h) + vz * Math.sin(h), vx * Math.sin(h) + vz * Math.cos(h))
      setWay({ g, bearing })
    }, 200)
    return () => window.clearInterval(id)
  }, [active, destId, notifyToast])

  if (!drive) return null

  /** Leave the car at a place and get out there. Getting out mid-race is giving up. */
  const park = async (placeId: string, x: number, z: number) => {
    setBusy(true)
    try {
      const race = racesNow().mine
      if (race && (race.status === 'open' || race.status === 'running')) await leaveRace(race.id)
      const res = await parkCar(placeId, x, z, driveTelemetry.dents)
      if (!res.ok) {
        notifyToast(res.error ?? 'Could not park here.', false)
        return
      }
      applyServerState(res.state)
      notifyToast(res.message, true)
      endDrive()
      if (hasInterior(placeId) || placeId === 'home') {
        select(null)
        if (pathname !== '/room') pushNavigation(router, '/room', pathname)
      } else {
        select(placeId)
      }
    } finally {
      setBusy(false)
    }
  }

  const skip = () => {
    if (!drive.dest) return
    // Places not on these roads yet have no kerb to stop at: you just arrive
    const spot = placeSpot(drive.dest.id)
    void park(drive.dest.id, spot?.x ?? 0, spot?.z ?? 0)
  }

  /** Give up the drive: the car goes back to where it started (any new dents stay on it). */
  const cancel = () => {
    const race = racesNow().mine
    if (race && (race.status === 'open' || race.status === 'running')) void leaveRace(race.id)
    if (driveTelemetry.dents > 0) void park(drive.fromPlace, drive.start.x, drive.start.z)
    else endDrive()
  }

  const g = way?.g ?? null
  const wanted = query.trim().toLowerCase()
  const list = ROAD_PLACES.filter((p) => !wanted || p.label.toLowerCase().includes(wanted))
  // Behind you (the far side of the highway, or you set off the wrong way): say so plainly
  const behind = Boolean(way && Math.abs(way.bearing) > 2.2 && g && g.turn !== 'left' && g.turn !== 'right')
  const headline = !g
    ? ''
    : behind
      ? `Turn around: ${drive.dest?.label ?? g.onto} is behind you`
      : g.turn === 'arrive'
      ? `${g.onto} is on your ${g.side}`
      : g.turn === 'straight'
        ? `Straight on to ${g.onto}`
        : `Turn ${g.turn} onto ${g.onto}`

  return (
    <div className={styles.root} aria-label="Driving controls">
      <div className={styles.top}>
        <button type="button" className={styles.round} aria-label="Stop driving" disabled={busy} onClick={cancel}>
          <X size={16} aria-hidden="true" />
        </button>
        <button type="button" className={styles.pill} disabled={busy} onClick={() => setPicking(true)}>
          {drive.dest ? <Navigation size={15} aria-hidden="true" /> : <MapPin size={15} aria-hidden="true" />}
          <span>{drive.dest ? drive.dest.label : 'Where to?'}</span>
        </button>
        <RaceButton onClick={() => setRacing(true)} />
      </div>

      {drive.dest ? (
        <div className={styles.guide} role="status">
          {g ? (
            <span className={styles.arrow} aria-hidden="true">
              <ArrowUp size={20} style={{ transform: `rotate(${way!.bearing}rad)` }} />
            </span>
          ) : null}
          <div className={styles.guideText}>
            <strong>{g ? headline : `Going to ${drive.dest.label}`}</strong>
            <small>{g ? (g.turn === 'arrive' ? `${far(g.in)} to go` : `in ${far(g.in)} · ${far(g.left)} to go`) : 'Not on these roads yet'}</small>
          </div>
          <button type="button" className={styles.skip} disabled={busy} onClick={skip}>
            Skip ▸
          </button>
          <button type="button" className={styles.clear} aria-label="Clear destination" onClick={() => setDriveDest(null)}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {dents > 0 ? <p className={styles.dents}>🔧 {dents} new {dents === 1 ? 'dent' : 'dents'}</p> : null}

      <div className={styles.fill} />
      {near ? (
        <button type="button" className={styles.park} disabled={busy} onClick={() => void park(near.id, driveTelemetry.x, driveTelemetry.z)}>
          🅿️ {busy ? 'Parking…' : `Park at ${near.label}`}
        </button>
      ) : null}
      <div className={styles.dial} aria-live="off">
        <span>
          <strong>{speed}</strong> km/h
        </span>
        {roadName ? <small>{roadName}</small> : null}
      </div>
      <div className={styles.pad}>
        <SteerPad />
        <div className={styles.pedals}>
          <Pedal label="Brake (hold to reverse)" className={styles.brake} onChange={(d) => (driveInput.brake = d)}>
            <strong>Brake</strong>
            <small>hold = reverse</small>
          </Pedal>
          <Pedal label="Gas" className={styles.gas} onChange={(d) => (driveInput.gas = d)}>
            <strong>Gas</strong>
          </Pedal>
        </div>
      </div>
      <p className={styles.credit}>{OSM_CREDIT}</p>

      <RaceHud open={racing && !picking} onClose={() => setRacing(false)} />

      {picking ? (
        <div className={styles.sheet} role="dialog" aria-label="Where are you going?">
          <div className={styles.sheetHead}>
            <label className={styles.search}>
              <Search size={16} aria-hidden="true" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Where are you going?" aria-label="Search places" />
            </label>
            <button type="button" className={styles.round} aria-label="Close" onClick={() => setPicking(false)}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className={styles.places}>
            {list.map((p) => (
              <button
                key={p.id}
                type="button"
                className={styles.place}
                onClick={() => {
                  setDriveDest({ id: p.id, label: p.label })
                  setPicking(false)
                  setQuery('')
                }}
              >
                <strong>{p.label}</strong>
                <small>{p.inside ? `Through ${ROAD_PLACES.find((host) => host.id === p.inside)?.label ?? 'the gate'}` : roadById(p.road).name || 'Side street'}</small>
              </button>
            ))}
            {list.length === 0 ? <p className={styles.none}>No place by that name on these roads yet.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
