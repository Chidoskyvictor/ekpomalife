'use client'

import { notFound, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { StreetCanvas } from '@/components/drive/street-world'
import type { Peer } from '@/lib/game/club-live'
import { DriveHud } from '@/components/drive/drive-hud'
import { RadioDock } from '@/components/radio/radio-dock'
import { GameProvider } from '@/hooks/use-game'
import { driveView, startDrive } from '@/lib/game/drive'
import { beginRun, pressStart } from '@/lib/game/race-run'
import { courseById } from '@/lib/game/race-courses'
import { driveStartFrom, roadById, spotAt } from '@/lib/game/drive-road'

/** Development only: the street world without signing in. `?at=<place id>&time=21:30` */
function Inner() {
  const q = useSearchParams()
  const start = useMemo(() => {
    // `?road=<id>&s=<m>&off=<m>&h=<rad>` puts the car anywhere on a road instead
    const rid = q.get('road')
    if (rid) {
      const sp = spotAt(roadById(rid).id, Number(q.get('s') ?? 100), Number(q.get('off') ?? 8))
      return { x: sp.x, z: sp.z, h: q.get('h') ? Number(q.get('h')) : Math.atan2(sp.dx, sp.dz) }
    }
    return driveStartFrom(q.get('at') ?? 'aau-gate')
  }, [q])
  useEffect(() => {
    driveView.yaw = Number(q.get('yaw') ?? 0)
    driveView.tilt = Number(q.get('tilt') ?? 0)
    driveView.zoom = Number(q.get('zoom') ?? 1)
  }, [q])
  const peers = useRef(new Map<string, Peer>())
  // `?hud=1` mounts the real driving controls over the scene; `?race=<course id>&phase=grid` starts a run
  const hud = q.get('hud') === '1'
  // `?radio=stub` answers the station list locally (the dev API may be offline); streams stay silent here
  useEffect(() => {
    if (q.get('radio') !== 'stub') return
    const real = window.fetch.bind(window)
    const list = ['Cool FM', 'Wazobia FM', 'Beat FM', 'Naija Info FM'].map((name, i) => ({ id: `s${i}`, name, streamUrl: 'about:blank', logo: null, city: i % 2 ? 'Abuja' : 'Lagos', genre: 'Pop', frequency: `${96 + i}.9 FM` }))
    window.fetch = (input, init) => (String(input).includes('/radio/stations') ? Promise.resolve(new Response(JSON.stringify({ ok: true, stations: list }), { headers: { 'content-type': 'application/json' } })) : real(input, init))
    return () => {
      window.fetch = real
    }
  }, [q])
  useEffect(() => {
    if (!hud) return
    startDrive({ dest: null, car: { id: 'dev', model: 'gt3', color: '#c94f4f' }, start, fromPlace: 'aau-gate' })
    const race = q.get('race')
    const course = race ? courseById(race) : null
    if (course) beginRun(course, { rivals: 3, model: 'gt3', named: q.get('phase') === 'togrid' })
    // `phase=racing` presses Start (the scene turns the lights green after the countdown)
    if (course && q.get('phase') === 'racing') window.setTimeout(pressStart, 1500)
  }, [hud, q, start])
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      <StreetCanvas car={{ model: 'gt3', color: '#c94f4f' }} start={start} send={() => {}} peers={peers} roster={0} />
      {q.get('dock') === '1' ? <RadioDock /> : null}
      {hud ? (
        <GameProvider guest>
          <DriveHud />
        </GameProvider>
      ) : null}
    </div>
  )
}

export default function DevDrive() {
  if (process.env.NODE_ENV === 'production') notFound()
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  )
}
